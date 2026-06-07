import { chromium } from 'playwright';
import { prisma } from '../prisma.js';
import { saveImageFromUrl, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate } from './collectionScoring.js';

type BrowserTarget = {
  label: string;
  goal: number;
  domains: string[];
  sourceName: string;
  sourceType: string;
  urls: string[];
};

const TARGETS: BrowserTarget[] = [
  {
    label: 'SJTU oce',
    goal: 20,
    domains: ['oce.sjtu.edu.cn'],
    sourceName: '上海交大-船建学院浏览器直达页',
    sourceType: 'university_department_browser_direct_page',
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
    domains: ['news.hit.edu.cn'],
    sourceName: '哈尔滨工业大学-浏览器直达科研成果页',
    sourceType: 'university_news_browser_direct_page',
    urls: [
      'https://news.hit.edu.cn/2026/0429/c11819a242085/page.htm',
      'https://news.hit.edu.cn/2026/0126/c11819a241007/page.htm',
      'https://news.hit.edu.cn/2026/0511/c11508a242211/page.htm',
      'https://news.hit.edu.cn/2026/0311/c11508a241436/page.htm',
      'https://news.hit.edu.cn/2025/0110/c11819a237230/page.htm',
      'https://news.hit.edu.cn/2024/0810/c1510a236347/page.htm',
      'https://news.hit.edu.cn/2023/0623/c1510a233659/page.htm',
      'https://news.hit.edu.cn/2022/1011/c1510a232302/page.htm',
    ],
  },
  {
    label: 'SEU',
    goal: 20,
    domains: ['news.seu.edu.cn'],
    sourceName: '东南大学-浏览器直达科研成果页',
    sourceType: 'university_news_browser_direct_page',
    urls: [
      'https://news.seu.edu.cn/2024/0508/c5527a489872/page.htm',
      'https://news.seu.edu.cn/2023/0402/c5485a440608/page.htm',
      'https://news.seu.edu.cn/2026/0519/c5495a568069/page.htm',
      'https://news.seu.edu.cn/2025/0626/c5485a534500/page.htm',
    ],
  },
];

function getStringArg(name: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : '';
}

function getNumberArg(name: string, fallback: number): number {
  const raw = getStringArg(name);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wanted(target: BrowserTarget, only: string): boolean {
  if (!only) return true;
  const terms = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const haystack = `${target.label} ${target.sourceName}`.toLowerCase();
  return terms.some(term => haystack.includes(term));
}

async function countTarget(target: BrowserTarget) {
  return prisma.visualCase.count({
    where: {
      sourceDomain: { in: target.domains },
      reviewStatus: { not: 'rejected' },
    },
  });
}

async function render(url: string, executablePath: string | null) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1400 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (const ratio of [0, 0.3, 0.65, 1]) {
      await page.evaluate(r => window.scrollTo(0, Math.floor(document.body.scrollHeight * r)), ratio);
      await page.waitForTimeout(1200);
    }
    await page.$$eval('img', imgs => {
      for (const img of imgs) {
        const src = img.currentSrc || img.src;
        if (src) img.setAttribute('src', src);
        if (img.naturalWidth) img.setAttribute('width', String(img.naturalWidth));
        if (img.naturalHeight) img.setAttribute('height', String(img.naturalHeight));
      }
    });
    return { finalUrl: page.url(), title: await page.title(), html: await page.content() };
  } finally {
    await browser.close();
  }
}

async function markBrowserCases(sourceName: string) {
  const updated = await prisma.visualCase.updateMany({
    where: {
      userHint: { startsWith: sourceName },
      reviewStatus: { in: ['pending_ai_analysis', 'analysis_failed'] },
    },
    data: {
      reviewStatus: 'needs_review',
      manualNotes: 'direct_browser_supplement: exact page rendered in Chrome; AI analysis unavailable, queued for human review',
    },
  });
  return updated.count;
}

async function runTarget(target: BrowserTarget, execute: boolean, maxImagesPerPage: number, executablePath: string | null) {
  const before = await countTarget(target);
  const gap = Math.max(0, target.goal - before);
  let created = 0;
  let renderedCount = 0;
  let duplicates = 0;
  let failed = 0;

  if (!gap) {
    console.log(`[skip] ${target.label}: current=${before}, goal=${target.goal}`);
    return { label: target.label, before, after: before, goal: target.goal, rendered: 0, created, duplicates, failed, marked: 0 };
  }

  for (const url of target.urls) {
    if (created >= gap) break;
    try {
      const rendered = await render(url, executablePath);
      renderedCount++;
      const extracted = await extractImagesFromPage(rendered.finalUrl, rendered.html);
      const { valid } = filterImageCandidates(extracted.images);
      const context = [extracted.metaDescription, extracted.bodyText].filter(Boolean).join('\n').slice(0, 1200);
      const selected = valid
        .map(image => ({
          image,
          score: scoreImageCandidate({
            image,
            pageTitle: extracted.pageTitle || rendered.title,
            pageUrl: rendered.finalUrl,
            sourceName: target.sourceName,
            sourceType: target.sourceType,
            metaDescription: extracted.metaDescription,
            bodyText: extracted.bodyText,
          }),
        }))
        .sort((a, b) => b.score.score - a.score.score)
        .filter(item => item.score.shouldKeep)
        .slice(0, maxImagesPerPage);

      console.log(`[render] ${target.label}: ${url} candidates=${valid.length} selected=${selected.length}`);
      if (!execute) continue;

      for (const item of selected) {
        if (created >= gap) break;
        try {
          const imageResult = await saveImageFromUrl(item.image.src);
          const duplicate = await findDuplicateCase(imageResult.imageHash);
          if (duplicate) {
            await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
            duplicates++;
            continue;
          }
          const caseEntry = await prisma.visualCase.create({
            data: {
              sourceUrl: rendered.finalUrl,
              sourceDomain: new URL(rendered.finalUrl).hostname,
              pageTitle: extracted.pageTitle || rendered.title,
              imageUrl: item.image.src,
              imagePath: imageResult.imagePath,
              thumbnailPath: imageResult.thumbnailPath,
              imageHash: imageResult.imageHash,
              contextText: [item.image.contextText, context].filter(Boolean).join('\n').slice(0, 1500),
              captureType: 'crawler_browser',
              userHint: [target.sourceName, target.sourceType].join(' / '),
              collectionScore: item.score.score,
              collectionReasons: JSON.stringify(item.score.reasons),
              reviewStatus: 'pending_ai_analysis',
            },
          });
          created++;
          runAnalysis(caseEntry.id, imageResult.imagePath, extracted.pageTitle || rendered.title, rendered.finalUrl, context);
        } catch (err) {
          failed++;
          console.log(`  [warn] image failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      failed++;
      console.log(`[render] ${target.label}: failed ${url}: ${(err as Error).message}`);
    }
  }

  const marked = execute ? await markBrowserCases(target.sourceName) : 0;
  const after = await countTarget(target);
  console.log(`[done] ${target.label}: ${before}->${after}, created=${created}, marked=${marked}, dupes=${duplicates}, failed=${failed}`);
  return { label: target.label, before, after, goal: target.goal, rendered: renderedCount, created, duplicates, failed, marked };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const only = getStringArg('only');
  const maxImages = getNumberArg('max-images-per-page', 6);
  const executablePath = getStringArg('chrome-executable') || process.env.CHROME_EXECUTABLE || null;
  const selected = TARGETS.filter(target => wanted(target, only));
  if (!selected.length) throw new Error(`No targets matched --only=${only}`);

  console.log(`Direct browser supplement: ${execute ? 'EXECUTE' : 'DRY-RUN'} (${selected.length} targets)`);
  const results = [];
  for (const target of selected) {
    results.push(await runTarget(target, execute, maxImages, executablePath));
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
