"""
Tableau Viz Gallery 抓取器
来源: https://www.tableau.com/viz-gallery (有反爬) → 回退到 public.tableau.com/app/discover
策略: Playwright + Stealth 渲染 SPA 页面 → 提取卡片数据和缩略图 → 直接入库 VisualCase
"""

import json
import time
import uuid
import hashlib
import sqlite3
import argparse
import requests
import shutil
from pathlib import Path
from typing import Optional
from PIL import Image
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

# ========== 配置 ==========

GALLERY_URL = "https://www.tableau.com/viz-gallery"
FALLBACK_URLS = [
    "https://public.tableau.com/app/discover",
    "https://public.tableau.com/app/discover/viz-of-the-day",
]
TABLEAU_PUBLIC_BASE = "https://public.tableau.com"
PROJECT_ROOT = Path(__file__).parent
DB_PATH = PROJECT_ROOT / "sci-viz-case-hub" / "server" / "prisma" / "dev.db"
UPLOADS_DIR = PROJECT_ROOT / "sci-viz-case-hub" / "server" / "uploads"
ORIGINALS_DIR = UPLOADS_DIR / "originals"
THUMBNAILS_DIR = UPLOADS_DIR / "thumbnails"
OUTPUT_JSON = PROJECT_ROOT / "tableau_viz_gallery.json"

SOURCE_NAME = "Tableau Viz Gallery"
SOURCE_TYPE = "gallery"
SOURCE_DOMAIN = "public.tableau.com"
CAPTURE_TYPE = "crawler_playwright"

MIN_IMAGE_WIDTH = 160
MIN_IMAGE_HEIGHT = 100
MIN_IMAGE_SIZE_BYTES = 10 * 1024


# ========== 页面抓取 ==========

def scrape_gallery_page(max_scrolls: int = 10, headless: bool = True):
    """使用 Playwright 渲染页面，提取所有卡片数据"""
    print(f"[1/3] 使用 Playwright 加载页面: {GALLERY_URL}")

    results = []
    page_title = ""
    effective_url = GALLERY_URL

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = context.new_page()
        Stealth().apply_stealth_sync(page)

        # 尝试主 URL
        page.goto(GALLERY_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(5000)
        page_title = page.title()
        print(f"  页面标题: {page_title}")

        if "denied" in page_title.lower() or "blocked" in page_title.lower():
            print("  主 URL 被拦截，尝试备用 URL...")
            for fallback_url in FALLBACK_URLS:
                print(f"  尝试: {fallback_url}")
                try:
                    page.goto(fallback_url, wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(5000)
                    page_title = page.title()
                    print(f"  页面标题: {page_title}")
                    if "denied" not in page_title.lower():
                        effective_url = fallback_url
                        print(f"  成功!")
                        break
                except Exception as e:
                    print(f"  失败: {e}")
            else:
                print("  所有 URL 均被拦截")
                browser.close()
                return {"title": "Access Denied", "url": GALLERY_URL, "cards": []}

        # 滚动触发懒加载
        for i in range(max_scrolls):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(1500)
            prev_count = len(results)
            cards = _extract_cards(page)
            results = cards
            if len(results) == prev_count and i > 2:
                print(f"  滚动 {i+1}/{max_scrolls} 后不再有新卡片，停止")
                break
            print(f"  滚动 {i+1}/{max_scrolls}, {len(results)} 张卡片")

        page.wait_for_timeout(2000)
        results = _extract_cards(page)

        # 尝试点击 Load More 按钮
        try:
            for btn in page.query_selector_all('button:has-text("Load More"), a:has-text("Show More")'):
                if btn.is_visible():
                    btn.click()
                    page.wait_for_timeout(3000)
                    break
            results = _extract_cards(page)
        except Exception:
            pass

        browser.close()

    results = _normalize_cards(results)
    return {"title": page_title, "url": effective_url, "cards": results}


def _extract_cards(page) -> list:
    """从当前页面提取所有 viz 卡片数据"""
    cards = []
    found_selectors = set()

    # 策略1: 通过卡片容器查找
    for selector in ['[class*="thumbnail"]', '[class*="card"]', 'article', '[class*="tile"]',
                     '[class*="viz-card"]', '[class*="list-item"]']:
        try:
            containers = page.query_selector_all(selector)
            if not containers:
                continue
            for container in containers:
                img = container.query_selector("img")
                if not img:
                    continue
                src = img.get_attribute("src") or ""
                if not src:
                    continue
                if any(s in src.lower() for s in ["logo", "icon", "avatar", "favicon", "pixel", "sprite"]):
                    continue

                try:
                    nw = img.evaluate("el => el.naturalWidth")
                    nh = img.evaluate("el => el.naturalHeight")
                    if nw < MIN_IMAGE_WIDTH or nh < MIN_IMAGE_HEIGHT:
                        continue
                except Exception:
                    pass

                title_el = container.query_selector("h1,h2,h3,h4,h5,h6,[class*='title'],[class*='name']")
                title = title_el.inner_text().strip() if title_el else ""

                author_el = container.query_selector("[class*='author'],[class*='by'],[class*='creator'],[class*='owner']")
                author = author_el.inner_text().strip() if author_el else ""

                link_el = container.query_selector("a[href]")
                link = link_el.get_attribute("href") if link_el else ""

                if not title:
                    title = img.get_attribute("alt") or ""

                cards.append({
                    "image_url": src,
                    "title": title,
                    "author": author.replace("by ", "").replace("By ", "").strip(),
                    "link": link,
                })
                found_selectors.add(selector)
        except Exception:
            continue

    # 策略2: 兜底 - 遍历所有大图
    if len(cards) < 5:
        existing_urls = {c["image_url"] for c in cards}
        for img in page.query_selector_all("img"):
            src = img.get_attribute("src") or ""
            if not src or src in existing_urls:
                continue
            if any(s in src.lower() for s in ["logo", "icon", "avatar", "favicon", "pixel", "sprite"]):
                continue
            try:
                nw = img.evaluate("el => el.naturalWidth")
                nh = img.evaluate("el => el.naturalHeight")
                if nw < MIN_IMAGE_WIDTH or nh < MIN_IMAGE_HEIGHT:
                    continue
            except Exception:
                continue

            alt = img.get_attribute("alt") or ""
            title = alt
            author = ""
            link = ""

            try:
                parent = img.evaluate("""(el) => {
                    let p = el.closest('a') || el.closest('article') || el.closest('.card') || el.closest('li');
                    if (!p) p = el.parentElement;
                    let t = p.querySelector('h1,h2,h3,h4,h5,h6,.title');
                    let a = p.querySelector('.author,.creator');
                    let l = p.closest('a[href]');
                    return {title: t ? t.textContent.trim() : '', author: a ? a.textContent.trim() : '', link: l ? l.href : ''};
                }""")
                title = (parent.get("title") or "") or title
                author = (parent.get("author") or "").strip()
                link = (parent.get("link") or "").strip()
            except Exception:
                pass

            cards.append({
                "image_url": src,
                "title": title,
                "author": author.replace("by ", "").replace("By ", "").strip(),
                "link": link,
            })

    print(f"  提取到 {len(cards)} 张卡片 (选择器: {sorted(found_selectors) if found_selectors else '图片遍历'})")
    return cards


def _normalize_cards(cards: list) -> list:
    """规范化卡片数据：补全 URL、清理标题、提取作者"""
    seen = set()
    normalized = []

    for card in cards:
        image_url = card.get("image_url", "").strip()
        title = card.get("title", "").strip()
        author = card.get("author", "").strip()
        link = card.get("link", "").strip()

        if image_url and not image_url.startswith("http"):
            image_url = TABLEAU_PUBLIC_BASE + image_url
        if link and not link.startswith("http"):
            link = TABLEAU_PUBLIC_BASE + link

        # 清理 "Workbook thumbnail, Real Title" → "Real Title"
        if title.lower().startswith("workbook thumbnail"):
            comma_idx = title.find(",")
            if comma_idx > 0:
                title = title[comma_idx + 1:].strip()
            else:
                title = ""

        # 从 URL 提取标题
        if not title and "/viz/" in link:
            try:
                parts = link.split("/viz/")[1].split("/")
                title = parts[-1].replace("-", " ")
            except Exception:
                pass

        # 从 profile 链接提取作者
        if not author and "/profile/" in link:
            try:
                author = link.split("/profile/")[1].split("/")[0]
            except Exception:
                pass

        key = image_url if image_url else title + author
        if key and key not in seen:
            seen.add(key)
            normalized.append({
                "image_url": image_url,
                "title": title,
                "author": author,
                "link": link,
            })

    return normalized


# ========== 图片下载 ==========

def download_image(url: str, output_dir: Path, session=None) -> Optional[Path]:
    """下载单张图片到指定目录"""
    if session is None:
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        })

    for attempt in range(3):
        try:
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "")
            if "image" not in ct and resp.content[:4] not in (b"\xff\xd8\xff", b"\x89PNG", b"GIF8", b"RIFF"):
                return None
            if len(resp.content) < MIN_IMAGE_SIZE_BYTES:
                return None

            url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
            ext = "jpg"
            if ct:
                for k, v in [("jpeg", "jpg"), ("png", "png"), ("webp", "webp"), ("gif", "gif")]:
                    if k in ct:
                        ext = v
                        break
            filepath = output_dir / f"tableau_{url_hash}.{ext}"
            filepath.write_bytes(resp.content)
            return filepath
        except Exception:
            if attempt < 2:
                time.sleep(1)
    return None


# ========== 数据库入库 ==========

def compute_image_hash(image_path: Path) -> str:
    return hashlib.sha256(image_path.read_bytes()).hexdigest()


def create_thumbnail(image_path: Path, thumb_dir: Path) -> str:
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_id = uuid.uuid4().hex
    thumb_filename = f"case_{thumb_id}_thumb.jpg"
    thumb_path = thumb_dir / thumb_filename
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((300, 200), Image.LANCZOS)
    img.save(thumb_path, "JPEG", quality=80)
    return f"/uploads/thumbnails/{thumb_filename}"


def save_original_to_uploads(image_path: Path, originals_dir: Path) -> str:
    originals_dir.mkdir(parents=True, exist_ok=True)
    case_id = uuid.uuid4().hex
    ext = image_path.suffix.lower().replace("jpeg", "jpg").lstrip(".")
    filename = f"case_{case_id}_{int(time.time() * 1000)}.{ext}"
    dest = originals_dir / filename
    shutil.copy2(image_path, dest)
    return f"/uploads/originals/{filename}"


def ingest_to_db(cards: list, db_path: Path, dry_run=False):
    """将卡片数据直接写入 VisualCase 表"""
    if not cards:
        print("  无卡片数据，跳过入库")
        return 0

    if dry_run:
        print(f"\n[dry-run] 将入库 {len(cards)} 条记录（预览前10条）：")
        for card in cards[:10]:
            print(f"  - {card.get('title', 'N/A')[:60]}")
            print(f"    图片: {card.get('image_url', '')[:90]}")
            print(f"    作者: {card.get('author', '')}")
            print(f"    链接: {card.get('link', '')}")
        return len(cards)

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    inserted = 0
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    })

    temp_dir = PROJECT_ROOT / ".tableau_temp"
    temp_dir.mkdir(exist_ok=True)

    for i, card in enumerate(cards):
        image_url = card.get("image_url", "")
        if not image_url:
            continue

        title = card.get("title", "")[:300]
        author = card.get("author", "")[:200]
        link = card.get("link", "")
        source_url = link if link else GALLERY_URL

        # 按 imageUrl 去重
        existing = cursor.execute(
            "SELECT id FROM VisualCase WHERE imageUrl = ? LIMIT 1", (image_url,)
        ).fetchone()
        if existing:
            print(f"  [{i+1}/{len(cards)}] 跳过(已存在): {title[:40]}")
            continue

        print(f"  [{i+1}/{len(cards)}] 下载: {title[:50] if title else image_url[:50]}")
        local_path = download_image(image_url, temp_dir, session)
        if not local_path:
            print(f"    下载失败")
            continue

        try:
            image_path = save_original_to_uploads(local_path, ORIGINALS_DIR)
            thumb_path = create_thumbnail(local_path, THUMBNAILS_DIR)
            image_hash = compute_image_hash(local_path)
        except Exception as e:
            print(f"    处理失败: {e}")
            local_path.unlink(missing_ok=True)
            continue

        local_path.unlink(missing_ok=True)

        # 按 imageHash 去重
        dup = cursor.execute(
            "SELECT id FROM VisualCase WHERE imageHash = ? AND imageHash != '' LIMIT 1",
            (image_hash,)
        ).fetchone()
        if dup:
            print(f"    重复图片, 跳过")
            continue

        case_id = uuid.uuid4().hex
        context_text = f"Tableau Viz Gallery | 作者: {author}" if author else "Tableau Viz Gallery 入选可视化"
        user_hint = f"{SOURCE_NAME} / {SOURCE_TYPE}"
        if author:
            user_hint += f" / by {author}"

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        cursor.execute("""
            INSERT INTO VisualCase (
                id, title, sourceUrl, sourceDomain, pageTitle, caseTitle,
                imageUrl, imagePath, thumbnailPath, imageHash,
                contextText, captureType, userHint,
                reviewStatus, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            case_id, title, source_url, SOURCE_DOMAIN,
            title, title,
            image_url, image_path, thumb_path, image_hash,
            context_text, CAPTURE_TYPE, user_hint,
            "pending_ai_analysis", now, now,
        ))
        inserted += 1
        print(f"    入库成功 ({inserted} total)")

    conn.commit()
    conn.close()

    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)

    return inserted


# ========== 主流程 ==========

def main():
    parser = argparse.ArgumentParser(description="Tableau Viz Gallery 抓取器")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不入库")
    parser.add_argument("--no-headless", action="store_true", help="显示浏览器窗口")
    parser.add_argument("--max-scrolls", type=int, default=10, help="最大滚动次数")
    parser.add_argument("--json-only", action="store_true", help="仅导出 JSON，不入库")
    parser.add_argument("--from-json", type=str, help="从已有 JSON 文件入库")
    args = parser.parse_args()

    ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

    if args.from_json:
        print(f"从 JSON 文件读取: {args.from_json}")
        with open(args.from_json) as f:
            data = json.load(f)
    else:
        data = scrape_gallery_page(max_scrolls=args.max_scrolls, headless=not args.no_headless)
        print(f"\n页面标题: {data['title']}")
        print(f"发现 {len(data['cards'])} 张候选卡片")

        with open(OUTPUT_JSON, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"JSON 已保存: {OUTPUT_JSON}")

    if args.json_only:
        return

    print(f"\n[2/3] 入库到 VisualCase...")
    if not DB_PATH.exists():
        print(f"错误: 数据库不存在: {DB_PATH}")
        return

    count = ingest_to_db(data["cards"], DB_PATH, dry_run=args.dry_run)
    if args.dry_run:
        print(f"\n[dry-run] 共 {len(data['cards'])} 条，预览完成")
    else:
        print(f"\n[3/3] 完成: 入库 {count} 条")

    conn = sqlite3.connect(str(DB_PATH))
    total = conn.execute(
        "SELECT COUNT(*) FROM VisualCase WHERE userHint LIKE ?",
        (f"{SOURCE_NAME}%",)
    ).fetchone()[0]
    conn.close()
    print(f"VisualCase 中 Tableau 来源记录总数: {total}")


if __name__ == "__main__":
    main()
