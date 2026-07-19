import { chromium, type BrowserContext, type Page } from 'playwright';
import { pathToFileURL } from 'url';
import { prisma } from '../prisma.js';
import { assertPublicHttpUrl } from '../utils/httpSafety.js';
import { deleteSavedImage, saveImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate, scoreSurveyImage } from './collectionScoring.js';

type UniversityBrowserTarget = {
  key: string;
  sourceName: string;
  sourceType: string;
  listUrls: string[];
  allowedHosts: string[];
  allowedFinalHosts?: string[];
  articlePatterns: RegExp[];
  excludePatterns?: RegExp[];
  preferredLinkPatterns?: RegExp[];
  excludedLinkPatterns?: RegExp[];
  excludedPagePatterns?: RegExp[];
};

type RenderedPage = {
  finalUrl: string;
  title: string;
  html: string;
};

const TARGETS: UniversityBrowserTarget[] = [
  {
    key: 'melbourne-newsroom',
    sourceName: 'Melbourne Research News',
    sourceType: 'university_research_portal',
    listUrls: ['https://www.unimelb.edu.au/newsroom/news'],
    allowedHosts: ['www.unimelb.edu.au'],
    articlePatterns: [/\/newsroom\/news\/20\d{2}\//i],
    preferredLinkPatterns: [/\b(research|medical|health|engineering|science|cancer|technology|climate)\b/i],
  },
  {
    key: 'sydney-engineering',
    sourceName: 'University of Sydney News',
    sourceType: 'university_research_portal',
    listUrls: ['https://www.sydney.edu.au/engineering/news-and-events/news.html'],
    allowedHosts: ['www.sydney.edu.au'],
    articlePatterns: [/\/news-opinion\/news\/20\d{2}\/.+\.html$/i],
    preferredLinkPatterns: [/\b(research|engineering|quantum|chip|ai|robot|medical|health|materials)\b/i],
  },
  {
    key: 'penn-engineering',
    sourceName: 'Penn Engineering News',
    sourceType: 'university_research_portal',
    listUrls: ['https://news.seas.upenn.edu/'],
    allowedHosts: ['news.seas.upenn.edu'],
    articlePatterns: [/\/news\/.+\/$/i],
    preferredLinkPatterns: [/\b(research|engineering|robot|material|chip|ai|medical|health)\b/i],
  },
  {
    key: 'eth-ai',
    sourceName: 'ETH AI Center',
    sourceType: 'research_center',
    listUrls: ['https://ai.ethz.ch/news-and-events/ai-center-news.html'],
    allowedHosts: ['ai.ethz.ch'],
    articlePatterns: [/\/news-and-events\/ai-center-news\/20\d{2}\//i],
    preferredLinkPatterns: [/\b(ai|research|model|clinical|technology|comput)/i],
    excludedLinkPatterns: [/\b(summit|challenge|founder|conference|award)/i],
  },
  {
    key: 'yale-engineering',
    sourceName: 'Yale Engineering (SEAS)',
    sourceType: 'university_news',
    listUrls: ['https://engineering.yale.edu/news-and-events/news'],
    allowedHosts: ['engineering.yale.edu'],
    articlePatterns: [/\/news-and-events\/news\/[^/]+\/?$/i],
    preferredLinkPatterns: [/\b(research|engineer|material|quantum|comput|robot|device|technology)/i],
  },
  {
    key: 'nus-enterprise',
    sourceName: 'NUS Enterprise',
    sourceType: 'innovation_entrepreneurship',
    listUrls: [
      'https://enterprise.nus.edu.sg/start-up-stories/',
      'https://enterprise.nus.edu.sg/news/',
    ],
    allowedHosts: ['enterprise.nus.edu.sg'],
    articlePatterns: [
      /\/start-up-stories\/[^/]+\/?$/i,
      /\/news\/[^/]+\/?$/i,
    ],
    preferredLinkPatterns: [/\b(start-?up|technology|deep tech|innovation|research|venture)/i],
    excludedLinkPatterns: [/\b(event|award|ceremony|anniversary|demo day)/i],
  },
  {
    key: 'cqt',
    sourceName: 'Centre for Quantum Technologies',
    sourceType: 'research_centre',
    listUrls: [
      'https://www.cqt.sg/',
      'https://www.cqt.sg/highlights',
    ],
    allowedHosts: ['www.cqt.sg', 'cqt.sg'],
    articlePatterns: [/\/highlight\/20\d{2}-/i],
    preferredLinkPatterns: [/\b(science|research|quantum|photon|atom|algorithm|catalysis|memory|random)/i],
    excludedLinkPatterns: [/\b(graduat|award|meet a cqtian|workshop|conference|welcomes|celebrat|hackamonth|hackathon)/i],
  },
  {
    key: 'mbi',
    sourceName: 'Mechanobiology Institute',
    sourceType: 'research_institute',
    listUrls: [
      'https://www.mbi.nus.edu.sg/',
      'https://www.mbi.nus.edu.sg/news/',
    ],
    allowedHosts: ['www.mbi.nus.edu.sg', 'mbi.nus.edu.sg'],
    allowedFinalHosts: ['www.science.nus.edu.sg'],
    articlePatterns: [/\/news\/[^/]+\/?$/i],
    excludePatterns: [/\/news\/?$/i],
    preferredLinkPatterns: [/\b(cell|molecule|mechan|research|biology|protein|force)/i],
    excludedLinkPatterns: [/\b(student|school|visit|conference|celebrat|award)/i],
  },
  {
    key: 'csi',
    sourceName: 'Cancer Science Institute of Singapore',
    sourceType: 'research_institute',
    listUrls: [
      'https://csi.nus.edu.sg/',
      'https://csi.nus.edu.sg/news-events/latest-happenings/',
    ],
    allowedHosts: ['csi.nus.edu.sg'],
    articlePatterns: [
      /^\/[^/]{30,}\/?$/i,
    ],
    excludePatterns: [
      /^\/news-events\//i,
      /^\/our-research\//i,
      /^\/events-calendar\//i,
    ],
    preferredLinkPatterns: [/\b(research|cancer|cell|genom|therapy|clinical|ai|supercomput|medicine)/i],
    excludedLinkPatterns: [/\b(annual meeting|event|award|celebrat|visit|seminar)/i],
  },
  {
    key: 'ifim',
    sourceName: 'Institute for Functional Intelligent Materials',
    sourceType: 'research_institute',
    listUrls: [
      'https://ifim.nus.edu.sg/',
      'https://ifim.nus.edu.sg/news-and-events/',
    ],
    allowedHosts: ['ifim.nus.edu.sg'],
    articlePatterns: [
      /^\/[^/]{30,}\/?$/i,
    ],
    excludePatterns: [
      /^\/news-and-events\//i,
      /^\/research\//i,
    ],
    preferredLinkPatterns: [/\b(material|nature|research|ai|robot|hardware|device|membrane|energy)/i],
    excludedLinkPatterns: [/\b(award|presentation|seminar|celebrat|visit|official launch)/i],
    excludedPagePatterns: [/\b(speaker|hosted by|meeting room|seminar)\b/i],
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

function getNonNegativeNumberArg(name: string, fallback: number): number {
  const raw = getStringArg(name);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBooleanArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function matchesOnly(target: UniversityBrowserTarget, only: string): boolean {
  if (!only) return true;
  const terms = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const haystack = `${target.key} ${target.sourceName}`.toLowerCase();
  return terms.some(term => haystack.includes(term));
}

function isArticleUrl(target: UniversityBrowserTarget, rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!target.allowedHosts.includes(url.hostname.toLowerCase())) return false;
    if (target.excludePatterns?.some(pattern => pattern.test(url.pathname))) return false;
    return target.articlePatterns.some(pattern => pattern.test(url.pathname));
  } catch {
    return false;
  }
}

async function scrollPage(page: Page) {
  for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate(value => {
      window.scrollTo(0, Math.floor(document.documentElement.scrollHeight * value));
    }, ratio);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function renderPage(page: Page, rawUrl: string): Promise<RenderedPage> {
  const checkedUrl = await assertPublicHttpUrl(rawUrl);
  try {
    await page.goto(checkedUrl.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err) {
    const readyState = await page.evaluate(() => document.readyState).catch(() => 'loading');
    if (page.url() !== checkedUrl.href || readyState === 'loading') {
      await page.goto(checkedUrl.href, { waitUntil: 'commit', timeout: 30_000 });
    } else {
      console.warn(`[render] continuing after navigation timeout: ${checkedUrl.href}`);
    }
  }
  await page.waitForTimeout(750);
  await scrollPage(page);

  await page.$$eval('img', images => {
    for (const image of images) {
      const src = image.currentSrc || image.src;
      if (src) {
        image.setAttribute('src', src);
        image.setAttribute('data-rendered-src', src);
      }
      if (image.naturalWidth) image.setAttribute('width', String(image.naturalWidth));
      if (image.naturalHeight) image.setAttribute('height', String(image.naturalHeight));
    }
  });

  return {
    finalUrl: page.url(),
    title: await page.title(),
    html: await page.content(),
  };
}

async function discoverArticleUrls(
  page: Page,
  target: UniversityBrowserTarget,
  maxArticles: number,
  collectAll: boolean,
  startAt: number,
): Promise<string[]> {
  const discovered: string[] = [];
  const seen = new Set<string>();
  const candidates: Array<{ url: string; context: string; score: number }> = [];

  for (const listUrl of target.listUrls) {
    try {
      await renderPage(page, listUrl);
      const hrefs = await page.$$eval('a[href]', anchors =>
        anchors.map(anchor => ({
          href: (anchor as HTMLAnchorElement).href,
          context: [
            (anchor as HTMLAnchorElement).href,
            (anchor as HTMLElement).innerText,
          ].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 500),
        })).filter(item => Boolean(item.href))
      );
      for (const item of hrefs) {
        const href = item.href;
        if (!isArticleUrl(target, href)) continue;
        if (!collectAll && target.excludedLinkPatterns?.some(pattern => pattern.test(item.context))) continue;
        const normalized = new URL(href);
        normalized.hash = '';
        const key = `${normalized.origin}${normalized.pathname}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const score = target.preferredLinkPatterns?.some(pattern => pattern.test(item.context)) ? 20 : 0;
        candidates.push({ url: normalized.href, context: item.context, score });
      }
    } catch (err) {
      console.warn(`[discover] ${target.key}: ${listUrl} failed: ${(err as Error).message}`);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates.slice(startAt, startAt + maxArticles)) {
    discovered.push(candidate.url);
  }
  return discovered;
}

function extensionFromResponse(contentType: string, imageUrl: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  const pathname = new URL(imageUrl).pathname.toLowerCase();
  if (pathname.endsWith('.png')) return 'png';
  if (pathname.endsWith('.webp')) return 'webp';
  if (pathname.endsWith('.gif')) return 'gif';
  return 'jpg';
}

async function saveImageFromBrowserContext(
  context: BrowserContext,
  imageUrl: string,
  referer: string,
) {
  const checkedUrl = await assertPublicHttpUrl(imageUrl);
  const response = await context.request.get(checkedUrl.href, {
    headers: {
      Referer: referer,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    timeout: 45_000,
  });
  if (!response.ok()) {
    throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
  }
  const contentType = response.headers()['content-type'] || '';
  if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
    throw new Error(`unexpected content-type "${contentType}"`);
  }
  const buffer = await response.body();
  return saveImage(buffer, extensionFromResponse(contentType, checkedUrl.href));
}

function isUsefulBatchImage(imageUrl: string): boolean {
  const lower = imageUrl.toLowerCase();
  return ![
    'logo',
    'favicon',
    'default_og',
    '/header/',
    'placeholder',
    'site-icon',
    'cropped-',
    'brandmark',
    'wechat',
    'weixin',
    'qrcode',
    'qr-code',
    'share-',
    'social-',
  ].some(pattern => lower.includes(pattern));
}

async function createJob(target: UniversityBrowserTarget) {
  const source = await prisma.crawlSource.findFirst({
    where: { name: target.sourceName },
  });
  if (!source) return null;
  return prisma.crawlJob.create({
    data: {
      sourceId: source.id,
      status: 'discovering',
    },
  });
}

async function runTarget(
  context: BrowserContext,
  page: Page,
  target: UniversityBrowserTarget,
  options: {
    execute: boolean;
    collectAll: boolean;
    maxArticles: number;
    maxImagesPerPage: number;
    maxCasesPerSource: number;
    minScore: number;
    startAt: number;
    startImageAt: number;
    jobId?: number;
  },
) {
  const before = await prisma.visualCase.count({
    where: {
      OR: [
        { sourceDomain: { in: target.allowedHosts } },
        { userHint: { startsWith: target.sourceName } },
      ],
    },
  });
  const job = options.execute
    ? (options.jobId ? { id: options.jobId } : await createJob(target))
    : null;
  const articleUrls = await discoverArticleUrls(page, target, options.maxArticles, options.collectAll, options.startAt);

  if (job) {
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: articleUrls.length ? 'crawling' : 'partial',
        discoveredUrls: JSON.stringify(articleUrls),
        totalCount: articleUrls.length,
        startedAt: new Date(),
        heartbeatAt: new Date(),
        warning: articleUrls.length ? '' : '没有发现文章链接，可能是入口变化、需要翻页或网站阻挡，请检查后再重试。',
      },
    });
    if (articleUrls.length) {
      await prisma.crawlItem.createMany({
        data: articleUrls.map(url => ({ jobId: job.id, sourceId: (target as UniversityBrowserTarget & { sourceId?: number }).sourceId || 0, url })),
      }).catch(() => {});
    }
  }

  console.log(`[discover] ${target.key}: ${articleUrls.length} article URLs`);
  let renderedCount = 0;
  let createdCount = 0;
  let duplicateCount = 0;
  let failedImageCount = 0;
  let failedPageCount = 0;
  let candidateImageCount = 0;
  let articlesWithImages = 0;
  const completedUrls: string[] = [];
  const samples: Array<{ pageUrl: string; imageUrl: string; score: number }> = [];

  for (const articleUrl of articleUrls) {
    if (createdCount >= options.maxCasesPerSource) break;
    try {
      const rendered = await renderPage(page, articleUrl);
      const finalHost = new URL(rendered.finalUrl).hostname.toLowerCase();
      const allowedFinalHosts = [...target.allowedHosts, ...(target.allowedFinalHosts || [])];
      if (!allowedFinalHosts.includes(finalHost)) {
        console.warn(`[page] ${target.key}: skipped redirect outside target (${rendered.finalUrl})`);
        continue;
      }
      renderedCount++;
      const extracted = await extractImagesFromPage(rendered.finalUrl, rendered.html, { mode: 'survey' });
      const pageText = [
        extracted.pageTitle || rendered.title,
        extracted.metaDescription,
        extracted.bodyText,
      ].filter(Boolean).join(' ');
      if (!options.collectAll && target.excludedPagePatterns?.some(pattern => pattern.test(pageText))) {
        console.warn(`[page] ${target.key}: skipped low-value event page (${rendered.finalUrl})`);
        continue;
      }
      const { valid, filteredCount } = filterImageCandidates(extracted.images);
      const selected = valid
        .map(image => ({
          image,
          score: (options.collectAll ? scoreSurveyImage : scoreImageCandidate)({
            image,
            pageTitle: extracted.pageTitle || rendered.title,
            pageUrl: rendered.finalUrl,
            sourceName: target.sourceName,
            sourceType: target.sourceType,
            metaDescription: extracted.metaDescription,
            bodyText: extracted.bodyText,
          }),
        }))
        .filter(item => options.collectAll
          ? true
          : item.score.shouldKeep
            && item.score.score >= options.minScore
            && isUsefulBatchImage(item.image.src)
        )
        .sort((a, b) => b.score.score - a.score.score)
        .slice(options.startImageAt)
        .slice(0, options.maxImagesPerPage);
      candidateImageCount += valid.length;
      if (selected.length > 0) articlesWithImages++;

      console.log(
        `[page] ${target.key}: ${rendered.finalUrl} candidates=${extracted.images.length} valid=${valid.length} filtered=${filteredCount} selected=${selected.length}`,
      );

      const createdBeforePage = createdCount;
      for (const item of selected) {
        if (samples.length < 8) {
          samples.push({
            pageUrl: rendered.finalUrl,
            imageUrl: item.image.src,
            score: item.score.score,
          });
        }
        if (!options.execute || createdCount >= options.maxCasesPerSource) continue;

        let saved;
        try {
          saved = await saveImageFromBrowserContext(context, item.image.src, rendered.finalUrl);
        } catch (err) {
          failedImageCount++;
          console.warn(`[image] ${target.key}: ${item.image.src} failed: ${(err as Error).message}`);
          continue;
        }

        const duplicate = await findDuplicateCase(saved.imageHash);
        if (duplicate) {
          duplicateCount++;
          await deleteSavedImage(saved.imagePath, saved.thumbnailPath);
          continue;
        }

        const contextText = [
          item.image.contextText,
          extracted.metaDescription,
          extracted.bodyText,
        ].filter(Boolean).join('\n').slice(0, 1500);

        try {
          await prisma.visualCase.create({
            data: {
              sourceUrl: rendered.finalUrl,
              sourceDomain: new URL(rendered.finalUrl).hostname,
              pageTitle: extracted.pageTitle || rendered.title,
              imageUrl: item.image.src,
              imagePath: saved.imagePath,
              thumbnailPath: saved.thumbnailPath,
              imageHash: saved.imageHash,
              contextText,
              captureType: 'crawler_browser',
              userHint: `${target.sourceName} / ${target.sourceType}`,
              collectionScore: item.score.score,
              collectionReasons: JSON.stringify(item.score.reasons),
              reviewStatus: 'needs_review',
              manualNotes: 'university_browser_batch: rendered article and downloaded image with the same browser session',
            },
          });
          createdCount++;
        } catch (err) {
          await deleteSavedImage(saved.imagePath, saved.thumbnailPath);
          failedImageCount++;
          console.warn(`[db] ${target.key}: create failed: ${(err as Error).message}`);
        }
      }
      completedUrls.push(rendered.finalUrl);
      if (job) {
        await prisma.crawlItem.updateMany({
          where: { jobId: job.id, url: articleUrl },
          data: { status: 'completed', foundImages: selected.length, downloadedImages: createdCount - createdBeforePage },
        }).catch(() => {});
      }
    } catch (err) {
      failedPageCount++;
      console.warn(`[page] ${target.key}: ${articleUrl} failed: ${(err as Error).message}`);
      if (job) {
        await prisma.crawlItem.updateMany({
          where: { jobId: job.id, url: articleUrl },
          data: { status: 'failed', attempts: { increment: 1 }, error: (err as Error).message },
        }).catch(() => {});
      }
    }

    if (job) {
      await prisma.crawlJob.update({
        where: { id: job.id },
        data: {
          crawledCount: renderedCount,
          crawledUrls: JSON.stringify(completedUrls),
          newCases: createdCount,
          pagesVisited: renderedCount,
          articlesWithImages,
          candidateImages: candidateImageCount,
          downloadedImages: createdCount,
          duplicateImages: duplicateCount,
          failedPages: failedPageCount,
          failedImages: failedImageCount,
          heartbeatAt: new Date(),
        },
      });
    }
  }

  if (job) {
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: {
        status: failedPageCount || failedImageCount || articleUrls.length === 0 ? 'partial' : 'completed',
        crawledCount: renderedCount,
        crawledUrls: JSON.stringify(completedUrls),
        newCases: createdCount,
        warning: failedPageCount || failedImageCount
          ? `有 ${failedPageCount} 篇文章或 ${failedImageCount} 张图片失败，可稍后重试。`
          : articleUrls.length === 0
            ? '没有发现文章链接，可能存在漏采。'
            : '',
        pagesVisited: renderedCount,
        articlesWithImages,
        candidateImages: candidateImageCount,
        downloadedImages: createdCount,
        duplicateImages: duplicateCount,
        failedPages: failedPageCount,
        failedImages: failedImageCount,
        heartbeatAt: new Date(),
        finishedAt: new Date(),
      },
    });
  }

  const after = await prisma.visualCase.count({
    where: {
      OR: [
        { sourceDomain: { in: target.allowedHosts } },
        { userHint: { startsWith: target.sourceName } },
      ],
    },
  });
  return {
    key: target.key,
    sourceName: target.sourceName,
    before,
    after,
    discovered: articleUrls.length,
    rendered: renderedCount,
    created: createdCount,
    duplicates: duplicateCount,
    failedImages: failedImageCount,
    samples,
  };
}

export function supportsUniversityBrowserSource(sourceName: string): boolean {
  return TARGETS.some(target => target.sourceName === sourceName);
}

export async function runUniversityBrowserSource(
  sourceName: string,
  sourceId: number,
  jobId: number,
  options: { maxArticles?: number; maxImagesPerPage?: number } = {},
) {
  const target = TARGETS.find(item => item.sourceName === sourceName);
  if (!target) throw new Error(`No browser adapter configured for ${sourceName}`);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE || undefined });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const targetWithSource = Object.assign({}, target, { sourceId });
    try {
      return await runTarget(context, page, targetWithSource, {
        execute: true,
        collectAll: true,
        maxArticles: options.maxArticles ?? 30,
        maxImagesPerPage: options.maxImagesPerPage ?? 100,
        maxCasesPerSource: 500,
        minScore: 1,
        startAt: 0,
        startImageAt: 0,
        jobId,
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  const collectAll = getBooleanArg('collect-all');
  const only = getStringArg('only');
  const maxArticles = getNumberArg('max-articles', 5);
  const maxImagesPerPage = getNumberArg('max-images-per-page', 2);
  const maxCasesPerSource = getNumberArg('max-cases-per-source', 6);
  const minScore = getNumberArg('min-score', 70);
  const startAt = getNonNegativeNumberArg('start-at', 0);
  const startImageAt = getNonNegativeNumberArg('start-image-at', 0);
  const executablePath = getStringArg('chrome-executable') || process.env.CHROME_EXECUTABLE || undefined;
  const selectedTargets = TARGETS.filter(target => matchesOnly(target, only));
  if (!selectedTargets.length) {
    throw new Error(`No targets matched --only=${only}`);
  }

  console.log(
    `University browser batch: ${execute ? 'EXECUTE' : 'DRY-RUN'} targets=${selectedTargets.length} collectAll=${collectAll} maxArticles=${maxArticles} maxImagesPerPage=${maxImagesPerPage} maxCasesPerSource=${maxCasesPerSource} minScore=${minScore}`,
  );

  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1200 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    const results = [];
    for (const target of selectedTargets) {
      results.push(await runTarget(context, page, target, {
        execute,
        collectAll,
        maxArticles,
        maxImagesPerPage,
        maxCasesPerSource,
        minScore,
        startAt,
        startImageAt,
      }));
      await page.waitForTimeout(1_000);
    }
    await context.close();
    console.log('SUMMARY');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch(err => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
