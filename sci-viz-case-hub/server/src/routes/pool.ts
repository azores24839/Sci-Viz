import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { discoverSourceArticles, EASY_STATIC_SOURCE_NAMES, enqueueSourceCrawlJob } from '../crawler/sourceJobRunner.js';
import { clampInt, normalizeHttpUrl, toTrimmedString } from '../utils/httpSafety.js';
import { classifyEnterpriseSource } from '../services/enterpriseTaxonomy.js';

export const poolRouter = Router();

type CrawlAvailability = 'auto' | 'needs_adapter' | 'blocked' | 'dead';

function parseRouteId(value: string): number | null {
  const id = clampInt(value, 0, 1, Number.MAX_SAFE_INTEGER);
  return id > 0 ? id : null;
}

function sourceDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function classifyAvailability(
  source: { name: string; crawlStatus: string; lastDiagnosis: string; url: string },
  existingCases: number,
): CrawlAvailability {
  const haystack = `${source.name} ${source.crawlStatus} ${source.lastDiagnosis} ${source.url}`.toLowerCase();
  if (/energy\.gov\/eere\/water\/photos\/rd-image-gallery|energy\.gov\/eere\/cmei-photographs|pmel\.noaa\.gov\/gallery\/climate-weather-research-photos/.test(haystack)) {
    return 'dead';
  }
  if (/404|not found|gone|dead|入口失效/.test(haystack)) return 'dead';
  if (/403|cloudflare|blocked|bot protection|auth|required|forbidden|反爬|nih\.gov\/about-nih\/nih-almanac\/photo-galleries/.test(haystack)) return 'blocked';
  if (existingCases > 0 && !/manual|needs_adapter|tuning|adapter|需人工|适配/.test(haystack)) return 'auto';
  if (/needs_adapter|manual|dry_run|required|tuning|adapter|需人工|适配|fetch failed/.test(haystack)) return 'needs_adapter';
  return 'auto';
}

async function countCasesForSource(source: { name: string; url: string }) {
  const domain = sourceDomainFromUrl(source.url);
  const userHintCount = source.name
    ? await prisma.visualCase.count({ where: { userHint: { contains: source.name } } })
    : 0;
  if (userHintCount > 0) return userHintCount;

  const titleCount = source.name
    ? await prisma.visualCase.count({ where: { caseTitle: { contains: source.name } } })
    : 0;
  if (titleCount > 0) return titleCount;

  if (!domain) return 0;
  return prisma.visualCase.count({ where: { sourceDomain: domain } });
}

poolRouter.get('/pool/sources', async (req: Request, res: Response) => {
  try {
    const { category, includeDisabled } = req.query;
    const where: Record<string, unknown> = {};
    if (category && typeof category === 'string') where.category = category;
    if (includeDisabled !== 'true') where.enabled = true;

    const sources = await prisma.crawlSource.findMany({
      where,
      orderBy: { category: 'asc' },
      include: {
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const result = await Promise.all(sources.map(async source => {
      let hostname = '';
      try { hostname = new URL(source.url).hostname; } catch { /* */ }
      const existingCases = await countCasesForSource(source);
      const enterpriseTaxonomy = classifyEnterpriseSource(source);
      return {
        ...source,
        sourceDomain: hostname,
        enterpriseCompany: enterpriseTaxonomy?.companyName || '',
        enterpriseCompanyKey: enterpriseTaxonomy?.companyKey || '',
        sourcePageType: enterpriseTaxonomy?.sourcePageType || '',
        lastJob: source.jobs[0] || null,
        existingCases,
        crawlAvailability: classifyAvailability(source, existingCases),
        jobs: undefined,
      };
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.get('/pool/sources/:id', async (req: Request, res: Response) => {
  try {
    const id = parseRouteId(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid source id' });
      return;
    }
    const source = await prisma.crawlSource.findUnique({
      where: { id },
      include: {
        jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!source) {
      res.status(404).json({ success: false, error: 'Source not found' });
      return;
    }
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.post('/pool/sources', async (req: Request, res: Response) => {
  try {
    const { name, url, category, sourceType, adapterType, crawlStatus, crawlTier, lastDiagnosis, visualValue, strategyHint, notes } = req.body;
    const normalizedUrl = normalizeHttpUrl(url);
    if (!normalizedUrl) {
      res.status(400).json({ success: false, error: 'url must be a valid http/https URL' });
      return;
    }
    const source = await prisma.crawlSource.create({
      data: {
        name: toTrimmedString(name, 200),
        url: normalizedUrl,
        category: toTrimmedString(category, 20),
        sourceType: toTrimmedString(sourceType, 100),
        adapterType: toTrimmedString(adapterType, 50) || 'static_html',
        crawlStatus: toTrimmedString(crawlStatus, 50) || 'active_static',
        crawlTier: toTrimmedString(crawlTier, 10) || 'B',
        lastDiagnosis: toTrimmedString(lastDiagnosis, 2000),
        visualValue: toTrimmedString(visualValue, 2000),
        strategyHint: toTrimmedString(strategyHint, 2000),
        notes: toTrimmedString(notes, 2000),
      },
    });
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.patch('/pool/sources/:id', async (req: Request, res: Response) => {
  try {
    const id = parseRouteId(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid source id' });
      return;
    }
    const { name, url, category, sourceType, adapterType, crawlStatus, crawlTier, lastDiagnosis, visualValue, strategyHint, enabled, notes } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = toTrimmedString(name, 200);
    if (url !== undefined) {
      const normalizedUrl = normalizeHttpUrl(url);
      if (!normalizedUrl) {
        res.status(400).json({ success: false, error: 'url must be a valid http/https URL' });
        return;
      }
      updateData.url = normalizedUrl;
    }
    if (category !== undefined) updateData.category = toTrimmedString(category, 20);
    if (sourceType !== undefined) updateData.sourceType = toTrimmedString(sourceType, 100);
    if (adapterType !== undefined) updateData.adapterType = toTrimmedString(adapterType, 50);
    if (crawlStatus !== undefined) updateData.crawlStatus = toTrimmedString(crawlStatus, 50);
    if (crawlTier !== undefined) updateData.crawlTier = toTrimmedString(crawlTier, 10);
    if (lastDiagnosis !== undefined) updateData.lastDiagnosis = toTrimmedString(lastDiagnosis, 2000);
    if (visualValue !== undefined) updateData.visualValue = toTrimmedString(visualValue, 2000);
    if (strategyHint !== undefined) updateData.strategyHint = toTrimmedString(strategyHint, 2000);
    if (enabled !== undefined) updateData.enabled = enabled === true;
    if (notes !== undefined) updateData.notes = toTrimmedString(notes, 2000);

    const existing = await prisma.crawlSource.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Source not found' });
      return;
    }

    const source = await prisma.crawlSource.update({ where: { id }, data: updateData });
    res.json({ success: true, data: source });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.delete('/pool/sources/:id', async (req: Request, res: Response) => {
  try {
    const id = parseRouteId(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid source id' });
      return;
    }
    const existing = await prisma.crawlSource.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Source not found' });
      return;
    }
    await prisma.crawlJob.deleteMany({ where: { sourceId: id } });
    await prisma.crawlSource.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.post('/pool/sources/:id/crawl', async (req: Request, res: Response) => {
  try {
    const sourceId = parseRouteId(req.params.id);
    if (!sourceId) {
      res.status(400).json({ success: false, error: 'Invalid source id' });
      return;
    }
    const source = await prisma.crawlSource.findUnique({ where: { id: sourceId } });
    if (!source) {
      res.status(404).json({ success: false, error: 'Source not found' });
      return;
    }

    const result = await enqueueSourceCrawlJob(source, {
      maxLinks: clampInt(req.body.maxLinks, 30, 1, 100),
      maxPages: clampInt(req.body.maxPages, 5, 1, 20),
      concurrency: clampInt(req.body.concurrency, 2, 1, 4),
    });
    if (!result.queued) {
      res.status(409).json({ success: false, error: 'A crawl is already in progress for this source' });
      return;
    }

    res.json({ success: true, data: { jobId: result.job.id } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.post('/pool/crawl/easy', async (req: Request, res: Response) => {
  try {
    const maxSources = clampInt(req.body.maxSources, 3, 1, EASY_STATIC_SOURCE_NAMES.length);
    const maxLinks = clampInt(req.body.maxLinksPerSource, 5, 1, 30);
    const maxPages = clampInt(req.body.maxPages, 1, 1, 5);
    const concurrency = clampInt(req.body.concurrency, 1, 1, 3);
    const dryRun = req.body.dryRun === true;

    const sources = await prisma.crawlSource.findMany({
      where: {
        enabled: true,
        name: { in: EASY_STATIC_SOURCE_NAMES.slice(0, maxSources) },
      },
      orderBy: { id: 'asc' },
    });

    if (dryRun) {
      const results = [];
      for (const source of sources) {
        try {
          const urls = await discoverSourceArticles(source, { maxLinks, maxPages });
          results.push({ sourceId: source.id, sourceName: source.name, urls });
        } catch (err) {
          results.push({ sourceId: source.id, sourceName: source.name, urls: [], error: (err as Error).message });
        }
      }
      res.json({ success: true, data: results });
      return;
    }

    const jobs = [];
    for (const source of sources) {
      const result = await enqueueSourceCrawlJob(source, { maxLinks, maxPages, concurrency });
      jobs.push({
        sourceId: source.id,
        sourceName: source.name,
        jobId: result.job.id,
        queued: result.queued,
      });
    }

    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

poolRouter.get('/pool/jobs/:id', async (req: Request, res: Response) => {
  try {
    const id = parseRouteId(req.params.id);
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid job id' });
      return;
    }
    const job = await prisma.crawlJob.findUnique({ where: { id } });
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    res.json({ success: true, data: job });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
