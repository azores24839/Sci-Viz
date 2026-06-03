import { PrismaClient } from '@prisma/client';
import { discoverLinks } from './crawler/discoverLinks.js';
import { processSingleUrl } from './crawler/runUrlCrawl.js';

const prisma = new PrismaClient();

const MAX_PAGES = 5;
const MAX_LINKS = 30;
const MIN_NEW_CASES = 8;
const MAX_NEW_CASES = 15;

type SourceResult = {
  id: number;
  name: string;
  url: string;
  domain: string;
  discoveredUrlCount: number;
  processedUrlCount: number;
  createdCaseCount: number;
  errors: string[];
  status: 'ok' | 'no_links' | 'error';
};

async function crawlSJTU() {
  const sources = await prisma.crawlSource.findMany({
    where: { url: { contains: 'sjtu.edu.cn' } },
    orderBy: { id: 'asc' },
  });

  const alreadyCrawled = new Set([19, 36, 38, 42, 43]); // news, me, smse, sese, scce
  const toCrawl = sources.filter(s => !alreadyCrawled.has(s.id));

  console.log(`Total SJTU sources: ${sources.length}, already crawled: ${alreadyCrawled.size}, to crawl: ${toCrawl.length}`);
  console.log('');

  const results: SourceResult[] = [];

  for (const source of toCrawl) {
    const domain = new URL(source.url).hostname;
    console.log(`[SJTU] Starting: ${source.name} (${domain}) [id=${source.id}]`);

    const result: SourceResult = {
      id: source.id,
      name: source.name,
      url: source.url,
      domain,
      discoveredUrlCount: 0,
      processedUrlCount: 0,
      createdCaseCount: 0,
      errors: [],
      status: 'ok',
    };

    try {
      const links = await discoverLinks(source.url, MAX_LINKS, MAX_PAGES);
      const seen = new Set<string>();
      const uniqueUrls = links
        .map(l => l.url)
        .filter(url => {
          if (seen.has(url)) return false;
          seen.add(url);
          return true;
        });

      console.log(`[SJTU]   Discovered ${links.length} links, ${uniqueUrls.length} unique (maxPages=${MAX_PAGES}, maxLinks=${MAX_LINKS})`);
      result.discoveredUrlCount = uniqueUrls.length;

      if (uniqueUrls.length === 0) {
        result.status = 'no_links';
        console.log(`[SJTU]   No links discovered, skipping.`);
      } else {
        for (const url of uniqueUrls) {
          if (result.createdCaseCount >= MAX_NEW_CASES) {
            console.log(`[SJTU]   Reached max ${MAX_NEW_CASES} new cases, stopping.`);
            break;
          }

          const existing = await prisma.visualCase.findFirst({
            where: { sourceUrl: url },
            select: { id: true },
          });
          if (existing) {
            continue;
          }

          try {
            const crawlResult = await processSingleUrl(url, source.name, source.sourceType);
            result.processedUrlCount++;
            result.createdCaseCount += crawlResult.createdCaseCount;
            if (crawlResult.errors.length > 0) {
              result.errors.push(...crawlResult.errors.map(e => `${url}: ${e}`));
            }
            if (crawlResult.createdCaseCount > 0) {
              console.log(`[SJTU]   +${crawlResult.createdCaseCount} cases from ${url}`);
            }
          } catch (err) {
            result.errors.push(`${url}: ${(err as Error).message}`);
          }
        }
      }
    } catch (err) {
      result.status = 'error';
      result.errors.push(`Discovery failed: ${(err as Error).message}`);
      console.error(`[SJTU]   Error: ${(err as Error).message}`);
    }

    results.push(result);
    console.log(`[SJTU]   Result: ${result.createdCaseCount} new cases from ${result.processedUrlCount} URLs`);
    console.log('');
  }

  console.log('\n## SJTU Batch Crawl Summary');
  console.log('| ID | 来源 | 域名 | 发现URL | 处理URL | 新增案例 | 状态 |');
  console.log('|---|---|---:|---:|---:|---|');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.name} | ${r.domain} | ${r.discoveredUrlCount} | ${r.processedUrlCount} | ${r.createdCaseCount} | ${r.status} |`);
  }
  console.log('');

  console.log('### Errors:');
  for (const r of results) {
    if (r.errors.length > 0) {
      console.log(`#### ${r.name}`);
      for (const e of r.errors.slice(0, 10)) {
        console.log(`  - ${e}`);
      }
    }
  }

  const totalNew = results.reduce((sum, r) => sum + r.createdCaseCount, 0);
  console.log(`\nTotal new cases: ${totalNew}`);
}

crawlSJTU()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
