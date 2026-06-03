"""
Springer Nature 多期刊封面爬虫
支持Nature及其子刊、Nature Reviews系列等所有使用同一CDN的期刊
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
CDN_BASE = "https://media.springernature.com/full/springer-static/cover-hires/journal"
COVERS_ROOT = Path(__file__).parent / "journal_covers"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# 已验证的期刊配置: path -> {name, id, url_path, source_domain}
JOURNALS = {
    "nature":                    {"name": "Nature",                         "id": 41586, "path": "nature"},
    "nmat":                      {"name": "Nature Materials",               "id": 41563, "path": "nmat"},
    "nphys":                     {"name": "Nature Physics",                 "id": 41567, "path": "nphys"},
    "nmeth":                     {"name": "Nature Methods",                 "id": 41592, "path": "nmeth"},
    "nbt":                       {"name": "Nature Biotechnology",           "id": 41587, "path": "nbt"},
    "nchem":                     {"name": "Nature Chemistry",               "id": 41557, "path": "nchem"},
    "nphoton":                   {"name": "Nature Photonics",               "id": 41566, "path": "nphoton"},
    "nnano":                     {"name": "Nature Nanotechnology",          "id": 41565, "path": "nnano"},
    "ng":                        {"name": "Nature Genetics",                "id": 41588, "path": "ng"},
    "ni":                        {"name": "Nature Immunology",              "id": 41590, "path": "ni"},
    "ncb":                       {"name": "Nature Cell Biology",            "id": 41556, "path": "ncb"},
    "nsmb":                      {"name": "Nature Structural & Molecular Biology", "id": 41594, "path": "nsmb"},
    "nclimate":                  {"name": "Nature Climate Change",          "id": 41558, "path": "nclimate"},
    "nenergy":                   {"name": "Nature Energy",                  "id": 41560, "path": "nenergy"},
    "natureastronomy":           {"name": "Nature Astronomy",               "id": 41550, "path": "natureastronomy"},
    "natureplants":              {"name": "Nature Plants",                  "id": 41477, "path": "natureplants"},
    "natureprotocols":           {"name": "Nature Protocols",               "id": 41596, "path": "natureprotocols"},
    "naturehealth":              {"name": "Nature Health",                  "id": 44360, "path": "naturehealth"},
    "natrevbioeng":              {"name": "Nature Reviews Bioengineering",  "id": 44222, "path": "natrevbioeng"},
    "natrevchem":                {"name": "Nature Reviews Chemistry",       "id": 41570, "path": "natrevchem"},
    "natrevphys":                {"name": "Nature Reviews Physics",         "id": 42254, "path": "natrevphys"},
    "natrevmats":                {"name": "Nature Reviews Materials",       "id": 41578, "path": "natrevmats"},
    "natrevearthenviron":        {"name": "Nature Reviews Earth & Environment", "id": 43017, "path": "natrevearthenviron"},
    # 以下是已验证有ID但需进一步确认封面路径的
    "ncomms":                    {"name": "Nature Communications",          "id": 41467, "path": "ncomms"},
    "srep":                      {"name": "Scientific Reports",             "id": 41598, "path": "srep"},
    "sdata":                     {"name": "Scientific Data",                "id": 41597, "path": "sdata"},
}


def _get_session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def discover_volumes(journal_path):
    """从期刊 volumes 页面提取所有 volume 编号"""
    url = f"{BASE_URL}/{journal_path}/volumes"
    s = _get_session()
    resp = s.get(url, timeout=30)
    resp.raise_for_status()
    volumes = sorted({int(m.group(1)) for m in re.finditer(rf'href="/{re.escape(journal_path)}/volumes/(\d+)"', resp.text)}, reverse=True)
    return volumes


def scrape_volume(journal_path, volume_num):
    """抓取单个 volume 的所有 issue 信息"""
    url = f"{BASE_URL}/{journal_path}/volumes/{volume_num}"
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
            "issue_url": f"https://www.nature.com/{journal_path}/volumes/{volume_num}/issues/{issue_num}",
        })
    return volume_num, issues


def discover_issues(journal_key, volumes, workers=8):
    """并发抓取某个期刊的所有 issue"""
    cfg = JOURNALS[journal_key]
    print(f"  [{cfg['name']}] 抓取 {len(volumes)} volumes (workers={workers})...")

    all_issues = []
    completed = 0
    total = len(volumes)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(scrape_volume, cfg["path"], v): v for v in volumes}
        for future in as_completed(futures):
            vol, issues = future.result()
            all_issues.extend(issues)
            completed += 1
            if completed % 20 == 0 or completed == total:
                print(f"    [{cfg['name']}] {completed}/{total} volumes, {len(all_issues)} issues")

    all_issues.sort(key=lambda x: (-x["volume"], -x["issue"]))
    return all_issues


def download_covers(journal_key, issues, workers=6):
    """下载某个期刊的封面图片"""
    cfg = JOURNALS[journal_key]
    journal_dir = COVERS_ROOT / journal_key
    journal_dir.mkdir(parents=True, exist_ok=True)

    # 跳过已有文件
    existing_files = set(journal_dir.glob(f"{cfg['id']}_*"))
    if existing_files:
        print(f"    [{cfg['name']}] 已有 {len(existing_files)} 张本地封面")

    to_dl = []
    for iss in issues:
        vol, iss_num = iss["volume"], iss["issue"]
        date_str = iss["date"].replace(" ", "_") if iss["date"] else "unknown"
        filename = f"{cfg['id']}_{vol}_{iss_num}_{date_str}.jpg"
        if filename not in {f.name for f in existing_files}:
            to_dl.append((iss, filename))

    if not to_dl:
        print(f"    [{cfg['name']}] 全部已存在 ({len(issues)} 张)")
        return

    print(f"    [{cfg['name']}] 下载 {len(to_dl)} 张 (已有 {len(issues) - len(to_dl)})...")

    stats = {"ok": 0, "skip": 0, "fail": 0}
    completed = 0

    def _download(item):
        iss, filename = item
        vol, iss_num = iss["volume"], iss["issue"]
        filepath = journal_dir / filename

        cdn_url = f"{CDN_BASE}/{cfg['id']}/{vol}/{iss_num}"
        try:
            s = _get_session()
            resp = s.get(cdn_url, timeout=15)
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "")
            if "image" not in ct and resp.content[:4] not in (b"\xff\xd8\xff", b"\x89PNG", b"GIF8"):
                return "not_image", iss_num
            filepath.write_bytes(resp.content)
            return "ok", iss_num
        except Exception:
            return "fail", iss_num

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_download, item): item for item in to_dl}
        for future in as_completed(futures):
            status, _ = future.result()
            stats[status] += 1
            completed += 1
            if completed % 10 == 0:
                print(f"    [{cfg['name']}] {completed}/{len(to_dl)} (ok={stats['ok']} fail={stats['fail']})")

    print(f"    [{cfg['name']}] 完成: ok={stats['ok']} fail={stats['fail']}")


def run_journal(journal_key, volumes_limit=None, workers=8):
    """运行单个期刊的完整流程"""
    cfg = JOURNALS[journal_key]
    cache_file = COVERS_ROOT / f".cache_{journal_key}.json"

    COVERS_ROOT.mkdir(parents=True, exist_ok=True)

    # 获取或恢复 issues
    if cache_file.exists():
        with open(cache_file) as f:
            issues = json.load(f)
        print(f"  [{cfg['name']}] 从缓存恢复 {len(issues)} issues")
    else:
        volumes = discover_volumes(cfg["path"])
        if volumes_limit:
            volumes = volumes[:volumes_limit]
        print(f"  [{cfg['name']}] 发现 {len(volumes)} volumes (范围: {volumes[0]}-{volumes[-1]})")
        issues = discover_issues(journal_key, volumes, workers)
        with open(cache_file, "w") as f:
            json.dump(issues, f, ensure_ascii=False, indent=2)
        print(f"  [{cfg['name']}] 缓存已保存 ({len(issues)} issues)")

    if issues:
        download_covers(journal_key, issues, workers=min(workers, 6))
    return journal_key, len(issues)


def main():
    parser = argparse.ArgumentParser(description="Springer Nature 多期刊封面爬虫")
    parser.add_argument("--journals", nargs="+", help="指定期刊key (默认全部), e.g. nature nmat nphys")
    parser.add_argument("--list", action="store_true", help="列出所有支持的期刊")
    parser.add_argument("--discover-only", action="store_true", help="仅发现issues，不下载")
    parser.add_argument("--volumes", type=int, default=0, help="每个期刊只抓最新N个volume")
    parser.add_argument("--download-only", action="store_true", help="只下载(使用缓存)")
    parser.add_argument("--workers", type=int, default=8, help="并发数")
    args = parser.parse_args()

    if args.list:
        print("支持的Springer Nature期刊:")
        for key, cfg in JOURNALS.items():
            print(f"  {key:24s} -> {cfg['name']} (id={cfg['id']})")
        return

    journals = args.journals if args.journals else list(JOURNALS.keys())

    total_issues = 0
    for key in journals:
        if key not in JOURNALS:
            print(f"未知期刊: {key}")
            continue
        cfg = JOURNALS[key]
        print(f"\n{'='*60}")
        print(f"{cfg['name']} (id={cfg['id']}, path={cfg['path']})")
        print(f"{'='*60}")

        if args.download_only:
            cache_file = COVERS_ROOT / f".cache_{key}.json"
            if not cache_file.exists():
                print(f"  缓存不存在，跳过")
                continue
            with open(cache_file) as f:
                issues = json.load(f)
            download_covers(key, issues, workers=min(args.workers, 6))
        elif args.discover_only:
            volumes = discover_volumes(cfg["path"])
            if args.volumes:
                volumes = volumes[:args.volumes]
            print(f"  发现 {len(volumes)} volumes")
            issues = discover_issues(key, volumes, args.workers)
            if issues:
                cache_file = COVERS_ROOT / f".cache_{key}.json"
                with open(cache_file, "w") as f:
                    json.dump(issues, f, ensure_ascii=False, indent=2)
                print(f"  缓存 {len(issues)} issues")
        else:
            _, count = run_journal(key, volumes_limit=args.volumes or None, workers=args.workers)
            total_issues += count

    print(f"\n全部完成, 共发现 {total_issues} 期封面")


if __name__ == "__main__":
    main()
