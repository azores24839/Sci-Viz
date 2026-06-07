import { chromium } from 'playwright';
import { prisma } from '../prisma.js';
import { saveImage, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';

type ScreenshotTarget = {
  label: string;
  goal: number;
  domain: string;
  sourceName: string;
  sourceType: string;
  urls: string[];
};

const TARGETS: ScreenshotTarget[] = [
  {
    label: 'SJTU oce',
    goal: 20,
    domain: 'oce.sjtu.edu.cn',
    sourceName: '上海交大-船建学院官网页截图补采',
    sourceType: 'university_department_page_screenshot',
    urls: [
      'https://oce.sjtu.edu.cn/zzjg_sys/12954.html',
      'https://oce.sjtu.edu.cn/cg_js/13822.html',
      'https://oce.sjtu.edu.cn/zzjg_yx/3104.html',
      'https://oce.sjtu.edu.cn/sys1.html',
    ],
  },
  {
    label: 'HIT',
    goal: 20,
    domain: 'news.hit.edu.cn',
    sourceName: '哈尔滨工业大学-官网科研页截图补采',
    sourceType: 'university_news_page_screenshot',
    urls: [
      'https://news.hit.edu.cn/2026/0512/c11819a242220/page.htm',
      'https://news.hit.edu.cn/2026/0429/c11819a242085/page.htm',
      'https://news.hit.edu.cn/2026/0126/c11819a241007/page.htm',
      'https://news.hit.edu.cn/2026/0511/c11508a242211/page.htm',
      'https://news.hit.edu.cn/2026/0311/c11508a241436/page.htm',
      'https://news.hit.edu.cn/2026/0311/c11819a241453/page.htm',
      'https://news.hit.edu.cn/2025/0818/c11508a239122/page.htm',
      'https://news.hit.edu.cn/2025/0707/c11819a238475/page.htm',
      'https://news.hit.edu.cn/2025/0625/c11819a238407/page.htm',
      'https://news.hit.edu.cn/2025/0618/c11819a238366/page.htm',
      'https://news.hit.edu.cn/2025/0110/c11819a237230/page.htm',
      'https://news.hit.edu.cn/2024/1205/c11819a236969/page.htm',
      'https://news.hit.edu.cn/2024/0624/c1510a236096/page.htm',
      'https://news.hit.edu.cn/2024/0810/c1510a236347/page.htm',
      'https://news.hit.edu.cn/2023/0623/c1510a233659/page.htm',
      'https://news.hit.edu.cn/2022/1011/c1510a232302/page.htm',
    ],
  },
];

function getStringArg(name: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : '';
}

function wanted(target: ScreenshotTarget, only: string) {
  if (!only) return true;
  const terms = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const haystack = `${target.label} ${target.sourceName}`.toLowerCase();
  return terms.some(term => haystack.includes(term));
}

async function countTarget(target: ScreenshotTarget) {
  return prisma.visualCase.count({
    where: {
      sourceDomain: target.domain,
      reviewStatus: { not: 'rejected' },
    },
  });
}

async function capture(url: string, executablePath: string | null) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1200 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    const article = page.locator('article, .wp_articlecontent, .article, .content, main').first();
    const box = await article.boundingBox().catch(() => null);
    const buffer = box
      ? await page.screenshot({
          type: 'png',
          clip: {
            x: Math.max(0, box.x),
            y: Math.max(0, box.y),
            width: Math.min(1100, box.width || 1100),
            height: Math.min(1000, box.height || 1000),
          },
        })
      : await page.screenshot({ type: 'png', fullPage: false });
    return { finalUrl: page.url(), title, bodyText: bodyText.slice(0, 1200), buffer: Buffer.from(buffer) };
  } finally {
    await browser.close();
  }
}

async function runTarget(target: ScreenshotTarget, execute: boolean, executablePath: string | null) {
  const before = await countTarget(target);
  const gap = Math.max(0, target.goal - before);
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  if (!gap) {
    console.log(`[skip] ${target.label}: current=${before}, goal=${target.goal}`);
    return { label: target.label, before, after: before, goal: target.goal, created, duplicates, failed };
  }

  for (const url of target.urls) {
    if (created >= gap) break;
    try {
      const existing = await prisma.visualCase.findFirst({
        where: {
          sourceUrl: url,
          captureType: 'official_page_screenshot',
          reviewStatus: { not: 'rejected' },
        },
        select: { id: true },
      });
      if (existing) {
        duplicates++;
        continue;
      }
      const shot = await capture(url, executablePath);
      console.log(`[capture] ${target.label}: ${shot.title || url}`);
      if (!execute) continue;

      const saved = await saveImage(shot.buffer, 'png');
      const duplicate = await findDuplicateCase(saved.imageHash);
      if (duplicate) {
        await deleteSavedImage(saved.imagePath, saved.thumbnailPath);
        duplicates++;
        continue;
      }

      await prisma.visualCase.create({
        data: {
          sourceUrl: shot.finalUrl,
          sourceDomain: new URL(shot.finalUrl).hostname,
          pageTitle: shot.title,
          imagePath: saved.imagePath,
          thumbnailPath: saved.thumbnailPath,
          imageHash: saved.imageHash,
          contextText: shot.bodyText,
          captureType: 'official_page_screenshot',
          userHint: `${target.sourceName} / ${target.sourceType}`,
          mediaType: '网页截图',
          contentType: '官网科研报道',
          technicalMethod: '浏览器截图',
          functionalPurpose: '记录',
          distributionMedium: '静图',
          collectionScore: 60,
          reviewStatus: 'needs_review',
          manualNotes: 'official_page_screenshot_supplement: exact official research page; used when article images were not extractable',
        },
      });
      created++;
    } catch (err) {
      failed++;
      console.log(`[capture] ${target.label}: failed ${url}: ${(err as Error).message}`);
    }
  }

  const after = await countTarget(target);
  console.log(`[done] ${target.label}: ${before}->${after}, created=${created}, dupes=${duplicates}, failed=${failed}`);
  return { label: target.label, before, after, goal: target.goal, created, duplicates, failed };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const only = getStringArg('only');
  const executablePath = getStringArg('chrome-executable') || process.env.CHROME_EXECUTABLE || null;
  const selected = TARGETS.filter(target => wanted(target, only));
  if (!selected.length) throw new Error(`No targets matched --only=${only}`);

  console.log(`Official page screenshot supplement: ${execute ? 'EXECUTE' : 'DRY-RUN'} (${selected.length} targets)`);
  const results = [];
  for (const target of selected) {
    results.push(await runTarget(target, execute, executablePath));
  }
  console.log('SUMMARY');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
