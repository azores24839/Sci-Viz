import { prisma } from '../prisma.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const LBL_WP_API = 'https://newscenter.lbl.gov/wp-json/wp/v2/posts';

interface WPPost {
  id: number;
  link: string;
  title: { rendered: string };
  date: string;
  slug: string;
}

async function fetchWPPosts(page: number, perPage: number = 50): Promise<WPPost[]> {
  const url = `${LBL_WP_API}?per_page=${perPage}&page=${page}&_fields=id,link,title,date,slug`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WP API HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<WPPost[]>;
}

async function fetchWithJSFallback(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Not HTML: ${contentType}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxPages = parseInt(process.argv.find(a => a.startsWith('--max-pages='))?.split('=')[1] || '4', 10);
  const concurrency = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '2', 10);

  console.log(`=== LBNL WP-API + Static Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, maxPages=${maxPages}, concurrency=${concurrency}`);

  const allUrls: string[] = [];

  // Phase 1: WP REST API
  console.log('\n--- Phase 1: WP REST API ---');
  for (let page = 1; page <= maxPages; page++) {
    try {
      const posts = await fetchWPPosts(page, 50);
      if (posts.length === 0) break;
      for (const post of posts) {
        allUrls.push(post.link);
      }
      console.log(`  Page ${page}: ${posts.length} posts`);
    } catch (err) {
      console.log(`  Page ${page}: ${(err as Error).message}`);
      break;
    }
  }
  console.log(`Total from WP API: ${allUrls.length} URLs`);

  // Phase 2: Static crawl of homepage and working category pages
  console.log('\n--- Phase 2: Static link discovery ---');
  const { discoverLinks } = await import('./discoverLinks.js');
  const entryPoints = [
    'https://newscenter.lbl.gov/',
  ];

  for (const url of entryPoints) {
    try {
      const links = await discoverLinks(url, 30, 5);
      for (const link of links) {
        if (!allUrls.includes(link.url)) {
          allUrls.push(link.url);
        }
      }
      console.log(`  ${url}: ${links.length} links discovered`);
    } catch (err) {
      console.error(`  ${url}: ${(err as Error).message}`);
    }
  }

  // Deduplicate URLs
  const uniqueUrls = [...new Set(allUrls)];
  console.log(`\nTotal unique URLs: ${uniqueUrls.length}`);

  if (!execute) {
    console.log('\n=== DRY-RUN SUMMARY ===');
    for (const url of uniqueUrls.slice(0, 20)) {
      console.log(`  ${url}`);
    }
    if (uniqueUrls.length > 20) console.log(`  ... and ${uniqueUrls.length - 20} more`);
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  // Crawl and ingest
  const limit = pLimit(concurrency);
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  console.log(`\n--- Crawling ${uniqueUrls.length} URLs ---`);
  await Promise.all(uniqueUrls.map(url =>
    limit(async () => {
      try {
        const dupe = await findDuplicateByUrl(url);
        if (dupe) {
          totalSkipped++;
          return;
        }
        const result = await processSingleUrl(url, 'Berkeley Lab News Center', 'national_lab_news');
        if (result.createdCaseCount > 0) {
          totalCreated += result.createdCaseCount;
          console.log(`  +${result.createdCaseCount} from ${new URL(url).pathname}`);
        }
      } catch (err) {
        totalFailed++;
        if (totalFailed <= 10) {
          console.error(`  FAIL: ${url} — ${(err as Error).message.substring(0, 80)}`);
        }
      }
    })
  ));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${totalCreated}`);
  console.log(`Skipped (dupe): ${totalSkipped}`);
  console.log(`Failed: ${totalFailed}`);

  const lblCount = await prisma.visualCase.count({ where: { sourceDomain: 'newscenter.lbl.gov' } });
  console.log(`Total LBNL cases in DB: ${lblCount}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });