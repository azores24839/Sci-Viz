import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';

interface QueueItem {
  name: string;
  url: string;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinks = 15;
  const maxPages = 2;

  const sources = await prisma.crawlSource.findMany({
    where: { category: 'H', enabled: true },
  });

  if (sources.length === 0) {
    console.error('No domestic sources found. Run seed script first.');
    process.exit(1);
  }

  console.log(`Found ${sources.length} domestic sources.`);

  if (execute) {
    console.warn('EXECUTE mode: will download images and create cases.');
  } else {
    console.warn('Dry-run mode: discovering article URLs only. Pass --execute to ingest.');
  }

  let totalDiscovered = 0;
  let totalProcessed = 0;
  let totalCreated = 0;

  const queue: QueueItem[] = [];

  for (const source of sources) {
    console.log(`\n--- Discovering: ${source.name} (${source.url}) ---`);
    try {
      const links = await discoverLinks(source.url, maxLinks, maxPages);
      console.log(`  Discovered ${links.length} links`);
      totalDiscovered += links.length;
      for (const link of links) {
        queue.push({ name: source.name, url: link.url });
      }
    } catch (err) {
      console.error(`  Discovery failed for ${source.name}: ${(err as Error).message}`);
    }
  }

  console.log(`\n=== Total discovered: ${queue.length} URLs ===`);

  if (!execute) {
    console.log('Dry-run complete. Pass --execute to crawl and ingest.');
    return;
  }

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    console.log(`\n[${i + 1}/${queue.length}] ${item.name}: ${item.url}`);
    try {
      const result = await processSingleUrl(item.url, item.name, 'university_news');
      totalProcessed++;
      totalCreated += result.createdCaseCount;
      console.log(`  status=${result.status} pages=${result.candidateImageCount} created=${result.createdCaseCount}`);
      if (result.errors.length > 0) {
        for (const err of result.errors.slice(0, 3)) {
          console.log(`  note: ${err}`);
        }
      }
    } catch (err) {
      console.error(`  Failed: ${(err as Error).message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(JSON.stringify({ discovered: totalDiscovered, processed: totalProcessed, created: totalCreated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
