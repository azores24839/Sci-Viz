"""
长兴海洋实验室 (ime.sjtu.edu.cn) 图片/视频爬虫
从 https://ime.sjtu.edu.cn/index.htm 首页抓取图片和视频，
并深度爬取内部文章页（排除微信外链）。
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

OUTPUT_ROOT = Path(__file__).parent / "sjtu_platform_media" / "changxing"
LOG_FILE = OUTPUT_ROOT / "scrape_log.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".ico", ".tiff", ".avif"}
VIDEO_EXTS = {".mp4", ".webm", ".ogg", ".ogv", ".mov", ".avi", ".mkv", ".flv"}

BASE_URL = "https://ime.sjtu.edu.cn"
DOMAIN = "ime.sjtu.edu.cn"

SEED_SECTIONS = [
    {"url": "/index.htm", "desc": "首页"},
    {"url": "/xwdt/hzxw.htm", "desc": "海装新闻"},
    {"url": "/xwdt/tzgg.htm", "desc": "通知公告"},
    {"url": "/xwdt/xsky.htm", "desc": "学术科研"},
    {"url": "/kjgg/dxcg.htm", "desc": "典型成果"},
    {"url": "/kjgg/jctd.htm", "desc": "交叉团队"},
    {"url": "/kjgg/hzjl.htm", "desc": "合作交流"},
    {"url": "/ptjs/jybjcggdpt.htm", "desc": "教育部集成攻关大平台"},
    {"url": "/ptjs/zc_jdshhyzbqzjsyjy.htm", "desc": "中船-交大前瞻技术研究院"},
    {"url": "/ptjs/gjgcyjzx/zxjj.htm", "desc": "国家工程研究中心"},
    {"url": "/gywm/dwgk.htm", "desc": "单位概况"},
    {"url": "/gywm/jgsz/dzzhb.htm", "desc": "机构设置"},
    {"url": "/djgz/dwgk.htm", "desc": "党委概况"},
    {"url": "/djgz/djdt.htm", "desc": "党建动态"},
    {"url": "/djgz/djxxjy.htm", "desc": "党纪学习教育"},
    {"url": "/djgz/llxx.htm", "desc": "理论学习"},
    {"url": "/djgz/jgzj.htm", "desc": "教工之家"},
    {"url": "/cpyc/rczp.htm", "desc": "人才招聘"},
    {"url": "/fwzn/gzzd.htm", "desc": "规章制度"},
    {"url": "/fwzn/xgxz.htm", "desc": "相关下载"},
    {"url": "/fwzn/wyfw.htm", "desc": "物业服务"},
    {"url": "/fwzn/hysfw.htm", "desc": "会议室服务"},
]

WECHAT_PATTERN = re.compile(r"mp\.weixin\.qq\.com")
INFO_PAGE_PATTERN = re.compile(r"/info/\d+/\d+\.htm$")


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
        if src and ("player" in src.lower() or "video" in src.lower() or
                    "bilibili" in src.lower() or "youku" in src.lower()):
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
            if ext in IMAGE_EXTS or ext in VIDEO_EXTS or \
               any(kw in item.lower() for kw in ["image", "video", "upload", "photo", "pic", "__local"]):
                clean.add(item)
            elif not ext or ext in {".html", ".htm", ".php", ".asp", ".jsp", "/"}:
                pass
            else:
                clean.add(item)

    return clean


def discover_subpages(html, base_url):
    """发现同域名下的子页面链接，排除微信外链、CSS/JS资源"""
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript:"):
            continue
        full = urljoin(base_url, href)
        parsed = urlparse(full)

        if parsed.netloc != DOMAIN and not parsed.netloc.endswith("." + DOMAIN):
            continue

        if WECHAT_PATTERN.search(full):
            continue

        path_lower = parsed.path.lower()
        ext = Path(parsed.path).suffix.lower()
        if ext in {".css", ".js", ".ico", ".jpg", ".jpeg", ".png", ".gif",
                   ".mp4", ".webm", ".pdf", ".zip", ".rar", ".doc", ".docx"}:
            continue

        clean = full.split("#")[0].split("?")[0].rstrip("/")
        links.add(clean)

    return list(links)


def is_info_page(url):
    return bool(INFO_PAGE_PATTERN.search(url))


def fetch_paginated_list_pages(seed_url, session):
    """获取种子列表页及其所有分页的URL"""
    all_pages = []
    current = seed_url

    while current:
        try:
            resp = session.get(current, timeout=20)
            resp.raise_for_status()
        except Exception as e:
            print(f"    分页获取失败 {current}: {e}")
            break

        all_pages.append(current)
        soup = BeautifulSoup(resp.text, "html.parser")

        next_link = soup.select_one("a.p_next.p_fun")
        if next_link:
            href = next_link.get("href", "")
            if href:
                current = urljoin(current, href)
            else:
                break
        else:
            break

        if len(all_pages) > 50:
            print(f"    分页过多(>50)，停止: {seed_url}")
            break

        time.sleep(0.5)

    if len(all_pages) > 1:
        print(f"    发现 {len(all_pages)} 个分页")
    return all_pages


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
    except Exception:
        return None


def scrape(max_pages_per_section=5, delay=0.5):
    print(f"\n{'='*60}")
    print(f"  长兴海洋实验室 (ime.sjtu.edu.cn) 图片/视频爬虫")
    print(f"  BASE: {BASE_URL}")
    print(f"{'='*60}")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    session = _session()

    stats = {"images": 0, "videos": 0, "pages": 0, "errors": []}
    image_sources = {}  # filename -> source page URL
    visited_pages = set()
    visited_images = set()
    all_info_urls = set()

    # Phase 1: Crawl all seed section pages (including pagination)
    all_page_urls = []
    for section in SEED_SECTIONS:
        seed_url = BASE_URL + section["url"]
        print(f"\n  发现列表页: [{section['desc']}] {seed_url}")
        paginated = fetch_paginated_list_pages(seed_url, session)
        all_page_urls.extend(paginated)

    # Also add homepage
    homepage = BASE_URL + "/index.htm"

    # Phase 2: On each list page, discover local /info/ article URLs
    print(f"\n  --- 从 {len(all_page_urls)} 个列表页发现内部文章 ---")
    for list_url in all_page_urls:
        if list_url in visited_pages:
            continue
        visited_pages.add(list_url)
        stats["pages"] += 1

        try:
            resp = session.get(list_url, timeout=20)
            resp.raise_for_status()
        except Exception as e:
            stats["errors"].append(f"获取列表页失败 {list_url}: {e}")
            continue

        subpages = discover_subpages(resp.text, list_url)
        for sp in subpages:
            if is_info_page(sp):
                all_info_urls.add(sp)

        time.sleep(delay)

    print(f"  发现 {len(all_info_urls)} 个内部文章页")

    # Phase 3: Crawl homepage for direct images
    print(f"\n  --- 爬取首页直接图片 ---")
    try:
        resp = session.get(homepage, timeout=20)
        resp.raise_for_status()
        stats["pages"] += 1
        media_urls = extract_media_urls(resp.text, homepage)
        print(f"  首页发现 {len(media_urls)} 个媒体URL")
        for media_url in media_urls:
            if isinstance(media_url, tuple):
                continue
            if media_url in visited_images:
                continue
            visited_images.add(media_url)
            mtype = classify_url(media_url)
            result = download_media(media_url, OUTPUT_ROOT, session)
            if result:
                image_sources[result.name] = homepage
                if mtype == "video":
                    stats["videos"] += 1
                else:
                    stats["images"] += 1
    except Exception as e:
        stats["errors"].append(f"首页获取失败: {e}")

    # Phase 4: Crawl each internal article page for content images
    print(f"\n  --- 爬取内部文章页内容图片 (最多 {max_pages_per_section} 篇/栏目) ---")
    article_count = 0
    for info_url in sorted(all_info_urls):
        if article_count >= max_pages_per_section * len(SEED_SECTIONS):
            break

        if info_url in visited_pages:
            continue
        visited_pages.add(info_url)

        try:
            resp = session.get(info_url, timeout=20)
            resp.raise_for_status()
            stats["pages"] += 1
            article_count += 1
        except Exception as e:
            stats["errors"].append(f"文章页获取失败 {info_url}: {e}")
            continue

        media_urls = extract_media_urls(resp.text, info_url)
        for media_url in media_urls:
            if isinstance(media_url, tuple):
                continue
            if media_url in visited_images:
                continue
            visited_images.add(media_url)
            mtype = classify_url(media_url)
            result = download_media(media_url, OUTPUT_ROOT, session)
            if result:
                image_sources[result.name] = info_url
                if mtype == "video":
                    stats["videos"] += 1
                else:
                    stats["images"] += 1

        if article_count % 5 == 0:
            print(f"    已处理 {article_count} 篇文章...")

        time.sleep(delay)

    print(f"\n  {'='*60}")
    print(f"  完成!")
    print(f"  图片: {stats['images']}, 视频: {stats['videos']}, 页面: {stats['pages']}")
    if stats["errors"]:
        print(f"  错误: {len(stats['errors'])} 个")
    print(f"  输出目录: {OUTPUT_ROOT}")

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    print(f"  日志已保存至: {LOG_FILE}")

    sources_file = OUTPUT_ROOT / "image_sources.json"
    with open(sources_file, "w", encoding="utf-8") as f:
        json.dump(image_sources, f, ensure_ascii=False, indent=2)
    print(f"  图片来源映射已保存至: {sources_file}")

    return stats


def main():
    parser = argparse.ArgumentParser(description="长兴海洋实验室图片视频爬虫")
    parser.add_argument("--max-pages", type=int, default=5,
                        help="每栏目最多爬取文章数 (默认5)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="请求间隔秒数 (默认0.5)")
    args = parser.parse_args()

    scrape(max_pages_per_section=args.max_pages, delay=args.delay)


if __name__ == "__main__":
    main()
