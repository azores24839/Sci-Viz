import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { prisma } from '../prisma.js';
import { deleteSavedImage, saveImage, saveImageFromUrl } from '../services/image.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { assertPublicHttpUrl, assertSameOriginUrl, readTextWithLimit } from '../utils/httpSafety.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate } from './collectionScoring.js';

type CheerioRoot = ReturnType<typeof cheerio.load>;

export interface StanfordDiscoveredUrl {
  url: string;
  title: string;
  depth: number;
  source: 'seed' | 'index' | 'article_recommendation';
  fromUrl: string;
}

interface StanfordDiscoveryOptions {
  seedUrl?: string;
  maxUrls?: number;
  maxDepth?: number;
  maxIndexLinks?: number;
  executablePath?: string | null;
}

interface StanfordRunOptions extends StanfordDiscoveryOptions {
  execute?: boolean;
}

interface StanfordRunResult {
  discoveredUrlCount: number;
  processedUrlCount: number;
  createdCaseCount: number;
  urls: StanfordDiscoveredUrl[];
  processedUrls: string[];
  errors: string[];
}

const DEFAULT_SOURCE_URL = 'https://news.stanford.edu/';
const SOURCE_NAME = 'Stanford Report';
const SOURCE_TYPE = 'university_research_news';
const TARGET_DISCIPLINE = '综合科研';
const MAX_IMAGES_PER_PAGE = 5;

const INDEX_LINK_SELECTORS = [
  'a[href*="/stories/20"]',
  '.su-stretched-link[href]',
  '.su-component-card a[href]',
  'article a[href]',
  'h2 a[href], h3 a[href]',
];

const ARTICLE_RECOMMENDATION_SELECTORS = [
  'a[href*="/stories/20"]',
  'section a[href*="/stories/20"]',
  'aside a[href*="/stories/20"]',
  '.su-component-card a[href*="/stories/20"]',
  '.su-stretched-link[href*="/stories/20"]',
];

function normalizeStoryUrl(rawHref: string, baseUrl: string): string | null {
  if (!rawHref) return null;
  try {
    const href = new URL(rawHref, baseUrl);
    const sameOrigin = assertSameOriginUrl(href.href, DEFAULT_SOURCE_URL);
    if (!sameOrigin) return null;
    const parsed = new URL(sameOrigin);
    if (!/^\/stories\/20\d{2}\//i.test(parsed.pathname)) return null;
    parsed.hash = '';
    parsed.search = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function storyKey(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

async function renderHtml(url: string, executablePath: string | null): Promise<{ finalUrl: string; title: string; html: string }> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
  });

  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.$$eval('img', imgs => {
      for (const img of imgs) {
        const currentSrc = img.currentSrc || img.src;
        if (currentSrc) {
          img.setAttribute('src', currentSrc);
          img.setAttribute('data-rendered-src', currentSrc);
        }
        if (img.naturalWidth && !img.getAttribute('width')) {
          img.setAttribute('width', String(img.naturalWidth));
        }
        if (img.naturalHeight && !img.getAttribute('height')) {
          img.setAttribute('height', String(img.naturalHeight));
        }
      }
    });

    return {
      finalUrl: page.url(),
      title: await page.title(),
      html: await page.content(),
    };
  } finally {
    await browser.close();
  }
}

function extFromContentType(contentType: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  return 'jpg';
}

async function saveImageWithBrowserFallback(
  imageUrl: string,
  pageUrl: string,
  executablePath: string | null,
) {
  try {
    return await saveImageFromUrl(imageUrl);
  } catch (directErr) {
    const browser = await chromium.launch({
      headless: true,
      executablePath: executablePath || undefined,
    });

    try {
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      });
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);
      const image = await page.evaluate(async (src) => {
        const response = await fetch(src, {
          credentials: 'include',
          headers: { Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
        });
        if (!response.ok) {
          throw new Error(`browser fetch image failed: HTTP ${response.status} ${response.statusText}`);
        }
        const contentType = response.headers.get('content-type') || '';
        const buffer = await response.arrayBuffer();
        return {
          contentType,
          bytes: Array.from(new Uint8Array(buffer)),
        };
      }, imageUrl);

      return await saveImage(Buffer.from(image.bytes), extFromContentType(image.contentType));
    } catch (browserErr) {
      throw new Error(`${(directErr as Error).message}; browser fallback failed: ${(browserErr as Error).message}`);
    } finally {
      await browser.close();
    }
  }
}

async function fetchPage(url: string, executablePath: string | null = null): Promise<{ finalUrl: string; title: string; $: CheerioRoot; html: string; rendered: boolean }> {
  const parsedUrl = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(parsedUrl.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        const rendered = await renderHtml(parsedUrl.href, executablePath);
        return {
          finalUrl: rendered.finalUrl,
          title: rendered.title,
          html: rendered.html,
          $: cheerio.load(rendered.html),
          rendered: true,
        };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Not an HTML page: ${contentType}`);
    }

    const html = await readTextWithLimit(response);
    const $ = cheerio.load(html);
    return {
      finalUrl: response.url || parsedUrl.href,
      title: $('title').first().text().replace(/\s+/g, ' ').trim(),
      html,
      $,
      rendered: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractStoryLinks(
  $: CheerioRoot,
  pageUrl: string,
  selectors: string[],
  depth: number,
  source: StanfordDiscoveredUrl['source'],
): StanfordDiscoveredUrl[] {
  const links: StanfordDiscoveredUrl[] = [];
  const seen = new Set<string>();

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href') || '';
      const url = normalizeStoryUrl(href, pageUrl);
      if (!url) return;
      const key = storyKey(url);
      if (seen.has(key)) return;
      seen.add(key);

      const text = $(el).text().replace(/\s+/g, ' ').trim();
      const heading = $(el).closest('article, section, div').find('h1, h2, h3').first().text().replace(/\s+/g, ' ').trim();
      const title = text || heading || $('meta[property="og:title"]').attr('content') || '';
      if (/^skip to content$/i.test(title)) return;

      links.push({
        url,
        title: title.substring(0, 180),
        depth,
        source,
        fromUrl: pageUrl,
      });
    });
  }

  return links;
}

export async function discoverStanfordReportUrls(options: StanfordDiscoveryOptions = {}): Promise<StanfordDiscoveredUrl[]> {
  const seedUrl = options.seedUrl || DEFAULT_SOURCE_URL;
  const maxUrls = options.maxUrls ?? 24;
  const maxDepth = options.maxDepth ?? 2;
  const maxIndexLinks = options.maxIndexLinks ?? Math.min(maxUrls, 12);

  const discovered: StanfordDiscoveredUrl[] = [];
  const seen = new Set<string>();
  const queue: StanfordDiscoveredUrl[] = [];

  const { $, finalUrl } = await fetchPage(seedUrl, options.executablePath || null);
  const indexLinks = extractStoryLinks($, finalUrl, INDEX_LINK_SELECTORS, 0, 'index')
    .slice(0, maxIndexLinks);

  for (const link of indexLinks) {
    const key = storyKey(link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    discovered.push(link);
    queue.push(link);
    if (discovered.length >= maxUrls) return discovered;
  }

  for (let cursor = 0; cursor < queue.length && discovered.length < maxUrls; cursor++) {
    const current = queue[cursor];
    if (current.depth >= maxDepth) continue;

    try {
      const articlePage = await fetchPage(current.url, options.executablePath || null);
      const related = extractStoryLinks(
        articlePage.$,
        articlePage.finalUrl,
        ARTICLE_RECOMMENDATION_SELECTORS,
        current.depth + 1,
        'article_recommendation',
      );

      for (const link of related) {
        const key = storyKey(link.url);
        if (seen.has(key)) continue;
        seen.add(key);
        discovered.push(link);
        queue.push(link);
        if (discovered.length >= maxUrls) break;
      }
    } catch {
      // Discovery is opportunistic; the ingest phase records per-page failures.
    }
  }

  return discovered;
}

async function seedStanfordReportSource() {
  const data = {
    name: SOURCE_NAME,
    url: DEFAULT_SOURCE_URL,
    category: 'L',
    sourceType: SOURCE_TYPE,
    adapterType: 'static_html_recursive',
    crawlStatus: 'active_static_recursive',
    crawlTier: 'A',
    visualValue: 'Stanford Report 官方新闻入口，覆盖多学科科研、校园研究人物、工程、医学、环境和基础科学图像。',
    strategyHint: '从首页发现文章，并递归抓取文章页 Read next / Stories for you / Popular stories 推荐卡片中的二级文章；小批量复跑，按图片质量去重入库。',
    notes: [
      `target_discipline: ${TARGET_DISCIPLINE}`,
      'program: stanford_report_recursive_2026_06',
      'max_depth_default: 2',
    ].join('\n'),
    enabled: true,
  };

  const existing = await prisma.crawlSource.findFirst({ where: { name: SOURCE_NAME } });
  if (existing) {
    return prisma.crawlSource.update({ where: { id: existing.id }, data });
  }
  return prisma.crawlSource.create({ data });
}

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStringArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function shouldExecute(): boolean {
  return process.argv.includes('--execute');
}

async function tagProcessedCases(sourceUrls: string[]) {
  if (!sourceUrls.length) return;
  await prisma.visualCase.updateMany({
    where: { sourceUrl: { in: sourceUrls } },
    data: {
      discipline: TARGET_DISCIPLINE,
      reviewStatus: 'needs_review',
      manualNotes: `${SOURCE_NAME} 递归推荐卡片采集初筛：${TARGET_DISCIPLINE}`,
    },
  });
}

export async function processRenderedStanfordUrl(
  url: string,
  sourceName: string,
  sourceType: string,
  executablePath: string | null,
) {
  const errors: string[] = [];
  let createdCaseCount = 0;
  let rendered;

  try {
    rendered = await fetchPage(url, executablePath);
  } catch (err) {
    return {
      url,
      status: 'failed',
      pageTitle: '',
      candidateImageCount: 0,
      filteredImageCount: 0,
      createdCaseCount: 0,
      errors: [`render failed: ${(err as Error).message}`],
    };
  }

  const extracted = await extractImagesFromPage(rendered.finalUrl, rendered.html);
  const { valid, filteredCount } = filterImageCandidates(extracted.images);

  const context = [extracted.metaDescription, extracted.bodyText]
    .filter(Boolean)
    .join('\n')
    .substring(0, 1000);

  const pageTitle = extracted.pageTitle || rendered.title;
  const scored = valid
    .map(image => ({
      image,
      score: scoreImageCandidate({
        image,
        pageTitle,
        pageUrl: rendered.finalUrl,
        sourceName,
        sourceType,
        metaDescription: extracted.metaDescription,
        bodyText: extracted.bodyText,
      }),
    }))
    .sort((a, b) => b.score.score - a.score.score);

  const selected = scored
    .filter(item => item.score.shouldKeep)
    .slice(0, MAX_IMAGES_PER_PAGE);

  for (const skipped of scored.filter(item => !item.score.shouldKeep).slice(0, 10)) {
    errors.push(`Low-value image skipped: ${skipped.image.src} - score ${skipped.score.score}`);
  }

  if (scored.length > selected.length) {
    for (const skipped of scored.slice(MAX_IMAGES_PER_PAGE).filter(item => item.score.shouldKeep).slice(0, 10)) {
      errors.push(`Image skipped by per-page cap: ${skipped.image.src} - score ${skipped.score.score}`);
    }
  }

  for (const item of selected) {
    let imageResult;
    try {
      imageResult = await saveImageWithBrowserFallback(item.image.src, rendered.finalUrl, executablePath);
    } catch (err) {
      errors.push(`Image download failed: ${item.image.src} - ${(err as Error).message}`);
      continue;
    }

    try {
      const duplicate = await findDuplicateCase(imageResult.imageHash);
      if (duplicate) {
        await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
        errors.push(`Duplicate image skipped: ${item.image.src} - matched ${duplicate.caseEntry.id} (${duplicate.matchType})`);
        continue;
      }

      const caseEntry = await prisma.visualCase.create({
        data: {
          sourceUrl: rendered.finalUrl,
          sourceDomain: new URL(rendered.finalUrl).hostname,
          pageTitle,
          imageUrl: item.image.src,
          imagePath: imageResult.imagePath,
          thumbnailPath: imageResult.thumbnailPath,
          imageHash: imageResult.imageHash,
          contextText: [item.image.contextText, context].filter(Boolean).join('\n').substring(0, 1500),
          captureType: rendered.rendered ? 'crawler_browser' : 'crawler',
          userHint: [sourceName, sourceType].filter(Boolean).join(' / '),
          collectionScore: item.score.score,
          collectionReasons: JSON.stringify(item.score.reasons),
          reviewStatus: 'pending_ai_analysis',
        },
      });
      createdCaseCount++;
      runAnalysis(caseEntry.id, imageResult.imagePath, pageTitle, rendered.finalUrl, context);
    } catch (err) {
      errors.push(`Case creation failed: ${item.image.src} - ${(err as Error).message}`);
    }
  }

  return {
    url: rendered.finalUrl,
    status: 'success',
    pageTitle,
    candidateImageCount: extracted.images.length,
    filteredImageCount: filteredCount,
    createdCaseCount,
    errors,
  };
}

async function runStanfordReportBatch(options: StanfordRunOptions): Promise<StanfordRunResult> {
  const source = await seedStanfordReportSource();
  const discovered = await discoverStanfordReportUrls(options);
  const errors: string[] = [];
  const processedUrls: string[] = [];
  let createdCaseCount = 0;

  if (!options.execute) {
    return {
      discoveredUrlCount: discovered.length,
      processedUrlCount: 0,
      createdCaseCount: 0,
      urls: discovered,
      processedUrls,
      errors,
    };
  }

  for (const item of discovered) {
    const existing = await prisma.visualCase.count({ where: { sourceUrl: item.url } });
    if (existing > 0) {
      errors.push(`Skipped existing sourceUrl: ${item.url}`);
      continue;
    }

    const result = await processRenderedStanfordUrl(item.url, source.name, source.sourceType || SOURCE_TYPE, options.executablePath || null);
    processedUrls.push(item.url);
    createdCaseCount += result.createdCaseCount;
    for (const err of result.errors.slice(0, 10)) {
      errors.push(`${item.url} :: ${err}`);
    }
  }

  await tagProcessedCases(processedUrls);

  return {
    discoveredUrlCount: discovered.length,
    processedUrlCount: processedUrls.length,
    createdCaseCount,
    urls: discovered,
    processedUrls,
    errors,
  };
}

async function writeReport(startedAt: Date, result: StanfordRunResult, execute: boolean) {
  const newCases = execute
    ? await prisma.visualCase.findMany({
      where: { createdAt: { gte: startedAt }, sourceDomain: 'news.stanford.edu' },
      select: {
        id: true,
        pageTitle: true,
        sourceUrl: true,
        imageUrl: true,
        imagePath: true,
        thumbnailPath: true,
        collectionScore: true,
        reviewStatus: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    : [];

  const now = new Date().toISOString();
  const reportPath = path.resolve(process.cwd(), '..', 'docs', `stanford-report-${execute ? 'ingest' : 'dry-run'}-${now.slice(0, 10)}.md`);
  const lines = [
    `# Stanford Report ${execute ? '递归采集入库报告' : '递归采集 dry-run'}`,
    '',
    `生成时间：${now}`,
    '',
    '## 摘要',
    '',
    `- 入口：${DEFAULT_SOURCE_URL}`,
    `- 发现 URL：${result.discoveredUrlCount}`,
    `- 处理 URL：${result.processedUrlCount}`,
    `- 新增案例：${result.createdCaseCount}`,
    `- 错误/跳过：${result.errors.length}`,
    '',
    '## 发现 URL',
    '',
    ...result.urls.map((item, index) => `${index + 1}. [depth=${item.depth}] ${item.title || '(no title)'} — ${item.url}`),
    '',
    '## 新增案例',
    '',
    newCases.length
      ? newCases.map(item => `- ${item.id} | score=${item.collectionScore} | ${item.pageTitle} | ${item.imagePath}`).join('\n')
      : '- dry-run 未入库，或本次未新增案例。',
    '',
    '## 错误与跳过',
    '',
    result.errors.length
      ? result.errors.slice(0, 80).map(err => `- ${err}`).join('\n')
      : '- 无。',
    '',
  ];

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Report written to ${reportPath}`);
}

async function main() {
  const startedAt = new Date();
  const execute = shouldExecute();
  const maxUrls = parseNumberArg('max-urls', 24);
  const maxDepth = parseNumberArg('max-depth', 2);
  const maxIndexLinks = parseNumberArg('max-index-links', Math.min(maxUrls, 12));
  const seedUrl = parseStringArg('seed-url', DEFAULT_SOURCE_URL);
  const executablePath = parseStringArg('chrome-executable', process.env.CHROME_EXECUTABLE || '');

  const result = await runStanfordReportBatch({
    seedUrl,
    maxUrls,
    maxDepth,
    maxIndexLinks,
    execute,
    executablePath: executablePath || null,
  });
  console.log(JSON.stringify({
    mode: execute ? 'execute' : 'dry-run',
    discoveredUrlCount: result.discoveredUrlCount,
    processedUrlCount: result.processedUrlCount,
    createdCaseCount: result.createdCaseCount,
    errorCount: result.errors.length,
    sampleUrls: result.urls.slice(0, 10),
    sampleErrors: result.errors.slice(0, 10),
  }, null, 2));

  await writeReport(startedAt, result, execute);
}

if (process.argv[1]?.endsWith('stanfordReport.ts')) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
