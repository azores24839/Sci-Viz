"""
上海交通大学国家级科研平台 图片/视频爬虫
从 https://www.sjtu.edu.cn/gjjkypt/index.html 页面中提取所有平台链接，
逐站抓取图片和视频资源。
"""

import os
import re
import json
import time
import hashlib
import argparse
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

OUTPUT_ROOT = Path(__file__).parent / "sjtu_platform_media"
LOG_FILE = OUTPUT_ROOT / "scrape_log.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico", ".tiff", ".avif"}
VIDEO_EXTS = {".mp4", ".webm", ".ogg", ".ogv", ".mov", ".avi", ".mkv", ".flv"}

PLATFORMS = [
    {"name": "转化医学国家重大科技基础设施", "url": "https://transmed.sjtu.edu.cn/#/", "short": "transmed"},
    {"name": "海洋工程国家重点实验室", "url": "http://oe.sjtu.edu.cn/", "short": "oe"},
    {"name": "机械系统与振动国家重点实验室", "url": "http://msv.sjtu.edu.cn/", "short": "msv"},
    {"name": "金属基复合材料国家重点实验室", "url": "http://sklcm.sjtu.edu.cn/", "short": "sklcm"},
    {"name": "区域光纤通信网与新型光通信系统国家重点实验室", "url": "http://loct.sjtu.edu.cn/", "short": "loct"},
    {"name": "医学基因组学国家重点实验室", "url": "http://www.rjh.com.cn/pages/Yixuejiyin/index.shtml", "short": "rjh_genome"},
    {"name": "微生物代谢国家重点实验室", "url": "http://skmml.sjtu.edu.cn/", "short": "skmml"},
    {"name": "未来媒体网络协同创新中心", "url": "http://cmic.sjtu.edu.cn", "short": "cmic"},
    {"name": "高新船舶与深海开发装备协同创新中心", "url": "http://cisse.sjtu.edu.cn/", "short": "cisse"},
    {"name": "国家双创示范基地（双创推进办公室）", "url": "http://inen.sjtu.edu.cn/", "short": "inen"},
    {"name": "创新设计中心", "url": "https://design.sjtu.edu.cn/", "short": "design"},
]


def _session():
    s = requests.Session()
    s.headers.update(HEADERS)
    s.timeout = 20
    return s


def safe_filename(url):
    parsed = urlparse(url)
    path = unquote(parsed.path)
    name = Path(path).name
    if not name or len(name) > 120:
        name = hashlib.md5(url.encode()).hexdigest()[:16]
    return name


def classify_url(url):
    lower = url.lower()
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    if ext in VIDEO_EXTS:
        return "video"
    if ext in IMAGE_EXTS:
        return "image"
    if "/video" in lower or "video" in lower:
        return "video"
    return "image"


def extract_media_urls(html, base_url):
    media = set()
    soup = BeautifulSoup(html, "html.parser")

    for img in soup.find_all("img"):
        for attr in ["src", "data-src", "data-original", "data-lazy-src", "data-bg"]:
            src = img.get(attr)
            if src and not src.startswith("data:"):
                media.add(urljoin(base_url, src))

    for video in soup.find_all("video"):
        src = video.get("src")
        if src:
            media.add(urljoin(base_url, src))
        for source in video.find_all("source"):
            src = source.get("src")
            if src:
                media.add(urljoin(base_url, src))

    for iframe in soup.find_all("iframe"):
        src = iframe.get("src")
        if src and ("player" in src.lower() or "video" in src.lower() or "bilibili" in src.lower() or "youku" in src.lower()):
            media.add(("video_page", urljoin(base_url, src)))

    for a in soup.find_all("a", href=True):
        href = a["href"].lower()
        ext = Path(urlparse(a["href"]).path).suffix.lower()
        if ext in VIDEO_EXTS or ext in IMAGE_EXTS:
            media.add(urljoin(base_url, a["href"]))

    for tag in soup.find_all(style=True):
        style = tag["style"]
        for match in re.finditer(r'url\(["\']?([^)"\']+)', style, re.IGNORECASE):
            url_str = match.group(1)
            if not url_str.startswith("data:"):
                media.add(urljoin(base_url, url_str))

    style_tags = soup.find_all("style")
    for st in style_tags:
        for match in re.finditer(r'url\(["\']?([^)"\']+)', st.get_text(), re.IGNORECASE):
            url_str = match.group(1)
            if not url_str.startswith("data:"):
                media.add(urljoin(base_url, url_str))

    for obj in soup.find_all("object"):
        data = obj.get("data")
        if data:
            media.add(urljoin(base_url, data))

    for embed in soup.find_all("embed"):
        src = embed.get("src")
        if src:
            media.add(urljoin(base_url, src))

    clean = set()
    for item in media:
        if isinstance(item, tuple):
            clean.add(item)
        else:
            parsed = urlparse(item)
            ext = Path(parsed.path).suffix.lower()
            if ext in IMAGE_EXTS or ext in VIDEO_EXTS or "image" in item.lower() or "video" in item.lower() or "upload" in item.lower() or "photo" in item.lower() or "pic" in item.lower():
                clean.add(item)
            elif not ext or ext in {".html", ".htm", ".php", ".asp", ".jsp", "/"}:
                pass
            else:
                clean.add(item)

    return clean


def fetch_subpages(html, base_url, domain, max_depth=1):
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full = urljoin(base_url, href)
        parsed = urlparse(full)
        if parsed.netloc == domain or parsed.netloc.endswith("." + domain):
            if parsed.path.lower().endswith(("/", ".html", ".htm", ".shtml", ".php", ".asp", ".jsp")):
                if "#" not in parsed.path or full.split("#")[0] != base_url.split("#")[0]:
                    links.add(full.split("#")[0].split("?")[0])

    same_page = base_url.split("#")[0].split("?")[0]
    links.discard(same_page)

    return list(links)[:30]


def download_media(url, save_dir, session, timeout=15):
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    name = safe_filename(url)

    if not ext or ext in {".html", ".htm", ".php", ".asp", ".jsp"}:
        return None

    filepath = save_dir / name
    if filepath.exists():
        return filepath

    try:
        resp = session.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()

        ct = resp.headers.get("content-type", "")
        if "text/html" in ct and ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
            return None

        if not ext:
            if "video" in ct:
                ext = ".mp4"
            elif "image" in ct or "octet-stream" in ct:
                ext = ".jpg"
            else:
                return None
            name = name + ext
            filepath = save_dir / name

        filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)

        file_size = filepath.stat().st_size
        if file_size < 500:
            filepath.unlink()
            return None

        return filepath
    except Exception as e:
        return None


def scrape_platform(platform, max_depth=1, delay=1.0):
    name = platform["name"]
    short = platform["short"]
    url = platform["url"].rstrip("/")
    domain = urlparse(url).netloc

    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"  URL: {url}")
    print(f"{'='*60}")

    save_dir = OUTPUT_ROOT / short
    save_dir.mkdir(parents=True, exist_ok=True)
    session = _session()

    stats = {"images": 0, "videos": 0, "pages": 0, "errors": []}

    all_urls = [url]
    visited = set()

    if max_depth >= 1:
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            subpages = fetch_subpages(resp.text, url, domain)
            all_urls.extend(subpages)
            stats["pages"] += 1
        except Exception as e:
            print(f"  首页获取失败: {e}")
            stats["errors"].append(f"首页失败: {e}")
            return stats

    for page_url in all_urls[:50]:
        if page_url in visited:
            continue
        visited.add(page_url)

        print(f"  抓取页面: {page_url}")
        try:
            resp = session.get(page_url, timeout=20)
            resp.raise_for_status()
            stats["pages"] += 1
        except Exception as e:
            print(f"    跳过: {e}")
            stats["errors"].append(f"子页面失败 {page_url}: {e}")
            continue

        media_urls = extract_media_urls(resp.text, page_url)
        print(f"    发现 {len(media_urls)} 个媒体URL")

        for media_url in media_urls:
            if isinstance(media_url, tuple):
                kind, murl = media_url
                if kind == "video_page":
                    print(f"    视频页面(未下载): {murl}")
                continue

            mtype = classify_url(media_url)
            result = download_media(media_url, save_dir, session)
            if result:
                if mtype == "video":
                    stats["videos"] += 1
                    print(f"    ✓ 视频下载: {result.name}")
                else:
                    stats["images"] += 1

        time.sleep(delay)

    print(f"  统计: {stats['images']} 图片, {stats['videos']} 视频, {stats['pages']} 页面")
    if stats["errors"]:
        print(f"  错误: {len(stats['errors'])} 个")
    return stats


def main():
    parser = argparse.ArgumentParser(description="SJTU国家级科研平台图片视频爬虫")
    parser.add_argument("--platforms", nargs="+", help="指定平台short名 (默认全部)")
    parser.add_argument("--list", action="store", help="列出所有平台")
    parser.add_argument("--depth", type=int, default=1, help="子页面爬取深度 (0=仅首页)")
    parser.add_argument("--delay", type=float, default=1.0, help="请求间隔秒数")
    args = parser.parse_args()

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    if args.list is not None:
        print("SJTU国家级科研平台列表:")
        for p in PLATFORMS:
            print(f"  {p['short']:15s} -> {p['name']}")
            print(f"  {'':15s}    {p['url']}")
        return

    targets = PLATFORMS
    if args.platforms:
        short_set = set(args.platforms)
        targets = [p for p in PLATFORMS if p["short"] in short_set]
        if not targets:
            print(f"未找到指定平台: {args.platforms}")
            print("可用: " + ", ".join(p["short"] for p in PLATFORMS))
            return

    all_stats = {}
    for platform in targets:
        stats = scrape_platform(platform, max_depth=args.depth, delay=args.delay)
        all_stats[platform["short"]] = {
            "name": platform["name"],
            "url": platform["url"],
            **stats
        }

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(all_stats, f, ensure_ascii=False, indent=2)

    total_img = sum(s["images"] for s in all_stats.values())
    total_vid = sum(s["videos"] for s in all_stats.values())
    total_pages = sum(s["pages"] for s in all_stats.values())
    print(f"\n{'='*60}")
    print(f"全部完成: {total_img} 图片, {total_vid} 视频, {total_pages} 页面")
    print(f"日志已保存至: {LOG_FILE}")


if __name__ == "__main__":
    main()