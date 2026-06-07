import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';

interface QueueItem {
  name: string;
  url: string;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinks = 30;
  const maxPages = 3;

  const sources = await prisma.crawlSource.findMany({
    where: { name: { contains: '浙江' }, enabled: true },
  });

  if (sources.length === 0) {
    console.error('No ZJU source found.');
    process.exit(1);
  }

  console.log(`Found ${sources.length} ZJU source(s).`);

  if (execute) {
    console.warn('EXECUTE mode: will download images and create cases.');
  } else {
    console.warn('Dry-run mode: discovering article URLs only. Pass --execute to ingest.');
  }

  const queue: QueueItem[] = [];

  for (const source of sources) {
    console.log(`\n--- Discovering: ${source.name} (${source.url}) ---`);
    try {
      const links = await discoverLinks(source.url, maxLinks, maxPages);
      console.log(`  Discovered ${links.length} links`);
      for (const link of links) {
        queue.push({ name: source.name, url: link.url });
      }
    } catch (err) {
      console.error(`  Discovery failed: ${(err as Error).message}`);
    }
  }

  console.log(`\n=== Total discovered: ${queue.length} URLs ===`);

  if (!execute) {
    console.log('Dry-run complete. Pass --execute to crawl and ingest.');
    return;
  }

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalCandidateImages = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    console.log(`\n[${i + 1}/${queue.length}] ${item.url}`);
    try {
      const result = await processSingleUrl(item.url, item.name, 'university_news');
      totalProcessed++;
      totalCreated += result.createdCaseCount;
      totalCandidateImages += result.candidateImageCount;
      console.log(`  status=${result.status} images=${result.candidateImageCount} created=${result.createdCaseCount}`);
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
  console.log(JSON.stringify({ discovered: queue.length, processed: totalProcessed, created: totalCreated, candidateImages: totalCandidateImages }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
