import * as cheerio from 'cheerio';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { canonicalImageUrl, filterImageCandidates } from './filterImageCandidates.js';
import { assertPublicHttpUrl, readTextWithLimit } from '../utils/httpSafety.js';
import { extractEmbeddedPageLinks } from './extractEmbeddedPageData.js';
import { createBrowserPageRenderer, shouldUseBrowserRendering } from './browserPageRenderer.js';

const SKIP_PATH = /\/(login|signin|sign-in|register|account|cart|checkout|privacy|terms|search)(\/|$)/i;
const SKIP_EXTENSION = /\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico|pdf|zip|rar|docx?|xlsx?|pptx?|mp4|mov|avi|css|js|json|xml)(?:$|\?)/i;
const DISCOVERY_CONCURRENCY = 5;

export interface SiteDiscoveryPage {
  url: string;
  title: string;
  depth: number;
  imageCount: number;
  interactiveCount: number;
  embeddedImageCount: number;
  browserRendered: boolean;
}

export interface SiteDiscoveryResult {
  rootUrl: string;
  hostname: string;
  pageLimit: number;
  depthLimit: number;
  scannedPageCount: number;
  discoveredPageCount: number;
  rawImageCount: number;
  estimatedImageCount: number;
  estimatedTotalImageCount: number;
  filteredImageCount: number;
  duplicateAcrossPageCount: number;
  interactiveCount: number;
  embeddedImageCount: number;
  embeddedLinkCount: number;
  dynamicShellCount: number;
  browserRenderedPageCount: number;
  browserRenderFailureCount: number;
  limitReached: boolean;
  pages: SiteDiscoveryPage[];
  urls: string[];
  warnings: string[];
}

function hostKey(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function canonicalPageUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch {
    return null;
  }
}

export function isUnresolvedDynamicShell(
  html: string,
  validImageCount: number,
  embeddedImageCount: number,
): boolean {
  if (embeddedImageCount > 0 || validImageCount > 0) return false;
  const $ = cheerio.load(html);
  const $bodyWithoutScripts = $('body').clone();
  $bodyWithoutScripts.find('script, style, noscript, iframe, svg').remove();
  const meaningfulBodyText = $bodyWithoutScripts.text().replace(/\s+/g, ' ').trim();
  return $('#root, #__next, #app, [data-reactroot]').length > 0
    && $('a[href]').length === 0
    && meaningfulBodyText.length < 200;
}

async function fetchHtml(rawUrl: string, cookie?: string) {
  let checked = await assertPublicHttpUrl(rawUrl);
  const cookieOrigin = checked.origin;
  for (let redirects = 0; redirects < 5; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(checked.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
          ...(cookie?.trim() && checked.origin === cookieOrigin ? { Cookie: cookie.trim() } : {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`页面重定向缺少目标地址（HTTP ${response.status}）`);
      checked = await assertPublicHttpUrl(new URL(location, checked.href).href);
      continue;
    }
    if (!response.ok) throw new Error(`网页返回 HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) throw new Error(`不是网页内容（${contentType || '未知格式'}）`);
    return { finalUrl: checked.href, html: await readTextWithLimit(response) };
  }
  throw new Error('网页重定向次数过多');
}

export async function discoverSite(
  rawRootUrl: string,
  options: { pageLimit: number; depthLimit: number; cookie?: string },
): Promise<SiteDiscoveryResult> {
  const rootChecked = await assertPublicHttpUrl(rawRootUrl);
  const pageLimit = Math.max(1, Math.min(1000, Math.trunc(options.pageLimit)));
  const depthLimit = Math.max(0, Math.min(5, Math.trunc(options.depthLimit)));
  const queue: Array<{ url: string; depth: number }> = [{ url: rootChecked.href, depth: 0 }];
  const queued = new Set<string>([canonicalPageUrl(rootChecked.href) || rootChecked.href]);
  const pages: SiteDiscoveryPage[] = [];
  const warnings: string[] = [];
  const seenImages = new Set<string>();
  let allowedHost = hostKey(rootChecked.hostname);
  let resolvedRootUrl = rootChecked.href;
  let discoveredPageCount = 1;
  let rawImageCount = 0;
  let filteredImageCount = 0;
  let duplicateAcrossPageCount = 0;
  let embeddedImageCount = 0;
  let embeddedLinkCount = 0;
  let dynamicShellCount = 0;
  let browserRenderedPageCount = 0;
  let browserRenderFailureCount = 0;
  const browserRenderer = createBrowserPageRenderer();

  try {
    while (queue.length > 0 && pages.length < pageLimit) {
    const batch = queue.splice(0, Math.min(DISCOVERY_CONCURRENCY, pageLimit - pages.length));
    const fetchedBatch = await Promise.all(batch.map(async current => {
      try {
        return { ok: true as const, current, fetched: await fetchHtml(current.url, options.cookie) };
      } catch (error) {
        return { ok: false as const, current, error: error as Error };
      }
    }));

    for (const item of fetchedBatch) {
      const { current } = item;
      if (!item.ok) {
        if (warnings.length < 8) warnings.push(`${current.url}：${item.error.message}`);
        continue;
      }
      const { fetched } = item;
      if (current.depth === 0) {
        allowedHost = hostKey(new URL(fetched.finalUrl).hostname);
        resolvedRootUrl = fetched.finalUrl;
      }
      let pageUrl = fetched.finalUrl;
      let pageHtml = fetched.html;
      let extracted = await extractImagesFromPage(pageUrl, pageHtml, { mode: 'survey' });
      let filtered = filterImageCandidates(extracted.images);
      let browserRendered = false;
      if (shouldUseBrowserRendering(pageHtml, filtered.valid.length, extracted.embeddedImageCount)) {
        try {
          const rendered = await browserRenderer.render(pageUrl, { cookie: options.cookie });
          if (hostKey(new URL(rendered.finalUrl).hostname) !== allowedHost) {
            throw new Error('动态渲染跳转到了站外地址');
          }
          pageUrl = rendered.finalUrl;
          pageHtml = rendered.html;
          extracted = await extractImagesFromPage(pageUrl, pageHtml, { mode: 'survey' });
          filtered = filterImageCandidates(extracted.images);
          browserRendered = true;
          browserRenderedPageCount++;
          if (current.depth === 0) resolvedRootUrl = pageUrl;
        } catch (error) {
          browserRenderFailureCount++;
          if (warnings.length < 8) warnings.push(`${pageUrl}：动态渲染失败（${(error as Error).message}）`);
        }
      }
      embeddedImageCount += extracted.embeddedImageCount;
      rawImageCount += extracted.images.length;
      filteredImageCount += filtered.filteredCount;
      const uniqueImages = filtered.valid.filter(image => {
        const key = canonicalImageUrl(image.src);
        if (seenImages.has(key)) {
          duplicateAcrossPageCount++;
          return false;
        }
        seenImages.add(key);
        return true;
      });
      const $ = cheerio.load(pageHtml);
      const unresolvedDynamicShell = isUnresolvedDynamicShell(
        pageHtml,
        filtered.valid.length,
        extracted.embeddedImageCount,
      );
      if (unresolvedDynamicShell) dynamicShellCount++;
      const interactiveCount = $('[role="tab"], button[aria-controls], a[aria-controls], details').length;
      pages.push({
        url: pageUrl,
        title: extracted.pageTitle || new URL(pageUrl).hostname,
        depth: current.depth,
        imageCount: uniqueImages.length,
        interactiveCount,
        embeddedImageCount: extracted.embeddedImageCount,
        browserRendered,
      });

      if (current.depth >= depthLimit) continue;
      const enqueueHref = (href: string | undefined, embedded = false) => {
        if (!href) return;
        let absolute: string;
        try { absolute = new URL(href, pageUrl).href; } catch { return; }
        const canonical = canonicalPageUrl(absolute);
        if (!canonical || queued.has(canonical)) return;
        const url = new URL(canonical);
        if (hostKey(url.hostname) !== allowedHost) return;
        if (SKIP_PATH.test(url.pathname) || SKIP_EXTENSION.test(url.pathname)) return;
        queued.add(canonical);
        queue.push({ url: canonical, depth: current.depth + 1 });
        discoveredPageCount++;
        if (embedded) embeddedLinkCount++;
      };
      $('a[href]').each((_, element) => enqueueHref($(element).attr('href')));
      for (const href of extractEmbeddedPageLinks(pageHtml, pageUrl)) {
        enqueueHref(href, true);
      }
    }
  }
  } finally {
    await browserRenderer.close();
  }

  const estimatedTotalImageCount = pages.length > 0
    ? Math.max(seenImages.size, Math.round((seenImages.size / pages.length) * Math.max(discoveredPageCount, pages.length)))
    : 0;

  return {
    rootUrl: resolvedRootUrl,
    hostname: allowedHost,
    pageLimit,
    depthLimit,
    scannedPageCount: pages.length,
    discoveredPageCount,
    rawImageCount,
    estimatedImageCount: seenImages.size,
    estimatedTotalImageCount,
    filteredImageCount,
    duplicateAcrossPageCount,
    interactiveCount: pages.reduce((sum, page) => sum + page.interactiveCount, 0),
    embeddedImageCount,
    embeddedLinkCount,
    dynamicShellCount,
    browserRenderedPageCount,
    browserRenderFailureCount,
    limitReached: queue.length > 0,
    pages,
    urls: pages.map(page => page.url),
    warnings,
  };
}
