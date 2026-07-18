import pLimit from 'p-limit';
import type { CrawlSource } from '@prisma/client';
import { prisma } from '../prisma.js';
import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { discoverNasaImages, ingestNasaImage } from './nasaAdapter.js';
import { KeyedTaskQueue } from '../services/taskQueue.js';

export interface SourceCrawlOptions {
  maxLinks?: number;
  maxPages?: number;
  concurrency?: number;
  trigger?: 'manual' | 'batch' | 'schedule' | 'retry';
  mode?: 'incremental' | 'full';
}

const sourceQueue = new KeyedTaskQueue(1, 100, error => {
  console.error('[source-crawl-queue]', error);
});

export const EASY_STATIC_SOURCE_NAMES = [
  'MIT News - Research',
  'MIT News - Science',
  'MIT News - Engineering',
  'MIT News - Biology',
  'MIT News - Physics',
  'Harvard Gazette',
  'Harvard Gazette - Science',
  'Harvard Gazette - Health',
  'Harvard Gazette - Nation',
  'Berkeley Lab News Center',
  'Berkeley Lab News - Research',
  'Berkeley Lab - Computing Sciences',
  'Berkeley Lab - Energy',
  'Berkeley Lab - Physical Sciences',
  'Max Planck Society Newsroom',
  'Max Planck Research Highlights',
  'Max Planck - Physics',
  'Max Planck - Biology Medicine',
  'Max Planck - Chemistry',
  'Stanford Engineering News',
  'Stanford Engineering - News Feed',
  'Stanford Report - Science',
  'Stanford Report - Health',
  'Stanford Report - Technology',
  'NASA EO - Climate',
  'NASA EO - Hazards',
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
    data: {
      sourceId: source.id,
      status: 'pending',
      trigger: options.trigger || 'manual',
      mode: options.mode || 'incremental',
    },
  });

  const queueStatus = sourceQueue.tryEnqueue(String(source.id), () => runSourceCrawlJob(source, job.id, options));
  if (queueStatus === 'full') {
    await prisma.crawlJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: '采集队列已满，请稍后重试。', finishedAt: new Date() },
    });
    return { job: { ...job, status: 'failed' }, queued: false };
  }
  return { job, queued: true };
}

async function runSourceCrawlJob(source: CrawlSource, jobId: number, options: SourceCrawlOptions) {
  try {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { startedAt: new Date(), heartbeatAt: new Date(), attempt: { increment: 1 } },
    });
    if (source.adapterType === 'api' || source.sourceType === 'api') {
      await runApiSourceCrawl(source, jobId, options);
      return;
    }
    if (source.adapterType === 'browser_render' || source.crawlStatus === 'needs_browser') {
      const { supportsUniversityBrowserSource, runUniversityBrowserSource } = await import('./runUniversityBrowserBatch.js');
      if (!supportsUniversityBrowserSource(source.name)) {
        throw new Error('该来源需要浏览器采集，但尚未配置浏览器适配规则。');
      }
      await runUniversityBrowserSource(source.name, source.id, jobId, {
        maxArticles: options.maxLinks ?? 30,
        maxImagesPerPage: 100,
      });
      await prisma.crawlSource.update({
        where: { id: source.id },
        data: { lastSuccessAt: new Date(), healthStatus: 'healthy' },
      });
      return;
    }
    await runStaticSourceCrawl(source, jobId, options);
  } catch (err) {
    await prisma.crawlJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: (err as Error).message, finishedAt: new Date() },
    }).catch(() => {});
    await prisma.crawlSource.update({
      where: { id: source.id },
      data: { healthStatus: 'failing' },
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
      data: {
        status: 'partial',
        totalCount: 0,
        crawledCount: 0,
        newCases: 0,
        warning: '没有发现文章链接，可能是网站改版、被阻挡或没有完成翻页。',
        finishedAt: new Date(),
      },
    });
    return;
  }

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: { status: 'crawling', discoveredUrls: JSON.stringify(articleUrls), totalCount: articleUrls.length },
  });
  await prisma.crawlItem.createMany({
    data: articleUrls.map(url => ({ jobId, sourceId: source.id, url })),
  });

  const limit = pLimit(options.concurrency ?? 2);
  const completedUrls: string[] = [];
  let totalNewCases = 0;
  let failedPages = 0;

  await Promise.all(articleUrls.map(url =>
    limit(async () => {
      try {
        let lastError = '';
        let result: Awaited<ReturnType<typeof processSingleUrl>> | null = null;
        for (let attempt = 1; attempt <= 2 && !result; attempt++) {
          try {
            await prisma.crawlItem.updateMany({ where: { jobId, url }, data: { status: 'crawling', attempts: attempt } });
            result = await processSingleUrl(url, source.name, source.sourceType);
          } catch (error) {
            lastError = (error as Error).message;
          }
        }
        if (result) {
          totalNewCases += result.createdCaseCount;
          await prisma.crawlItem.updateMany({
            where: { jobId, url },
            data: { status: 'completed', downloadedImages: result.createdCaseCount, error: '' },
          });
        } else {
          failedPages++;
          await prisma.crawlItem.updateMany({ where: { jobId, url }, data: { status: 'failed', error: lastError } });
        }
      } finally {
        completedUrls.push(url);
        await prisma.crawlJob.update({
          where: { id: jobId },
          data: {
            crawledCount: completedUrls.length,
            crawledUrls: JSON.stringify(completedUrls),
            newCases: totalNewCases,
            downloadedImages: totalNewCases,
            failedPages,
            heartbeatAt: new Date(),
          },
        });
      }
    })
  ));

  await prisma.crawlJob.update({
    where: { id: jobId },
    data: {
      status: failedPages ? 'partial' : 'completed',
      crawledCount: completedUrls.length,
      newCases: totalNewCases,
      downloadedImages: totalNewCases,
      failedPages,
      warning: failedPages ? `有 ${failedPages} 篇文章失败，可稍后重试。` : '',
      finishedAt: new Date(),
    },
  });
  await prisma.crawlSource.update({
    where: { id: source.id },
    data: {
      lastSuccessAt: failedPages ? undefined : new Date(),
      healthStatus: failedPages ? 'warning' : 'healthy',
    },
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
    data: { status: 'completed', crawledCount, newCases: totalNewCases, downloadedImages: totalNewCases, finishedAt: new Date() },
  });
  await prisma.crawlSource.update({
    where: { id: source.id },
    data: { lastSuccessAt: new Date(), healthStatus: 'healthy' },
  });
}

export async function markInterruptedCrawlJobs() {
  return prisma.crawlJob.updateMany({
    where: { status: { in: ['pending', 'discovering', 'crawling'] } },
    data: {
      status: 'partial',
      warning: '上次采集因服务停止而中断，请点击“重试更新”。',
      finishedAt: new Date(),
    },
  });
}
