import { PrismaClient } from '@prisma/client';
import pLimit from 'p-limit';
import * as cheerio from 'cheerio';
import { processSingleUrl } from './crawler/runUrlCrawl.js';

const prisma = new PrismaClient();

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1];
  try {
    return new TextDecoder(charset || 'gbk').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

// Discover articles with thumbnail images from listing pages  
async function discoverWithThumbnails(listPageUrl: string): Promise<Array<{url: string; title: string; hasImg: boolean}>> {
  let html;
  try { html = await fetchHtml(listPageUrl); } catch { return []; }
  const $ = cheerio.load(html);
  const results: Array<{url: string; title: string; hasImg: boolean}> = [];

  // Match article links with nearby images (articles with thumbnails on listing)
  $('a[href*="/htmlnews/"]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    const match = href.match(/\/htmlnews\/(\d{4}\/\d+\/\d+)\.shtm/);
    if (!match) return;
    const title = $(el).text().trim();
    if (!title || title.length < 10) return;

    // Check if this link is near an image (article has a thumbnail)
    const parentRow = $(el).closest('tr');
    const hasNearbyImg = parentRow.find('img').length > 0 || $(el).prev('img').length > 0;

    // Also check for image in photo/news boxes
    const inPhotoBox = $(el).closest('.photoxbox').length > 0;

    results.push({
      url: 'https://news.sciencenet.cn/htmlnews/' + match[1] + '.shtm',
      title,
      hasImg: hasNearbyImg || inPhotoBox,
    });
  });

  // Also grab articles from image news sections (they have images for sure)
  return results;
}

async function main() {
  const TARGET = 100;

  const listPages = [
    'https://news.sciencenet.cn/morenews-F-1.aspx',
    'https://news.sciencenet.cn/morenews-7-1.aspx',
    'https://news.sciencenet.cn/morenews-9-1.aspx',
    'https://news.sciencenet.cn/morenews-Y-1.aspx',
    'https://news.sciencenet.cn/morenews-V-1.aspx',
    'https://news.sciencenet.cn/morenews-K-1.aspx',
    'https://news.sciencenet.cn/morenews-T-1.aspx',
    'https://news.sciencenet.cn/morenews-6-1.aspx',
    'https://news.sciencenet.cn/daily.shtml',
    'https://news.sciencenet.cn/imgnews.aspx',
  ];

  console.log('=== ScienceNet 100-Article Crawl (image-only) ===\n');

  const seen = new Set<string>();
  const allArticles: Array<{url: string; title: string}> = [];

  for (const pageUrl of listPages) {
    console.log(`  Scanning: ${pageUrl}`);
    try {
      const articles = await discoverWithThumbnails(pageUrl);
      // Prioritize articles with nearby images
      const withImg = articles.filter(a => a.hasImg);
      const withoutImg = articles.filter(a => !a.hasImg);
      console.log(`    Found ${withImg.length} with thumbnail, ${withoutImg.length} without`);

      for (const a of [...withImg, ...withoutImg]) {
        const key = new URL(a.url).origin + new URL(a.url).pathname;
        if (!seen.has(key)) {
          seen.add(key);
          allArticles.push(a);
        }
      }
    } catch (err: any) {
      console.log(`    Error: ${err.message}`);
    }
    if (allArticles.length >= TARGET) break;
  }

  const toCrawl = allArticles.slice(0, TARGET);
  console.log(`\nTotal unique: ${allArticles.length}, crawling ${toCrawl.length}\n`);

  const limit = pLimit(3);
  let crawled = 0, totalCases = 0, skipped = 0, errors = 0;

  await Promise.all(toCrawl.map(article =>
    limit(async () => {
      try {
        const existing = await prisma.visualCase.findFirst({
          where: { sourceUrl: article.url }, select: { id: true },
        });
        if (existing) { skipped++; }
        else {
          const result = await processSingleUrl(article.url, 'ScienceNet', 'science_news_aggregator');
          totalCases += result.createdCaseCount;
        }
      } catch (err: any) { errors++; }
      crawled++;
      process.stdout.write(`\rProgress: ${crawled}/${toCrawl.length} | Cases: ${totalCases} | Skip: ${skipped} | Err: ${errors}`);
    })
  ));

  console.log(`\n\n=== Done ===`);
  console.log(`Crawled: ${crawled} | New cases: ${totalCases} | Skipped: ${skipped} | Errors: ${errors}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); process.exit(0); });
