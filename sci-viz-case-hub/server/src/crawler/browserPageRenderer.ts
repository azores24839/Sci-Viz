import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from 'playwright';
import { assertPublicHttpUrl } from '../utils/httpSafety.js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_RENDERED_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REQUESTS_PER_RENDER = 400;
const PUBLIC_HOST_CACHE_MS = 5_000;

export interface RenderedPublicPage {
  finalUrl: string;
  title: string;
  html: string;
}

export interface BrowserPageRenderer {
  render(rawUrl: string, options?: { cookie?: string; signal?: AbortSignal }): Promise<RenderedPublicPage>;
  close(): Promise<void>;
}

/**
 * Prefer the fast static path. Render only when the response looks like a
 * framework shell and produced too few useful images.
 */
export function shouldUseBrowserRendering(
  html: string,
  validImageCount: number,
  embeddedImageCount: number,
): boolean {
  if (embeddedImageCount > 0 || validImageCount >= 3) return false;
  const $ = cheerio.load(html);
  const scriptCount = $('script').length;
  if (scriptCount === 0) return false;
  const frameworkRoot = $('#root, #__next, #app, [data-reactroot], [data-v-app]').length > 0;
  const frameworkScript = $('script[type="module"], script[src*="/_next/"], script[src*="/assets/"], script[src*="/static/js/"]').length > 0;
  const $body = $('body').clone();
  $body.find('script, style, noscript, iframe, svg').remove();
  const bodyTextLength = $body.text().replace(/\s+/g, ' ').trim().length;
  const sparseShell = validImageCount === 0
    && $('img').length <= 1
    && $('a[href]').length < 5
    && bodyTextLength < 1_000
    && scriptCount >= 2;
  return (validImageCount < 3 && (frameworkRoot || frameworkScript)) || sparseShell;
}

class SafeBrowserPageRenderer implements BrowserPageRenderer {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly renderLimit = pLimit(1);
  private readonly publicHostChecks = new Map<string, { checkedAt: number; promise: Promise<void> }>();
  private activeCookieOrigin = '';
  private activeCookie = '';
  private activeRequestCount = 0;

  private async ensurePublicRequest(url: URL): Promise<void> {
    const key = url.hostname.toLowerCase();
    const cached = this.publicHostChecks.get(key);
    if (cached && Date.now() - cached.checkedAt < PUBLIC_HOST_CACHE_MS) {
      await cached.promise;
      return;
    }
    const promise = assertPublicHttpUrl(url.href).then(() => undefined);
    this.publicHostChecks.set(key, { checkedAt: Date.now(), promise });
    await promise;
  }

  private async handleRoute(route: Route): Promise<void> {
    const rawUrl = route.request().url();
    this.activeRequestCount++;
    if (this.activeRequestCount > MAX_REQUESTS_PER_RENDER) {
      await route.abort();
      return;
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      await route.abort();
      return;
    }
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) {
      await route.continue();
      return;
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      await route.abort();
      return;
    }
    try {
      await this.ensurePublicRequest(url);
      const headers = { ...route.request().headers() };
      delete headers.cookie;
      if (this.activeCookie && url.origin === this.activeCookieOrigin) {
        headers.cookie = this.activeCookie;
      }
      await route.continue({ headers });
    } catch {
      await route.abort();
    }
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHROME_EXECUTABLE || undefined,
      });
    }
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1440, height: 1200 },
        userAgent: USER_AGENT,
        serviceWorkers: 'block',
      });
      await this.context.route('**/*', route => this.handleRoute(route));
      await this.context.routeWebSocket(/.*/, webSocket => webSocket.close());
    }
    this.page = await this.context.newPage();
    return this.page;
  }

  async render(
    rawUrl: string,
    options: { cookie?: string; signal?: AbortSignal } = {},
  ): Promise<RenderedPublicPage> {
    return this.renderLimit(async () => {
      if (options.signal?.aborted) throw new Error('Browser rendering cancelled');
      const checked = await assertPublicHttpUrl(rawUrl);
      this.activeCookieOrigin = checked.origin;
      this.activeCookie = options.cookie?.trim() || '';
      this.activeRequestCount = 0;
      const page = await this.ensurePage();
      const abortHandler = () => { void page.close().catch(() => {}); };
      options.signal?.addEventListener('abort', abortHandler, { once: true });

      try {
        try {
          await page.goto(checked.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        } catch (error) {
          if (options.signal?.aborted) throw new Error('Browser rendering cancelled');
          const readyState = await page.evaluate(() => document.readyState).catch(() => 'loading');
          if (readyState === 'loading') throw error;
        }
        if (options.signal?.aborted) throw new Error('Browser rendering cancelled');
        await page.waitForTimeout(500);
        for (const ratio of [0, 0.5, 1, 0]) {
          await page.evaluate(value => {
            window.scrollTo(0, Math.floor(document.documentElement.scrollHeight * value));
          }, ratio);
          await page.waitForTimeout(150);
        }

      await page.$$eval('img', images => {
        for (const image of images) {
          const src = image.currentSrc || image.src;
          if (src) image.setAttribute('src', src);
          if (image.naturalWidth) image.setAttribute('width', String(image.naturalWidth));
          if (image.naturalHeight) image.setAttribute('height', String(image.naturalHeight));
        }
      });
      await page.evaluate(() => {
        const raster = /url\(["']?([^"')]+\.(?:jpe?g|png|gif|webp|avif)(?:\?[^"')]*)?)["']?\)/i;
        const existing = new Set(Array.from(document.images).map(image => image.currentSrc || image.src));
        let appended = 0;
        for (const element of Array.from(document.querySelectorAll('*'))) {
          if (appended >= 100) break;
          const match = getComputedStyle(element).backgroundImage.match(raster);
          if (!match) continue;
          const src = new URL(match[1], document.baseURI).href;
          const rect = element.getBoundingClientRect();
          if (existing.has(src) || rect.width < 96 || rect.height < 96) continue;
          const image = document.createElement('img');
          image.src = src;
          image.width = Math.round(rect.width);
          image.height = Math.round(rect.height);
          image.alt = element.getAttribute('aria-label') || document.title;
          image.setAttribute('data-browser-background', 'true');
          image.style.display = 'none';
          document.body.appendChild(image);
          existing.add(src);
          appended++;
        }
      });

        const finalUrl = (await assertPublicHttpUrl(page.url())).href;
        const html = await page.content();
        if (Buffer.byteLength(html, 'utf8') > MAX_RENDERED_HTML_BYTES) {
          throw new Error('Rendered page HTML exceeds the 5 MB safety limit');
        }
        return { finalUrl, title: await page.title(), html };
      } finally {
        options.signal?.removeEventListener('abort', abortHandler);
      }
    });
  }

  async close(): Promise<void> {
    await this.renderLimit(async () => {
      await this.page?.close().catch(() => {});
      await this.context?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
      this.page = null;
      this.context = null;
      this.browser = null;
    });
  }
}

export function createBrowserPageRenderer(): BrowserPageRenderer {
  return new SafeBrowserPageRenderer();
}
