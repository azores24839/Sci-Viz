import { Router, Request, Response } from 'express';
import { runUrlCrawl } from '../crawler/runUrlCrawl.js';
import { assertPublicHttpUrl, normalizeHttpUrl } from '../utils/httpSafety.js';

export const crawlRouter = Router();

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
        createdCaseCount: 0,
        errors: ['Invalid URL format - must be a valid http/https URL'],
      });
    }

    res.json(result);
  } catch (error) {
    console.error('[crawl] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
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
    res.json({
      success: false,
      status: 0,
      message: `Network error: ${(error as Error).message}`,
    });
  }
});
