import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { discoverNasaImages, ingestNasaImage } from './nasaAdapter.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const INTERNATIONAL_DOMAINS = [
  'news.mit.edu',
  'news.harvard.edu',
  'www.harvard.edu',
  'harvard.edu',
  'news.stanford.edu',
  'engineering.stanford.edu',
  'newscenter.lbl.gov',
  'www.mpg.de',
  'mpg.de',
  'images.nasa.gov',
  'earthobservatory.nasa.gov',
  'science.nasa.gov',
  'svs.gsfc.nasa.gov',
];

const NASA_SOURCE_ID = 7;

function isInternationalSource(name: string, url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return INTERNATIONAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return INTERNATIONAL_DOMAINS.some(d => name.toLowerCase().includes(d.split('.')[0]));
  }
}

function getMaxLinks(source: { sourceType: string; adapterType: string }): number {
  if (source.adapterType === 'api') return 20;
  if (source.sourceType === 'official_media_library') return 80;
  return 80;
}

function getMaxPages(): number {
  return 8;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const dryRunDetailed = process.argv.includes('--verbose');
  const concurrency = parseNumberArg('concurrency', 3);

  const allSources = await prisma.crawlSource.findMany({
    where: { enabled: true },
    orderBy: { id: 'asc' },
  });

  const intlSources = allSources.filter(s => isInternationalSource(s.name, s.url));
  const staticSources = intlSources.filter(s => s.adapterType !== 'api' && s.crawlStatus !== 'static_html_recursive');
  const apiSources = intlSources.filter(s => s.adapterType === 'api');
  const recursiveSources = intlSources.filter(s => s.crawlStatus === 'static_html_recursive');

  console.log(`=== International Deep Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}`);
  console.log(`Static sources: ${staticSources.length}`);
  console.log(`API sources: ${apiSources.length}`);
  console.log(`Recursive sources: ${recursiveSources.length} (will be skipped)`);
  console.log();

  const limitConcurrency = pLimit(concurrency);
  const queue: Array<{ sourceId: number; sourceName: string; sourceType: string; urls: string[] }> = [];
  let totalExisting = 0;

  for (const source of staticSources) {
    const maxLinks = getMaxLinks(source);
    const maxPages = getMaxPages();

    console.log(`[${source.name}] Discovering from ${source.url} (maxLinks=${maxLinks}, maxPages=${maxPages})`);
    try {
      const links = await discoverLinks(source.url, maxLinks, maxPages);

      let existingCount = 0;
      const newUrls: string[] = [];
      for (const link of links) {
        const dupe = await findDuplicateByUrl(link.url);
        if (dupe) {
          existingCount++;
        } else {
          newUrls.push(link.url);
        }
      }

      totalExisting += existingCount;
      console.log(`  Discovered ${links.length} links, ${existingCount} already in DB, ${newUrls.length} new`);

      if (newUrls.length > 0) {
        queue.push({
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.sourceType,
          urls: newUrls,
        });
      }

      if (dryRunDetailed) {
        for (const url of newUrls.slice(0, 10)) {
          console.log(`    NEW: ${url}`);
        }
        if (newUrls.length > 10) {
          console.log(`    ... and ${newUrls.length - 10} more`);
        }
      }
    } catch (err) {
      console.error(`  Discovery failed: ${(err as Error).message}`);
    }
  }

  for (const source of apiSources) {
    const maxPerKeyword = 20;
    console.log(`\n[${source.name}] API source — discovery via NASA API (maxPerKeyword=${maxPerKeyword})`);
    try {
      const nasaResults = await discoverNasaImages(maxPerKeyword);
      console.log(`  Discovered ${nasaResults.length} NASA images`);

      if (execute) {
        let created = 0;
        let skipped = 0;
        await Promise.all(nasaResults.map(r =>
          limitConcurrency(async () => {
            try {
              const dupe = await findDuplicateByUrl(r.pageUrl);
              if (dupe) {
                skipped++;
                return;
              }
              const count = await ingestNasaImage(r, source.name, source.sourceType);
              created += count;
            } catch (err) {
              console.log(`  NASA ingest error: ${(err as Error).message}`);
            }
          })
        ));
        console.log(`  Created ${created} new cases, skipped ${skipped} existing`);
      }
    } catch (err) {
      console.error(`  NASA discovery failed: ${(err as Error).message}`);
    }
  }

  if (recursiveSources.length > 0) {
    console.log(`\n--- Recursive sources (use stanfordReport.ts separately) ---`);
    for (const s of recursiveSources) {
      console.log(`  ${s.name}: tsx src/crawler/stanfordReport.ts --execute --max-urls=60`);
    }
  }

  if (!execute) {
    const totalNew = queue.reduce((sum, q) => sum + q.urls.length, 0);
    console.log(`\n=== DRY-RUN SUMMARY ===`);
    console.log(`Already in DB (will be skipped): ${totalExisting}`);
    console.log(`New URLs to crawl: ${totalNew}`);
    for (const item of queue) {
      console.log(`  ${item.sourceName}: ${item.urls.length} new URLs`);
    }
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalFailed = 0;
  let totalSkippedDupe = 0;

  for (const item of queue) {
    console.log(`\n=== Crawling: ${item.sourceName} (${item.urls.length} new URLs) ===`);

    const results = await Promise.all(item.urls.map(url =>
      limitConcurrency(async () => {
        try {
          const dupe = await findDuplicateByUrl(url);
          if (dupe) {
            totalSkippedDupe++;
            return { status: 'dupe' as const, created: 0 };
          }

          const result = await processSingleUrl(url, item.sourceName, item.sourceType);
          totalProcessed++;
          totalCreated += result.createdCaseCount;
          if (result.createdCaseCount > 0) {
            console.log(`  +${result.createdCaseCount} from ${new URL(url).pathname}`);
          }
          return { status: result.status as string, created: result.createdCaseCount };
        } catch (err) {
          totalFailed++;
          const msg = (err as Error).message;
          if (totalFailed <= 20) {
            console.error(`  FAIL: ${url} — ${msg.substring(0, 100)}`);
          }
          return { status: 'failed', created: 0 };
        }
      })
    ));

    const sourceCreated = results.reduce((s, r) => s + r.created, 0);
    console.log(`  → ${item.sourceName}: ${sourceCreated} new cases from ${item.urls.length} URLs`);
  }

  console.log(`\n=== FINAL SUMMARY ===`);
  console.log(`URLs processed: ${totalProcessed}`);
  console.log(`New cases created: ${totalCreated}`);
  console.log(`URLs failed: ${totalFailed}`);
  console.log(`URLs skipped (dupe): ${totalSkippedDupe}`);

  const finalIntlCount = await prisma.visualCase.count({
    where: {
      sourceDomain: { in: INTERNATIONAL_DOMAINS },
    },
  });
  console.log(`Total international cases in DB: ${finalIntlCount}`);
}

function parseNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const arg = process.argv.find(item => item.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });