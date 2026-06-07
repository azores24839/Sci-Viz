import { discoverStanfordReportUrls, processRenderedStanfordUrl } from './stanfordReport.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  const execute = process.argv.includes('--execute');
  const maxUrls = parseInt(process.argv.find(a => a.startsWith('--max-urls='))?.split('=')[1] || '80', 10);
  const maxDepth = parseInt(process.argv.find(a => a.startsWith('--max-depth='))?.split('=')[1] || '2', 10);
  const concurrency = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '2', 10);

  console.log(`=== Stanford Report Playwright Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, maxUrls=${maxUrls}, maxDepth=${maxDepth}`);

  // Phase 1: Discover URLs
  console.log('\n--- Discovering Stanford URLs via Playwright ---');
  const seedUrls = [
    'https://news.stanford.edu/',
    'https://news.stanford.edu/stories/science/',
    'https://news.stanford.edu/stories/medicine-health/',
    'https://news.stanford.edu/stories/technology/',
  ];

  const allDiscovered: Array<{ url: string; title: string; depth: number; source: string }> = [];
  const seenUrls = new Set<string>();

  for (const seed of seedUrls) {
    console.log(`Discovering from ${seed}...`);
    try {
      const links = await discoverStanfordReportUrls({
        seedUrl: seed,
        maxUrls: Math.ceil(maxUrls / seedUrls.length),
        maxDepth,
        executablePath: CHROME_PATH,
      });

      for (const link of links) {
        const key = link.url.replace(/#.*$/, '').replace(/\?.*$/, '');
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          allDiscovered.push(link);
        }
      }
      console.log(`  Found ${links.length} URLs from ${seed}`);
    } catch (err) {
      console.error(`  Discovery failed: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal discovered: ${allDiscovered.length} unique URLs`);

  if (!execute) {
    console.log('\n=== DRY-RUN SUMMARY ===');
    for (const item of allDiscovered.slice(0, 30)) {
      console.log(`  [d=${item.depth}] ${item.title?.substring(0, 60) || '(no title)'} → ${item.url}`);
    }
    if (allDiscovered.length > 30) console.log(`  ... and ${allDiscovered.length - 30} more`);
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  // Phase 2: Process URLs with deduplication
  const source = await prisma.crawlSource.findFirst({ where: { name: 'Stanford Report' } });
  const sourceName = source?.name || 'Stanford Report';
  const sourceType = source?.sourceType || 'university_research_news';

  const limit = pLimit(concurrency);
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  console.log(`\n--- Processing ${allDiscovered.length} URLs ---`);

  await Promise.all(allDiscovered.map(item =>
    limit(async () => {
      try {
        const dupe = await findDuplicateByUrl(item.url);
        if (dupe) {
          totalSkipped++;
          return;
        }

        const result = await processRenderedStanfordUrl(item.url, sourceName, sourceType, CHROME_PATH);
        if (result.createdCaseCount > 0) {
          totalCreated += result.createdCaseCount;
          console.log(`  +${result.createdCaseCount} from ${new URL(item.url).pathname}`);
        }
      } catch (err) {
        totalFailed++;
        if (totalFailed <= 10) {
          console.error(`  FAIL: ${item.url} — ${(err as Error).message.substring(0, 80)}`);
        }
      }
    })
  ));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${totalCreated}`);
  console.log(`Skipped (dupe): ${totalSkipped}`);
  console.log(`Failed: ${totalFailed}`);

  const stanfordCount = await prisma.visualCase.count({ where: { sourceDomain: 'news.stanford.edu' } });
  console.log(`Total Stanford cases in DB: ${stanfordCount}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });