import pLimit from 'p-limit';
import { prisma } from '../prisma.js';
import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import { QS_TOP_UNIVERSITY_SOURCES, seedQsTopUniversitySources } from './qsTopUniversitySources.js';

function numberArg(name: string, fallback: number) {
  const value = process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').at(-1);
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_LINKS = numberArg('max-links', 30);
const MAX_PAGES = numberArg('max-pages', 6);
const ONLY = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length).toLowerCase() || '';

async function main() {
  const execute = process.argv.includes('--execute');
  const seed = await seedQsTopUniversitySources();
  console.log(`QS top sources: ${seed.created} created, ${seed.skipped} existing.`);
  const selectedSources = QS_TOP_UNIVERSITY_SOURCES.filter(source => !ONLY || source.name.toLowerCase().includes(ONLY) || source.university.toLowerCase().includes(ONLY));
  console.log(`Discovering ${selectedSources.length} configured sources (up to ${MAX_LINKS} links / ${MAX_PAGES} list pages each)...`);
  const discoverLimit = pLimit(5);
  const targets = await Promise.all(selectedSources.map(source => discoverLimit(async () => {
    const dbSource = await prisma.crawlSource.findFirst({ where: { name: source.name, url: source.url } });
    if (!dbSource) return { source, urls: [] as string[], error: 'source missing' };
    try {
      const links = await discoverLinks(source.url, MAX_LINKS, MAX_PAGES);
      const fresh: string[] = [];
      for (const link of links) if (!await findDuplicateByUrl(link.url)) fresh.push(link.url);
      return { source, dbSource, urls: fresh, error: '' };
    } catch (error) {
      return { source, urls: [] as string[], error: (error as Error).message };
    }
  })));
  for (const target of targets) console.log(`${target.source.name}: ${target.urls.length}${target.error ? ` (${target.error.slice(0, 90)})` : ''}`);
  const total = targets.reduce((sum, target) => sum + target.urls.length, 0);
  if (!execute) { console.log(`DRY-RUN complete: ${total} new article URLs. Pass --execute to ingest.`); return; }
  const ingestLimit = pLimit(3);
  let pages = 0, created = 0, failed = 0;
  // Keep each source as a completed, observable unit. This avoids one slow or blocked
  // site obscuring progress on the rest of the cohort.
  for (const target of targets) {
    if (!target.dbSource || target.urls.length === 0) continue;
    let sourceCreated = 0;
    await Promise.all(target.urls.map(url => ingestLimit(async () => {
      try {
        const result = await processSingleUrl(url, target.source.name, target.dbSource.sourceType, undefined, {
          // This collection pass is deliberately for human review first: no OCR or AI analysis.
          enqueueAnalysis: false,
        });
        pages++; created += result.createdCaseCount; sourceCreated += result.createdCaseCount;
      } catch (error) {
        pages++; failed++;
        console.error(`FAIL ${target.source.name}: ${(error as Error).message.slice(0, 100)}`);
      }
    })));
    console.log(`INGESTED ${target.source.name}: ${target.urls.length} pages, ${sourceCreated} new cases.`);
  }
  console.log(`FINAL: ${pages} article pages, ${created} new image cases, ${failed} failed pages. OCR not run.`);
}

try {
  // Top-level await keeps the CLI alive for every source; a detached promise chain
  // can otherwise let the process terminate between source groups under tsx.
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
