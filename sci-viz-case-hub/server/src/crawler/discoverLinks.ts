import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { assertPublicHttpUrl, assertSameOriginUrl, readTextWithLimit } from '../utils/httpSafety.js';
import { getStaticSourceAdapter, type StaticSourceAdapter } from './staticSourceAdapters.js';

interface DiscoveredLink {
  url: string;
  title: string;
  score: number;
}

type CheerioRoot = ReturnType<typeof cheerio.load>;

const ARTICLE_PATH_PATTERNS = [
  /\/case-stud(y|ies)\//,
  /\/customer-stor(y|ies)\//,
  /\/success-stor(y|ies)\//,
  /\/solutions?\//,
  /\/industr(y|ies)\//,
  /\/applications?\//,
  /\/use-cases?\//,
  /\/products?\//,
  /\/technology\//,
  /\/innovation\//,
  /\/white-?papers?\//,
  /\/\d{4}\/\d{2}\/\d{2}\//,
  /\/news\//,
  /\/article\//,
  /\/story\//,
  /\/stories\//,
  /\/research\//,
  /\/science\//,
  /\/blog\//,
  /\/posts\//,
  /\/features\//,
  /\/topics\//,
  /\/press\//,
  /\/releases\//,
  /\/publications\//,
  /\/discoveries\//,
  /\/briefs\//,
  /\/spotlight\//,
  /\/announcement\//,
];

const GENERIC_LINK_TEXTS = [
  'read more', 'click here', 'learn more', 'more',
  'continue reading', 'view more', 'see more',
  'home', 'about', 'contact', 'search', 'menu',
  'subscribe', 'sign up', 'log in', 'login',
  'privacy', 'terms', 'accessibility',
  'next', 'previous', 'back', 'top',
  'share', 'print', 'email', 'rss',
];

const EXCLUDED_PATH_PATTERNS = [
  /^#/,
  /^javascript:/i,
  /^mailto:/i,
  /\.pdf$/i,
  /\.zip$/i,
  /\.docx?$/i,
  /\.pptx?$/i,
  /^tel:/i,
];

const PAGINATION_LINK_TEXTS = [
  'next', 'next page', 'older', 'older posts',
  'older entries', '\u4e0b\u4e00\u9875',
  '\u66f4\u65e9', '\u540e\u4e00\u9875',
];

function excludeUrl(url: string): boolean {
  for (const pat of EXCLUDED_PATH_PATTERNS) {
    if (pat.test(url)) return true;
  }
  return false;
}

function scoreUrl(url: string, adapter: StaticSourceAdapter | null): number {
  let score = 0;
  const normalized = url.toLowerCase();
  if (/\/(case-stud(y|ies)|customer-stor(y|ies)|success-stor(y|ies)|solutions?|industr(y|ies)|applications?|use-cases?|products?|technology|innovation|white-?papers?)\//.test(normalized)) {
    score += 30;
  }
  if (adapter?.articlePathPatterns.some(pat => pat.test(normalized))) {
    score += 40;
  }
  for (const pat of ARTICLE_PATH_PATTERNS) {
    if (pat.test(normalized)) {
      score += 20;
    }
  }
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length >= 3) score += 10;
  if (segments.length >= 4) score += 5;
  if (/[a-z]{2,}-[a-z]{2,}/.test(normalized)) score += 15;
  return score;
}

function scoreLinkText(text: string): number {
  if (!text || text.length < 10) return 0;
  let score = 10;
  if (text.length > 20) score += 10;
  if (text.length > 40) score += 10;
  const lower = text.toLowerCase();
  for (const generic of GENERIC_LINK_TEXTS) {
    if (lower === generic) {
      return 0;
    }
  }
  if (/^\d+$/.test(text)) return 0;
  return score;
}

function scorePosition(parentTag: string): number {
  if (['article', 'main', 'section'].includes(parentTag)) return 15;
  if (['h1', 'h2', 'h3', 'h4'].includes(parentTag)) return 20;
  if (['nav', 'footer', 'header'].includes(parentTag)) return -50;
  return 0;
}

async function fetchAndParse(url: string): Promise<{ html: string; $: CheerioRoot }> {
  const parsedUrl = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(parsedUrl.href, {
      signal: controller.signal,
      redirect: 'error',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error(`Not an HTML page: ${contentType}`);
    }
    const html = await readTextWithLimit(res);
    const $ = cheerio.load(html);
    return { html, $ };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function isInsideExcludedArea($: CheerioRoot, el: Element, adapter: StaticSourceAdapter | null): boolean {
  const selectors = adapter?.excludeSelectors || ['nav', 'header', 'footer', 'aside'];
  return selectors.some(selector => $(el).closest(selector).length > 0);
}

function extractLinksFromPage($: CheerioRoot, baseUrl: string, pageUrl: string): DiscoveredLink[] {
  const adapter = getStaticSourceAdapter(pageUrl);
  const seen = new Set<string>();
  const links: DiscoveredLink[] = [];
  const adapterPreferred = new Set<Element>();

  if (adapter) {
    for (const selector of adapter.articleLinkSelectors) {
      $(selector).each((_, el) => {
        if ('attribs' in el) adapterPreferred.add(el);
      });
    }
  }

  $('a[href]').each((_, el) => {
    const $el = $(el);
    let href = ($el.attr('href') || '').trim();
    if (!href) return;

    if (excludeUrl(href)) return;
    if (isInsideExcludedArea($, el, adapter)) return;

    try {
      href = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    const sameOriginHref = assertSameOriginUrl(href, pageUrl);
    if (!sameOriginHref) return;

    const parsed = new URL(sameOriginHref);
    if (parsed.hash && parsed.pathname === new URL(pageUrl).pathname) return;

    if (adapter?.excludeUrlPatterns?.some(p => p.test(sameOriginHref))) return;

    const dedupeKey = parsed.origin + parsed.pathname;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const text = $el.text().replace(/\s+/g, ' ').trim();

    if (adapter?.excludeTitlePatterns?.some(p => p.test(text))) return;

    const parentTag = $el.parent().get(0)?.tagName?.toLowerCase() || '';
    const grandParentTag = $el.parent().parent().get(0)?.tagName?.toLowerCase() || '';

    let score = scoreUrl(href, adapter) + scoreLinkText(text) + scorePosition(parentTag) + scorePosition(grandParentTag) * 0.5;
    if (adapterPreferred.has(el)) score += 30;
    if (score < 0) score = 0;

    if (score > 0) {
      links.push({ url: sameOriginHref, title: text, score });
    }
  });

  return links;
}

function findNextPageUrl($: CheerioRoot, currentUrl: string): string | null {
  const baseUrl = $('base[href]').first().attr('href') || currentUrl;

  const linkNext = $('link[rel="next"]').first().attr('href');
  if (linkNext) {
    try {
      return assertSameOriginUrl(new URL(linkNext, baseUrl).href, currentUrl);
    } catch { /* */ }
  }

  const parsed = new URL(currentUrl);
  const currentPage = parseInt(parsed.searchParams.get('page') || '1', 10);
  if (currentPage > 0) {
    const anyLink = $('a').filter((_, el) => {
      const href = $(el).attr('href') || '';
      const txt = $(el).text().toLowerCase().trim().replace(/\s+/g, ' ');
      return PAGINATION_LINK_TEXTS.some(p => txt === p || txt.includes(p));
    }).first().attr('href');

    if (anyLink) {
      try {
        return assertSameOriginUrl(new URL(anyLink, baseUrl).href, currentUrl);
      } catch { /* */ }
    }

    const nextUrl = new URL(currentUrl);
    nextUrl.searchParams.set('page', String(currentPage + 1));
    return assertSameOriginUrl(nextUrl.href, currentUrl);
  }

  const pageMatch = currentUrl.match(/\/page\/(\d+)/i);
  if (pageMatch) {
    const next = new URL(currentUrl);
    next.pathname = next.pathname.replace(/\/page\/\d+/i, `/page/${parseInt(pageMatch[1], 10) + 1}`);
    return assertSameOriginUrl(next.href, currentUrl);
  }

  const anyPaginationLink = $('a').filter((_, el) => {
    const txt = $(el).text().toLowerCase().trim().replace(/\s+/g, ' ');
    return PAGINATION_LINK_TEXTS.some(p => txt === p || txt.includes(p));
  }).first().attr('href');

  if (anyPaginationLink) {
    try {
      return assertSameOriginUrl(new URL(anyPaginationLink, baseUrl).href, currentUrl);
    } catch { /* */ }
  }

  return null;
}

export async function discoverLinks(
  listPageUrl: string,
  maxLinks: number = 30,
  maxPages: number = 5,
): Promise<DiscoveredLink[]> {
  const allLinks: DiscoveredLink[] = [];
  const seenUrls = new Set<string>();
  const seenPageUrls = new Set<string>();
  let currentUrl = listPageUrl;

  for (let page = 0; page < maxPages; page++) {
    let $: CheerioRoot;
    try {
      ({ $ } = await fetchAndParse(currentUrl));
    } catch (err) {
      if (page === 0) throw err;
      break;
    }

    const pageLinks = extractLinksFromPage($, currentUrl, currentUrl);

    for (const link of pageLinks) {
      const key = new URL(link.url).origin + new URL(link.url).pathname;
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        allLinks.push(link);
      }
    }

    const nextUrl = findNextPageUrl($, currentUrl);
    if (!nextUrl || nextUrl === currentUrl) break;

    const nextKey = new URL(nextUrl).origin + new URL(nextUrl).pathname;
    if (seenPageUrls.has(nextKey)) break;
    seenPageUrls.add(nextKey);

    currentUrl = nextUrl;
  }

  allLinks.sort((a, b) => b.score - a.score);
  return allLinks.slice(0, maxLinks);
}
