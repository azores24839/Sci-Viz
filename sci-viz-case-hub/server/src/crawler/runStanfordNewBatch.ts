import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const STANFORD_SOURCE_NAMES = [
  'Stanford 主页',
  'Stanford Medicine',
  'Stanford Doerr School of Sustainability',
  'Stanford HAI',
  'SLAC National Accelerator Laboratory',
];

const MAX_LINKS = 80;
const MAX_PAGES = 8;
const CONCURRENCY = 3;

async function main() {
  const execute = process.argv.includes('--execute');
  const verbose = process.argv.includes('--verbose');

  console.log(`=== Stanford New Sources Crawl Batch ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN (add --execute to crawl)'}`);

  const sources = await prisma.crawlSource.findMany({
    where: { name: { in: STANFORD_SOURCE_NAMES }, enabled: true },
    orderBy: { id: 'asc' },
  });

  if (sources.length === 0) {
    console.error('No matching Stanford sources found. Run seed script first.');
    process.exit(1);
  }

  console.log(`Found ${sources.length} sources.`);

  const limit = pLimit(CONCURRENCY);
  const queue: Array<{ name: string; sourceType: string; urls: string[] }> = [];
  let totalExisting = 0;

  for (const source of sources) {
    console.log(`\n[${source.name}] Discovering from ${source.url} (maxLinks=${MAX_LINKS}, maxPages=${MAX_PAGES})`);
    try {
      const links = await discoverLinks(source.url, MAX_LINKS, MAX_PAGES);

      let existingCount = 0;
      const newUrls: string[] = [];
      for (const link of links) {
        const dupe = await findDuplicateByUrl(link.url);
        if (dupe) existingCount++;
        else newUrls.push(link.url);
      }

      totalExisting += existingCount;
      console.log(`  Discovered ${links.length} links, ${existingCount} already in DB, ${newUrls.length} new`);

      if (verbose && newUrls.length > 0) {
        for (const url of newUrls.slice(0, 5)) {
          console.log(`    NEW: ${url}`);
        }
        if (newUrls.length > 5) console.log(`    ... and ${newUrls.length - 5} more`);
      }

      if (newUrls.length > 0) {
        queue.push({ name: source.name, sourceType: source.sourceType, urls: newUrls });
      }
    } catch (err) {
      console.error(`  Discovery failed: ${(err as Error).message}`);
    }
  }

  const totalNew = queue.reduce((s, q) => s + q.urls.length, 0);

  if (!execute) {
    console.log(`\n=== DRY-RUN SUMMARY ===`);
    console.log(`Already in DB (skipped): ${totalExisting}`);
    console.log(`New URLs to crawl: ${totalNew}`);
    for (const item of queue) console.log(`  ${item.name}: ${item.urls.length} new URLs`);
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalFailed = 0;

  for (const item of queue) {
    console.log(`\n=== Crawling: ${item.name} (${item.urls.length} URLs) ===`);

    const results = await Promise.all(item.urls.map(url =>
      limit(async () => {
        try {
          const result = await processSingleUrl(url, item.name, item.sourceType);
          totalProcessed++;
          totalCreated += result.createdCaseCount;
          if (result.createdCaseCount > 0) {
            console.log(`  +${result.createdCaseCount} case from ${new URL(url).pathname}`);
          }
          return result;
        } catch (err) {
          totalFailed++;
          const msg = (err as Error).message;
          if (totalFailed <= 20) console.error(`  FAIL: ${url} — ${msg.substring(0, 120)}`);
          return null;
        }
      })
    ));

    const sourceCreated = results.reduce((s, r) => s + (r?.createdCaseCount || 0), 0);
    console.log(`  → ${item.name}: ${sourceCreated} new cases from ${item.urls.length} URLs`);
  }

  console.log(`\n=== FINAL ===`);
  console.log(`Processed: ${totalProcessed}, Created: ${totalCreated}, Failed: ${totalFailed}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
