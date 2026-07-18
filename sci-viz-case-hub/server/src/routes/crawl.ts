import { Router, Request, Response } from 'express';
import { runUrlCrawl } from '../crawler/runUrlCrawl.js';
import { assertPublicHttpUrl, normalizeHttpUrl } from '../utils/httpSafety.js';
import { sendInternalError } from '../middleware/requestContext.js';
import { discoverSite } from '../crawler/siteDiscovery.js';
import { cancelUrlCrawlTask, createUrlCrawlTask, getUrlCrawlTask } from '../services/urlCrawlTasks.js';
import { prisma } from '../prisma.js';
import {
  isSourceDistributionGroupKey,
  type SourceDistributionGroupKey,
} from '../services/sourceDistribution.js';

export const crawlRouter = Router();

const SITE_PRESETS = {
  quick: { pageLimit: 20, depthLimit: 1 },
  standard: { pageLimit: 50, depthLimit: 2 },
  deep: { pageLimit: 200, depthLimit: 3 },
} as const;

const CRAWL_SOURCE_METADATA: Record<SourceDistributionGroupKey, { category: string; sourceType: string }> = {
  domestic_university: { category: 'H', sourceType: 'university_news' },
  international_university: { category: 'A', sourceType: 'university_news' },
  enterprise: { category: 'ENT', sourceType: 'enterprise' },
  research_institute: { category: 'B', sourceType: 'research_institute' },
  journal_media: { category: 'D', sourceType: 'journal_media' },
  gallery_open: { category: 'E', sourceType: 'visualization_gallery' },
  other: { category: 'L', sourceType: 'other' },
};

function readRequiredSource(req: Request): { name: string; group: SourceDistributionGroupKey } | null {
  const name = typeof req.body?.source_name === 'string' ? req.body.source_name.trim().slice(0, 200) : '';
  const sourceType = typeof req.body?.source_type === 'string' ? req.body.source_type.trim() : '';
  if (!name || !isSourceDistributionGroupKey(sourceType)) return null;
  return { name, group: sourceType };
}

async function registerAssistantSource(rootUrl: string, name: string, group: SourceDistributionGroupKey) {
  const sourceUrl = `${new URL(rootUrl).origin}/`;
  const metadata = CRAWL_SOURCE_METADATA[group];
  const existing = await prisma.crawlSource.findFirst({
    where: { url: { in: [sourceUrl, sourceUrl.slice(0, -1)] } },
  });
  if (existing) {
    await prisma.crawlSource.update({
      where: { id: existing.id },
      data: { name, ...metadata, enabled: true },
    });
    return;
  }
  await prisma.crawlSource.create({
    data: {
      name,
      url: sourceUrl,
      ...metadata,
      adapterType: 'static_html',
      crawlStatus: 'active_static',
      crawlTier: 'B',
      notes: '由网页采集助手自动登记',
    },
  });
}

async function validateSiteCrawlUrls(rootUrl: string, requestedUrls: string[]) {
  const root = await assertPublicHttpUrl(rootUrl);
  const rootHost = root.hostname.replace(/^www\./, '').toLowerCase();
  const urls: string[] = [];
  for (const rawUrl of requestedUrls) {
    const checked = await assertPublicHttpUrl(rawUrl);
    if (checked.hostname.replace(/^www\./, '').toLowerCase() !== rootHost) continue;
    urls.push(checked.href);
  }
  return urls;
}

crawlRouter.post('/crawl/site/preview', async (req: Request, res: Response) => {
  try {
    const source = readRequiredSource(req);
    if (!source) {
      res.status(400).json({ success: false, error: '请填写来源名称并选择有效的来源类型' });
      return;
    }
    const rootUrl = normalizeHttpUrl(req.body?.url);
    const preset = SITE_PRESETS[req.body?.preset as keyof typeof SITE_PRESETS] || SITE_PRESETS.standard;
    if (!rootUrl) {
      res.status(400).json({ success: false, error: '请输入有效的网站地址' });
      return;
    }
    const result = await discoverSite(rootUrl, {
      ...preset,
      cookie: typeof req.body?.cookie === 'string' ? req.body.cookie : '',
    });
    res.json({ success: true, data: result });
  } catch (error) {
    sendInternalError(req, res, 'site crawl preview', error);
  }
});

crawlRouter.post('/crawl/site/run', async (req: Request, res: Response) => {
  try {
    const source = readRequiredSource(req);
    if (!source) {
      res.status(400).json({ success: false, error: '请填写来源名称并选择有效的来源类型' });
      return;
    }
    const rootUrl = normalizeHttpUrl(req.body?.rootUrl);
    const requestedUrls = Array.isArray(req.body?.urls)
      ? req.body.urls.map(normalizeHttpUrl).filter(Boolean).slice(0, 200) as string[]
      : [];
    if (!rootUrl || requestedUrls.length === 0) {
      res.status(400).json({ success: false, error: '请先完成网站范围扫描' });
      return;
    }
    const urls = await validateSiteCrawlUrls(rootUrl, requestedUrls);
    if (urls.length === 0) {
      res.status(400).json({ success: false, error: '没有可采集的同站网页' });
      return;
    }
    await registerAssistantSource(rootUrl, source.name, source.group);
    const result = await runUrlCrawl(
      urls,
      source.name,
      source.group,
      typeof req.body?.cookie === 'string' ? req.body.cookie : '',
    );
    res.json(result);
  } catch (error) {
    sendInternalError(req, res, 'site crawl run', error);
  }
});

crawlRouter.post('/crawl/site/tasks', async (req: Request, res: Response) => {
  try {
    const source = readRequiredSource(req);
    if (!source) {
      res.status(400).json({ success: false, error: '请填写来源名称并选择有效的来源类型' });
      return;
    }
    const rootUrl = normalizeHttpUrl(req.body?.rootUrl);
    const requestedUrls = Array.isArray(req.body?.urls)
      ? req.body.urls.map(normalizeHttpUrl).filter(Boolean).slice(0, 200) as string[]
      : [];
    if (!rootUrl || requestedUrls.length === 0) {
      res.status(400).json({ success: false, error: '请先完成网站范围扫描' });
      return;
    }
    const urls = await validateSiteCrawlUrls(rootUrl, requestedUrls);
    if (urls.length === 0) {
      res.status(400).json({ success: false, error: '没有可采集的同站网页' });
      return;
    }
    await registerAssistantSource(rootUrl, source.name, source.group);
    const task = createUrlCrawlTask({
      urls,
      sourceName: source.name,
      sourceType: source.group,
      cookie: typeof req.body?.cookie === 'string' ? req.body.cookie : '',
    });
    res.status(202).json({ success: true, data: task });
  } catch (error) {
    sendInternalError(req, res, 'site crawl task start', error);
  }
});

crawlRouter.get('/crawl/site/tasks/:id', (req: Request, res: Response) => {
  const task = getUrlCrawlTask(req.params.id);
  if (!task) {
    res.status(404).json({ success: false, error: '采集任务不存在或已过期' });
    return;
  }
  res.json({ success: true, data: task });
});

crawlRouter.post('/crawl/site/tasks/:id/cancel', (req: Request, res: Response) => {
  const task = cancelUrlCrawlTask(req.params.id);
  if (!task) {
    res.status(404).json({ success: false, error: '采集任务不存在或已过期' });
    return;
  }
  res.json({ success: true, data: task });
});

crawlRouter.post('/crawl/urls', async (req: Request, res: Response) => {
  try {
    const { urls, source_name, source_type, cookie } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ success: false, error: 'urls must be a non-empty array' });
      return;
    }

    if (urls.length > 20) {
      res.status(400).json({ success: false, error: 'Maximum 20 URLs per request' });
      return;
    }

    const normalized = urls.map(normalizeHttpUrl).filter(Boolean) as string[];

    if (normalized.length === 0) {
      res.status(400).json({ success: false, error: 'No valid URLs provided' });
      return;
    }

    const invalidCount = urls.length - normalized.length;
    const result = await runUrlCrawl(
      normalized,
      source_name || '',
      source_type || '',
      cookie || '',
    );

    result.summary.inputUrlCount = normalized.length;
    if (invalidCount > 0) {
      result.summary.failedPageCount += invalidCount;
      result.results.push({
        url: `<${invalidCount} invalid URL(s) omitted>`,
        status: 'failed' as const,
        pageTitle: '',
        candidateImageCount: 0,
        filteredImageCount: 0,
        filterReasons: {
          missingSourceCount: 0,
          inlineDataCount: 0,
          unsupportedFormatCount: 0,
          tooSmallCount: 0,
          duplicateUrlCount: 0,
        },
        createdCaseCount: 0,
        duplicateImageCount: 0,
        cappedImageCount: 0,
        failedImageCount: 0,
        createdCases: [],
        errors: ['Invalid URL format - must be a valid http/https URL'],
        notices: [],
      });
    }

    res.json(result);
  } catch (error) {
    sendInternalError(req, res, 'URL crawl', error);
  }
});

crawlRouter.get('/crawl/test-network', async (req: Request, res: Response) => {
  try {
    const testUrl = normalizeHttpUrl(req.query.url || 'https://example.com');
    if (!testUrl) {
      res.status(400).json({ success: false, status: 0, message: 'Invalid URL' });
      return;
    }
    const parsedUrl = await assertPublicHttpUrl(testUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: globalThis.Response;
    try {
      response = await fetch(parsedUrl.href, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'error',
      });
    } finally {
      clearTimeout(timeout);
    }

    res.json({
      success: true,
      status: response.status,
      message: 'Network access is available',
    });
  } catch (error) {
    console.warn(`[${req.requestId}] [crawl] Network test failed:`, error);
    res.json({
      success: false,
      status: 0,
      message: 'Network test failed',
      requestId: req.requestId,
    });
  }
});
