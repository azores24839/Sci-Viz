"""
NASA SVS 分层定额采样抓取器
策略:
  1. 搜索 API 分页获取全部条目 (10,505, 106页)
  2. 按 result_type 分类, 按 hits 排序
  3. 分层采样: 时间(40/30/30) × 学科 → 定额筛选
  4. 仅对选中条目获取详情 API → 提取 Image 媒体
  5. 下载 + SHA-256 去重 + 缩略图

采样配额 (总计 210-270):
  Visualization: 150, Animation: 25, Hyperwall Visual: 20
  Infographic: 35, Produced Video: 20, Interactive: 15
  跳过: Gallery, B-Roll
"""

import json
import time
import hashlib
import argparse
import requests
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

# ========== 路径配置 ==========

PROJECT_ROOT = Path(__file__).parent
OUTPUT_ROOT = PROJECT_ROOT / "nasa_svs_output"
IMAGES_DIR = OUTPUT_ROOT / "images"
THUMBS_DIR = OUTPUT_ROOT / "thumbnails"
SEARCH_CACHE_FILE = OUTPUT_ROOT / "all_items_cache.json"
SELECTED_FILE = OUTPUT_ROOT / "selected_items.json"
PROGRESS_FILE = OUTPUT_ROOT / "progress.json"

# ========== API 配置 ==========

SEARCH_API = "https://svs.gsfc.nasa.gov/api/search/"
DETAIL_API = "https://svs.gsfc.nasa.gov/api/{viz_id}"
PAGE_LIMIT = 100
REQUEST_DELAY = 1.5  # 请求间延迟，避免限流

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}

# ========== 采样配额 ==========

TYPE_QUOTAS = {
    "Visualization": 150,
    "Animation": 25,
    "Hyperwall Visual": 20,
    "Infographic": 35,
    "Produced Video": 20,
    "Interactive": 15,
}

SKIP_TYPES = {"Gallery", "B-Roll"}

TIME_STRATA = {
    ("recent", 0.40, 2020, 2026),
    ("middle", 0.30, 2015, 2019),
    ("classic", 0.30, 1900, 2014),
}

THUMB_SIZE = (300, 200)
MIN_IMAGE_SIZE_BYTES = 10 * 1024
MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024  # 跳过 >50MB 的超大文件
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
SKIP_FILENAME_PATTERNS = ["_searchweb.", "_thm.", "_print."]  # 跳过缩略图变体

# ========== HTTP 会话 ==========


def _get_session():
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def api_get(session, url, max_retries=5):
    """带重试和退避的 API 请求"""
    for attempt in range(max_retries):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 503:
                wait = 10 * (attempt + 1)
                print(f"  503 限流, 等待 {wait}s ...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as e:
            if e.response.status_code == 404:
                return None
            if attempt < max_retries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise
    return None

# ========== 阶段1: 全量发现 ==========


def fetch_all_items(session):
    """分页获取全部条目, 缓存到本地"""
    if SEARCH_CACHE_FILE.exists():
        with open(SEARCH_CACHE_FILE, "r") as f:
            data = json.load(f)
        if data:
            print(f"从缓存加载 {len(data)} 条")
            return data

    all_items = []
    offset = 0
    page = 1

    while True:
        url = f"{SEARCH_API}?limit={PAGE_LIMIT}&offset={offset}"
        print(f"  获取搜索页 {page} (offset={offset}) ...", end=" ")
        data = api_get(session, url)
        if data is None:
            print("失败, 跳过")
            offset += PAGE_LIMIT
            page += 1
            continue

        results = data.get("results", [])
        all_items.extend(results)
        print(f"{len(results)} 条, 累计 {len(all_items)} 条")

        next_url = data.get("next")
        if not next_url or not results:
            break

        offset += PAGE_LIMIT
        page += 1
        time.sleep(REQUEST_DELAY)

    with open(SEARCH_CACHE_FILE, "w") as f:
        json.dump(all_items, f, indent=2, ensure_ascii=False)
    print(f"共获取 {len(all_items)} 条, 已缓存至 {SEARCH_CACHE_FILE}")
    return all_items

# ========== 阶段2: 分层采样 ==========


def parse_year(item):
    """从 release_date 提取年份"""
    rd = item.get("release_date", "")
    if rd and len(rd) >= 4:
        try:
            return int(rd[:4])
        except ValueError:
            pass
    return 0


def stratify_and_select(all_items):
    """分层定额采样"""
    # 1. 过滤 Gallery 和 B-Roll
    filtered = [it for it in all_items if it.get("result_type") not in SKIP_TYPES]

    # 2. 按 type 分组
    by_type = defaultdict(list)
    for it in filtered:
        by_type[it.get("result_type", "Unknown")].append(it)

    print(f"\n按类型分布 (过滤后):")
    for t in sorted(by_type.keys()):
        print(f"  {t}: {len(by_type[t])} 条")

    # 3. 每个类型内, 先按 hits 排序
    for t in by_type:
        by_type[t].sort(key=lambda x: -x.get("hits", 0))

    # 4. 对每个 target type, 按时间分层 + hits 取前 N
    selected = []
    selection_detail = {}

    for viz_type, quota in TYPE_QUOTAS.items():
        pool = by_type.get(viz_type, [])
        if not pool:
            print(f"\n  {viz_type}: 无可用条目, 跳过")
            continue

        print(f"\n  {viz_type}: 池 {len(pool)} 条 → 配额 {quota} 条")

        type_selected = []

        # 时间分层 (用 release_date 近似)
        recent = [it for it in pool if 2020 <= parse_year(it) <= 2026]
        middle = [it for it in pool if 2015 <= parse_year(it) <= 2019]
        classic = [it for it in pool if parse_year(it) >= 1900 and parse_year(it) <= 2014]

        # 按比例分配
        n_recent = min(int(quota * 0.40), len(recent))
        n_middle = min(int(quota * 0.30), len(middle))
        n_classic = quota - n_recent - n_middle

        # 从每个时间段取 top hits
        selected_recent = recent[:n_recent]
        selected_middle = middle[:n_middle]
        selected_classic = classic[:n_classic]

        type_selected = selected_recent + selected_middle + selected_classic

        if len(type_selected) < quota and len(pool) > len(type_selected):
            remaining_quota = quota - len(type_selected)
            already_ids = {it["id"] for it in type_selected}
            extra = [it for it in pool if it["id"] not in already_ids][:remaining_quota]
            type_selected.extend(extra)

        selected.extend(type_selected)
        selection_detail[viz_type] = {
            "total_pool": len(pool),
            "quota": quota,
            "selected": len(type_selected),
            "recent_years": f"{len(selected_recent)} ({parse_year(recent[0]) if recent else 0}-{parse_year(recent[-1]) if recent else 0})",
            "middle_years": f"{len(selected_middle)}",
            "classic_years": f"{len(selected_classic)}",
        }

        print(f"    选中: {len(selected_recent)} recent + {len(selected_middle)} mid + {len(selected_classic)} classic = {len(type_selected)}")

    print(f"\n总计选中: {len(selected)} 条")

    with open(SELECTED_FILE, "w") as f:
        json.dump(selected, f, indent=2, ensure_ascii=False)
    print(f"已保存选中列表至 {SELECTED_FILE}")

    return selected

# ========== 阶段3: 详情获取 + 图片提取 ==========


def fetch_viz_detail(session, viz_id):
    url = DETAIL_API.format(viz_id=viz_id)
    return api_get(session, url)


def extract_images(detail):
    """从详情中提取所有高质量 Image"""
    images = []
    if detail is None:
        return images
    for group in detail.get("media_groups", []):
        for item in group.get("items", []):
            if item.get("type") != "media":
                continue
            inst = item.get("instance")
            if not inst or inst.get("media_type") != "Image":
                continue
            url = inst.get("url", "")
            filename = inst.get("filename", "")
            ext = Path(filename).suffix.lower()
            if ext not in IMAGE_EXTS:
                continue
            if ext == ".tiff" or ext == ".tif":
                continue
            # 跳过缩略图变体
            if any(p in filename for p in SKIP_FILENAME_PATTERNS):
                continue
            images.append({
                "url": url,
                "filename": filename,
                "width": inst.get("width"),
                "height": inst.get("height"),
                "alt_text": inst.get("alt_text", ""),
            })
    return images


def download_image(session, url, save_path, max_retries=3):
    """下载图片, 带重试和大小过滤"""
    if save_path.exists() and save_path.stat().st_size >= MIN_IMAGE_SIZE_BYTES:
        return True

    for attempt in range(max_retries):
        try:
            resp = session.get(url, timeout=120, stream=True)
            resp.raise_for_status()

            content_length = int(resp.headers.get("content-length", 0))
            if content_length > MAX_IMAGE_SIZE_BYTES:
                return False

            data = b""
            for chunk in resp.iter_content(8192):
                data += chunk
                if len(data) > MAX_IMAGE_SIZE_BYTES:
                    return False

            if len(data) < MIN_IMAGE_SIZE_BYTES:
                return False

            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_bytes(data)
            return True
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            return False
    return False


def generate_thumbnail(image_path, thumb_path):
    """生成缩略图"""
    if thumb_path.exists():
        return True
    try:
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(image_path)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
        img.thumbnail(THUMB_SIZE, Image.LANCZOS)
        img.save(thumb_path, "JPEG", quality=80)
        return True
    except Exception:
        return False


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def load_progress():
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {"processed_ids": [], "image_count": 0}


def save_progress(progress):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def rebuild_hash_registry(images_dir):
    registry = {}
    if not images_dir.exists():
        return registry
    for f in images_dir.rglob("*"):
        if f.is_file() and f.suffix.lower() in IMAGE_EXTS and f.stat().st_size >= MIN_IMAGE_SIZE_BYTES:
            try:
                h = sha256_file(f)
                if h not in registry:
                    registry[h] = str(f)
            except Exception:
                pass
    return registry

# ========== 阶段4: 下载 + 处理 ==========


def process_selected_items(session, selected, workers):
    hash_registry = rebuild_hash_registry(IMAGES_DIR)
    progress = load_progress()
    processed_ids = set(progress["processed_ids"])

    remaining = [it for it in selected if it["id"] not in processed_ids]
    print(f"\n已处理 {len(processed_ids)} 条, 剩余 {len(remaining)} 条")
    print(f"已有去重图片: {len(hash_registry)} 张")

    for idx, item in enumerate(remaining):
        viz_id = item["id"]
        title = item.get("title", "")
        result_type = item.get("result_type", "")
        print(f"\n[{idx+1}/{len(remaining)}] ID={viz_id} [{result_type}]: {title[:70]}")

        detail = fetch_viz_detail(session, viz_id)
        if detail is None:
            print("  跳过 (404/失败)")
            processed_ids.add(viz_id)
            progress["processed_ids"] = list(processed_ids)
            save_progress(progress)
            continue

        # 提取学科分类
        science_cats = detail.get("nasa_science_categories", [])
        if science_cats:
            print(f"  学科: {', '.join(science_cats)}")

        images = extract_images(detail)
        print(f"  图片: {len(images)} 张")

        if not images:
            processed_ids.add(viz_id)
            progress["processed_ids"] = list(processed_ids)
            save_progress(progress)
            time.sleep(0.3)
            continue

        viz_dir = IMAGES_DIR / str(viz_id)
        viz_thumb_dir = THUMBS_DIR / str(viz_id)

        # 只保留最高分辨率的一张（同一 viz 内去重变体）
        images.sort(key=lambda x: -(x.get("width", 0) or 0) * (x.get("height", 0) or 0))
        best_image = images[0]  # 取最高分辨率那张

        save_path = viz_dir / best_image["filename"]
        success = download_image(session, best_image["url"], save_path)

        if success and save_path.exists():
            file_hash = sha256_file(save_path)
            if file_hash in hash_registry:
                save_path.unlink()
                print(f"  ⊖ {best_image['filename']} (跨 viz 重复)")
            else:
                hash_registry[file_hash] = str(save_path)
                thumb_path = viz_thumb_dir / f"{save_path.stem}_thumb.jpg"
                generate_thumbnail(save_path, thumb_path)

        processed_ids.add(viz_id)
        progress["processed_ids"] = list(processed_ids)
        progress["image_count"] = len(hash_registry)
        save_progress(progress)

        print(f"  累计去重: {len(hash_registry)} 张")
        time.sleep(0.5)

    return hash_registry

# ========== 主流程 ==========


def main():
    parser = argparse.ArgumentParser(description="NASA SVS 分层定额采样抓取器")
    parser.add_argument("--discover-only", action="store_true", help="仅发现+采样, 不下载")
    parser.add_argument("--download-only", action="store_true", help="仅从 selected_items.json 下载")
    parser.add_argument("--workers", type=int, default=4, help="并发下载线程数")
    parser.add_argument("--force-rediscover", action="store_true", help="强制重新抓取搜索列表")
    args = parser.parse_args()

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    session = _get_session()

    # ---- 阶段 1+2: 发现 + 采样 ----
    if not args.download_only:
        if args.force_rediscover and SEARCH_CACHE_FILE.exists():
            SEARCH_CACHE_FILE.unlink()

        print("=" * 60)
        print("[阶段 1] 全量发现")
        print("=" * 60)
        all_items = fetch_all_items(session)

        print("\n" + "=" * 60)
        print("[阶段 2] 分层定额采样")
        print("=" * 60)
        selected = stratify_and_select(all_items)

        if args.discover_only:
            print("仅发现模式, 退出。")
            return
    else:
        with open(SELECTED_FILE, "r") as f:
            selected = json.load(f)
        print(f"从缓存加载 {len(selected)} 条选中条目")

    # ---- 阶段 3+4: 详情获取 + 下载 ----
    print("\n" + "=" * 60)
    print("[阶段 3+4] 获取详情 + 下载图片")
    print("=" * 60)

    hash_registry = process_selected_items(session, selected, args.workers)

    print("\n" + "=" * 60)
    print(f"完成！去重后共 {len(hash_registry)} 张图片")
    print(f"图片目录: {IMAGES_DIR}")
    print(f"缩略图目录: {THUMBS_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
