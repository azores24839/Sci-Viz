import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const OXFORD_SOURCE_CONFIGS = [
  { id: 307, name: 'Oxford Sparks' },
  { id: 308, name: 'Oxford MPLS Division' },
  { id: 310, name: 'Oxford Physics' },
  { id: 311, name: 'Oxford Chemistry' },
  { id: 312, name: 'Oxford Materials' },
  { id: 313, name: 'Oxford Statistics' },
  { id: 314, name: 'Oxford Internet Institute' },
  { id: 315, name: 'Oxford Pathology' },
];

const MAX_LINKS = 80;
const MAX_PAGES = 8;
const CONCURRENCY = 3;

async function main() {
  const execute = process.argv.includes('--execute');
  const verbose = process.argv.includes('--verbose');

  console.log(`=== Oxford Crawl Batch ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN (add --execute to crawl)'}`);

  const limit = pLimit(CONCURRENCY);
  const queue: Array<{ name: string; sourceType: string; urls: string[] }> = [];
  let totalExisting = 0;

  for (const cfg of OXFORD_SOURCE_CONFIGS) {
    const source = await prisma.crawlSource.findUnique({ where: { id: cfg.id } });
    if (!source || !source.enabled) {
      console.log(`[${cfg.name}] Source not found or disabled, skipping`);
      continue;
    }

    console.log(`\n[${cfg.name}] Discovering from ${source.url} (maxLinks=${MAX_LINKS}, maxPages=${MAX_PAGES})`);
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
