"""
Nature 期刊封面爬虫 (并发版)
来源: https://media.springernature.com/full/springer-static/cover-hires/journal/41586/{volume}/{issue}

策略:
1. 从 volumes 页面一次性提取所有 volume 编号 (653个)
2. 并发抓取每个 volume 页面获取 issue 列表
3. 并发下载封面图片
"""

import os
import re
import json
import time
import argparse
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup
from pathlib import Path

BASE_URL = "https://www.nature.com"
VOLUMES_URL = f"{BASE_URL}/nature/volumes"
CDN_BASE = "https://media.springernature.com/full/springer-static/cover-hires/journal/41586"
COVER_DIR = Path(__file__).parent / "nature_covers"
CACHE_FILE = Path(__file__).parent / "nature_issues_cache.json"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}


def _get_session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def discover_volumes():
    """从 volumes 页面一次性提取所有 volume 编号"""
    print("[1/3] 发现所有 volume 编号...")
    s = _get_session()
    resp = s.get(VOLUMES_URL, timeout=30)
    resp.raise_for_status()
    volumes = sorted({int(m.group(1)) for m in re.finditer(r'href="/nature/volumes/(\d+)"', resp.text)}, reverse=True)
    print(f"  发现 {len(volumes)} 个 volumes (范围: {volumes[0]} - {volumes[-1]})")
    return volumes


def scrape_volume(volume_num):
    """抓取单个 volume 的所有 issue 信息"""
    url = f"{BASE_URL}/nature/volumes/{volume_num}"
    try:
        s = _get_session()
        resp = s.get(url, timeout=20)
        resp.raise_for_status()
    except Exception:
        return volume_num, []

    soup = BeautifulSoup(resp.text, "html.parser")
    issues = []
    for item in soup.select("#issue-list > li"):
        issue_el = item.select_one("[itemprop='issueNumber']")
        date_el = item.select_one("[itemprop='datePublished']")
        desc_el = item.select_one("[data-show-more]")

        issue_num = issue_el.get("content", "").strip() if issue_el else None
        if not issue_num:
            continue

        date_str = date_el.get("content", "").strip() if date_el else ""
        desc = re.sub(r"\s+", " ", desc_el.get_text(" ", strip=True)) if desc_el else ""

        issues.append({
            "volume": volume_num,
            "issue": int(issue_num),
            "date": date_str,
            "description": desc[:500],
            "cover_url_cdn": f"{CDN_BASE}/{volume_num}/{issue_num}",
        })
    return volume_num, issues


def discover_all_issues(volumes, workers=10, resume=True):
    """并发抓取所有 volume 页面，构建 issue 列表"""
    if resume and CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            all_issues = json.load(f)
        print(f"[2/3] 从缓存恢复 {len(all_issues)} 条记录")
        return all_issues

    print(f"[2/3] 并发抓取 {len(volumes)} 个 volume 页面 (workers={workers})...")
    all_issues = []
    completed = 0
    total = len(volumes)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(scrape_volume, v): v for v in volumes}
        for future in as_completed(futures):
            vol, issues = future.result()
            all_issues.extend(issues)
            completed += 1
            if completed % 20 == 0 or completed == total:
                print(f"  进度: {completed}/{total} volumes, {len(all_issues)} issues 已发现")

    # 按 volume 降序, issue 降序 排列
    all_issues.sort(key=lambda x: (-x["volume"], -x["issue"]))

    with open(CACHE_FILE, "w") as f:
        json.dump(all_issues, f, ensure_ascii=False, indent=2)
    print(f"  缓存已保存: {CACHE_FILE} ({len(all_issues)} issues)")
    return all_issues


def download_single(iss, max_retries=3):
    """下载单张封面 (带重试)"""
    vol, iss_num = iss["volume"], iss["issue"]
    date_str = iss["date"].replace(" ", "_")
    filename = f"Nature_Vol{vol:04d}_Iss{iss_num}_{date_str}.jpg"
    filepath = COVER_DIR / filename

    if filepath.exists():
        return "skip", iss_num

    for attempt in range(max_retries):
        try:
            s = _get_session()
            resp = s.get(iss["cover_url_cdn"], timeout=30)
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "")
            if "image" not in ct and resp.content[:4] not in (b"\xff\xd8\xff", b"\x89PNG", b"GIF8", b"RIFF"):
                return "not_image", iss_num

            filepath.write_bytes(resp.content)
            return "ok", iss_num
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                return "fail", iss_num
    return "fail", iss_num


def download_covers(issues, workers=8, resume=True):
    """并发下载封面图片"""
    COVER_DIR.mkdir(parents=True, exist_ok=True)

    # 跳过已有文件
    to_download = []
    if resume:
        existing = {f.stem.split("_Iss")[1].split("_")[0] for f in COVER_DIR.glob("Nature_Vol*_Iss*_*.jpg")}
        to_download = [iss for iss in issues if str(iss["issue"]) not in existing]
    else:
        to_download = issues

    print(f"[3/3] 并发下载 {len(to_download)} 张封面 (跳过 {len(issues) - len(to_download)} 张已有)...")
    if not to_download:
        print("  所有封面已存在!")
        return

    stats = {"ok": 0, "skip": 0, "fail": 0, "not_image": 0}
    completed = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(download_single, iss): iss for iss in to_download}
        for future in as_completed(futures):
            status, _ = future.result()
            stats[status] += 1
            completed += 1
            if completed % 20 == 0:
                elapsed = time.time() - t0
                speed = completed / elapsed if elapsed > 0 else 0
                print(f"  进度: {completed}/{len(to_download)} (ok={stats['ok']}, skip={stats['skip']}, "
                      f"fail={stats['fail']}, not_image={stats['not_image']}, {speed:.1f}/s)")

    elapsed = time.time() - t0
    print(f"\n[完成] 耗时 {elapsed:.0f}s | 下载={stats['ok']}, 跳过={stats['skip']}, 失败={stats['fail']}, 非图片={stats['not_image']}")


def main():
    parser = argparse.ArgumentParser(description="Nature 期刊封面爬虫 (并发版)")
    parser.add_argument("--discover-only", action="store_true", help="仅发现 issues 列表")
    parser.add_argument("--download-only", action="store_true", help="仅下载（使用缓存）")
    parser.add_argument("--no-resume", action="store_true", help="不用缓存，重新全量抓取")
    parser.add_argument("--workers", type=int, default=10, help="并发数 (默认 10)")
    parser.add_argument("--range", type=str, help="限制 volume 范围, e.g. '650-653'")
    args = parser.parse_args()

    if args.download_only:
        if not CACHE_FILE.exists():
            print("错误: 缓存文件不存在，请先运行发现阶段")
            return
        with open(CACHE_FILE) as f:
            issues = json.load(f)
        print(f"[3/3] 开始下载 {len(issues)} 张封面...")
        download_covers(issues, workers=args.workers)
        return

    volumes = discover_volumes()

    if args.range:
        lo, hi = map(int, args.range.split("-"))
        volumes = [v for v in volumes if lo <= v <= hi]
        print(f"  限制范围: Volume {lo}-{hi} ({len(volumes)} volumes)")

    issues = discover_all_issues(volumes, workers=args.workers, resume=not args.no_resume)

    if args.discover_only:
        return

    download_covers(issues, workers=args.workers)


if __name__ == "__main__":
    main()
