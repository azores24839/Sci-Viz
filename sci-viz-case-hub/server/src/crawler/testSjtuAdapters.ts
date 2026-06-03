/**
 * Dry-run test for SJTU college source adapters.
 * Tests link discovery on 2-3 static source list pages.
 * No database writes. No large-scale crawling.
 *
 * Usage: npx tsx server/src/crawler/testSjtuAdapters.ts
 */
import * as cheerio from 'cheerio';
import { discoverLinks } from './discoverLinks.js';
import { getStaticSourceAdapter } from './staticSourceAdapters.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { assertPublicHttpUrl, readTextWithLimit } from '../utils/httpSafety.js';

interface TestResult {
  source: string;
  url: string;
  discoveredLinks: number;
  articleCount: number;
  testedArticles: { url: string; title: string; imagesFound: number; error?: string }[];
  errors: string[];
}

async function testSource(sourceName: string, listPageUrl: string): Promise<TestResult> {
  const result: TestResult = {
    source: sourceName,
    url: listPageUrl,
    discoveredLinks: 0,
    articleCount: 0,
    testedArticles: [],
    errors: [],
  };

  // Step 1: Discover links
  let links: { url: string; title: string; score: number }[] = [];
  try {
    console.log(`\n[${sourceName}] Discovering links on ${listPageUrl}...`);
    links = await discoverLinks(listPageUrl, 30, 2);
    result.discoveredLinks = links.length;
    console.log(`  Discovered ${links.length} candidate links`);
  } catch (err) {
    result.errors.push(`Link discovery failed: ${(err as Error).message}`);
    console.log(`  ERROR: ${(err as Error).message}`);
    return result;
  }

  if (links.length === 0) {
    console.log(`  No article links found.`);
    return result;
  }

  // Print top links
  console.log(`  Top links (by score):`);
  const topLinks = links.slice(0, 10);
  for (const link of topLinks) {
    console.log(`    [${link.score}] ${link.title.substring(0, 60)} -> ${link.url}`);
  }
  result.articleCount = topLinks.length;

  // Step 2: Test image extraction on first 2-3 article URLs
  const testCount = Math.min(3, topLinks.length);
  console.log(`\n  Testing image extraction on ${testCount} article(s)...`);

  for (let i = 0; i < testCount; i++) {
    const link = topLinks[i];
    try {
      console.log(`  [${i + 1}/${testCount}] Fetching: ${link.url}`);
      const parsedUrl = await assertPublicHttpUrl(link.url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(parsedUrl.href, {
        signal: controller.signal,
        redirect: 'error',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        result.testedArticles.push({
          url: link.url,
          title: link.title,
          imagesFound: 0,
          error: `HTTP ${res.status}`,
        });
        console.log(`    HTTP ${res.status} - skipped`);
        continue;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        result.testedArticles.push({
          url: link.url,
          title: link.title,
          imagesFound: 0,
          error: `Non-HTML content: ${contentType}`,
        });
        console.log(`    Non-HTML: ${contentType}`);
        continue;
      }

      const html = await readTextWithLimit(res);
      const extracted = await extractImagesFromPage(link.url, html);
      const imagesFound = extracted.images.length;

      result.testedArticles.push({
        url: link.url,
        title: extracted.pageTitle || link.title,
        imagesFound,
      });

      console.log(`    Page: "${extracted.pageTitle.substring(0, 60)}"`);
      console.log(`    Images found: ${imagesFound}`);

      if (imagesFound > 0) {
        const topImages = extracted.images.slice(0, 3);
        for (const img of topImages) {
          console.log(`      - ${img.src.substring(0, 80)}`);
          if (img.alt) console.log(`        alt: "${img.alt.substring(0, 60)}"`);
          if (img.width && img.height) console.log(`        size: ${img.width}x${img.height}`);
        }
      }
    } catch (err) {
      result.testedArticles.push({
        url: link.url,
        title: link.title,
        imagesFound: 0,
        error: (err as Error).message,
      });
      console.log(`    ERROR: ${(err as Error).message}`);
    }
  }

  return result;
}

async function main() {
  console.log('=== SJTU Adapter Dry-Run Test ===');
  console.log('Testing link discovery + image extraction on 2-3 sources.\n');

  const testSources = [
    { name: '材料科学与工程学院', url: 'https://smse.sjtu.edu.cn' },
    { name: '环境科学与工程学院', url: 'https://sese.sjtu.edu.cn' },
    { name: '化学化工学院', url: 'https://scce.sjtu.edu.cn' },
  ];

  const results: TestResult[] = [];
  for (const source of testSources) {
    const result = await testSource(source.name, source.url);
    results.push(result);
  }

  // Summary
  console.log('\n\n=== SUMMARY ===');
  let totalDiscoveredLinks = 0;
  let totalArticles = 0;
  let totalImages = 0;
  let testedPages = 0;

  for (const r of results) {
    console.log(`\n${r.source}:`);
    console.log(`  Discovered links: ${r.discoveredLinks}`);
    console.log(`  Top articles: ${r.articleCount}`);
    const images = r.testedArticles.reduce((s, a) => s + a.imagesFound, 0);
    const pages = r.testedArticles.filter(a => a.imagesFound > 0).length;
    console.log(`  Tested ${r.testedArticles.length} articles, ${pages} with images, total ${images} images`);
    if (r.errors.length > 0) {
      console.log(`  Errors: ${r.errors.join('; ')}`);
    }
    totalDiscoveredLinks += r.discoveredLinks;
    totalArticles += r.articleCount;
    totalImages += images;
    testedPages += pages;
  }

  console.log(`\nGrand Total:`);
  console.log(`  Discovered links: ${totalDiscoveredLinks}`);
  console.log(`  Top articles: ${totalArticles}`);
  console.log(`  Pages with images: ${testedPages}`);
  console.log(`  Total images found: ${totalImages}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
