import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const HARVARD_SEED_URLS = [
  'https://www.harvard.edu/in-focus/',
  'https://www.harvard.edu/',
  'https://www.harvard.edu/about/history/',
  'https://www.harvard.edu/campus/museums/',
  'https://www.harvard.edu/campus/libraries/',
];

async function seedHarvardSource(): Promise<{ created: boolean; id: number }> {
  const existing = await prisma.crawlSource.findFirst({
    where: { name: 'Harvard Homepage', url: 'https://www.harvard.edu/' },
  });
  if (existing) {
    return { created: false, id: existing.id };
  }
  const source = await prisma.crawlSource.create({
    data: {
      name: 'Harvard Homepage',
      url: 'https://www.harvard.edu/',
      sourceType: 'university_research_news',
      category: 'A',
      crawlTier: 'A',
      crawlStatus: 'active_static',
      adapterType: 'static_html',
      visualValue: 'Research feature articles, In Focus topics, museum collections, campus visuals, historical images',
      strategyHint: 'Seed from homepage + /in-focus/*, /about/history/, /campus/museums/, /campus/libraries/; WordPress site',
      notes: 'Harvard University main website; rich visual content in feature articles and museum pages',
      enabled: true,
    },
  });
  return { created: true, id: source.id };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinksPerSeed = parseInt(process.argv.find(a => a.startsWith('--max-links='))?.split('=')[1] || '80', 10);
  const maxPages = parseInt(process.argv.find(a => a.startsWith('--max-pages='))?.split('=')[1] || '3', 10);
  const concurrency = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);

  const seedResult = await seedHarvardSource();
  console.log(`CrawlSource ${seedResult.created ? 'created (id=' + seedResult.id + ')' : 'already exists (id=' + seedResult.id + ')'}`);

  console.log(`\n=== Harvard Homepage Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, maxLinks=${maxLinksPerSeed}, maxPages=${maxPages}`);

  const allDiscovered: Array<{ url: string; title: string; score: number; source: string }> = [];
  const seenUrls = new Set<string>();

  for (const seed of HARVARD_SEED_URLS) {
    console.log(`\nDiscovering from ${seed}...`);
    try {
      const links = await discoverLinks(seed, maxLinksPerSeed, maxPages);

      for (const link of links) {
        const key = link.url.replace(/#.*$/, '').replace(/\?.*$/, '');
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          allDiscovered.push({ ...link, source: seed });
        }
      }
      console.log(`  Found ${links.length} candidate URLs (${allDiscovered.length} unique total)`);
    } catch (err) {
      console.error(`  Discovery failed: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal discovered: ${allDiscovered.length} unique URLs across ${HARVARD_SEED_URLS.length} seeds`);

  if (!execute) {
    console.log('\n=== DRY-RUN SUMMARY ===');
    for (const item of allDiscovered.slice(0, 40)) {
      console.log(`  [score=${item.score}] ${item.title?.substring(0, 70) || '(no title)'}`);
      console.log(`    → ${item.url}`);
    }
    if (allDiscovered.length > 40) console.log(`  ... and ${allDiscovered.length - 40} more`);
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  const source = await prisma.crawlSource.findFirst({
    where: { url: { startsWith: 'https://www.harvard.edu' } },
  });
  const sourceName = source?.name || 'Harvard Homepage';
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

        const result = await processSingleUrl(item.url, sourceName, sourceType);
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

  const harvardCount = await prisma.visualCase.count({
    where: { sourceDomain: { in: ['www.harvard.edu', 'harvard.edu'] } },
  });
  console.log(`Total Harvard cases in DB: ${harvardCount}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
