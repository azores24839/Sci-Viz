import pLimit from 'p-limit';
import type { CrawlSource } from '@prisma/client';
import { prisma } from '../prisma.js';
import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { discoverNasaImages, ingestNasaImage } from './nasaAdapter.js';

export interface SourceCrawlOptions {
  maxLinks?: number;
  maxPages?: number;
  concurrency?: number;
}

export const EASY_STATIC_SOURCE_NAMES = [
  'MIT News - Research',
  'Harvard Gazette',
  'Berkeley Lab News Center',
  'CAS Research Progress',
  'ScienceNet',
];

export async function discoverSourceArticles(source: CrawlSource, options: SourceCrawlOptions = {}) {
  const maxLinks = options.maxLinks ?? 10;
  const maxPages = options.maxPages ?? 2;
  const discovered = await discoverLinks(source.url, maxLinks, maxPages);
  return discovered.map(link => link.url);
}

export async function enqueueSourceCrawlJob(source: CrawlSource, options: SourceCrawlOptions = {}) {
  const active = await prisma.crawlJob.findFirst({
    where: { sourceId: source.id, status: { in: ['pending', 'discovering', 'crawling'] } },
  });
  if (active) {
    return { job: active, queued: false };
  }

  const job = await prisma.crawlJob.create({
    data: { sourceId: source.id, status: 'pending' },
  });

  void runSourceCrawlJob(source, job.id, options);
  return { job, queued: true };
}

async function runSourceCrawlJob(source: CrawlSource, jobId: number, options: SourceCrawlOptions) {
  try {
    if (source.adapterType === 'api' || source.sourceType === 'api') {
      await runApiSourceCrawl(source, jobId, options);
      return;
    }
    await runStaticSourceCrawl(source, jobId, options);
  } catch (err) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: (err as Error).message },
    }).catch(() => {});
  }
}

async function runStaticSourceCrawl(source: CrawlSource, jobId: number, options: SourceCrawlOptions) {
  await prisma.crawlJob.update({ where: { id: jobId }, data: { status: 'discovering' } });

  let articleUrls: string[] = [];
  try {
    articleUrls = await discoverSourceArticles(source, options);
  } catch (err) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: `Discovery failed: ${(err as Error).message}` },
    });
    return;
  }

  if (articleUrls.length === 0) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'completed', totalCount: 0, crawledCount: 0, newCases: 0 },
    });
    return;
  }

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status: 'crawling', discoveredUrls: JSON.stringify(articleUrls), totalCount: articleUrls.length },
  });

  const limit = pLimit(options.concurrency ?? 2);
  const completedUrls: string[] = [];
  let totalNewCases = 0;

  await Promise.all(articleUrls.map(url =>
    limit(async () => {
      try {
        const existing = await prisma.visualCase.findFirst({
          where: { sourceUrl: url }, select: { id: true },
        });
        if (!existing) {
          const result = await processSingleUrl(url, source.name, source.sourceType);
          totalNewCases += result.createdCaseCount;
        }
      } finally {
        completedUrls.push(url);
        await prisma.crawlJob.update({
          where: { id: jobId },
          data: { crawledCount: completedUrls.length, crawledUrls: JSON.stringify(completedUrls), newCases: totalNewCases },
        });
      }
    })
  ));

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status: 'completed', crawledCount: completedUrls.length, newCases: totalNewCases },
  });
}

async function runApiSourceCrawl(source: CrawlSource, jobId: number, options: SourceCrawlOptions) {
  await prisma.crawlJob.update({ where: { id: jobId }, data: { status: 'discovering' } });

  const maxPerKeyword = options.maxLinks ?? 10;

  let fullResults: Awaited<ReturnType<typeof discoverNasaImages>> = [];
  try {
    fullResults = await discoverNasaImages(maxPerKeyword);
  } catch (err) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: `NASA discovery failed: ${(err as Error).message}` },
    });
    return;
  }

  if (fullResults.length === 0) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'completed', totalCount: 0, crawledCount: 0, newCases: 0 },
    });
    return;
  }

  const urls = fullResults.map(r => r.pageUrl);

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status: 'crawling', discoveredUrls: JSON.stringify(urls), totalCount: fullResults.length },
  });

  const limit = pLimit(options.concurrency ?? 2);
  let crawledCount = 0;
  let totalNewCases = 0;

  await Promise.all(fullResults.map(r =>
    limit(async () => {
      try {
        const count = await ingestNasaImage(r, source.name, source.sourceType);
        totalNewCases += count;
      } finally {
        crawledCount++;
        await prisma.crawlJob.update({
          where: { id: jobId },
          data: { crawledCount, newCases: totalNewCases },
        });
      }
    })
  ));

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status: 'completed', crawledCount, newCases: totalNewCases },
  });
}
