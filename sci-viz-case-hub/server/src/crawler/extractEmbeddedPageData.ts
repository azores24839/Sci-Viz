import * as cheerio from 'cheerio';

const RASTER_IMAGE_PATH = /\.(?:jpe?g|png|gif|webp|avif)(?:[?#].*)?$/i;
const PAGE_PATH = /(?:\/page\.(?:htm|html|psp)|\/(?:list|main)(?:\d*)?\.(?:htm|html|psp)|\/$)/i;
const MAX_SCRIPT_TEXT = 1_000_000;
const MAX_VALUE_LENGTH = 4_096;

function decodeScriptString(value: string): string {
  return value
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\x2[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\([\\"'])/g, '$1')
    .replace(/&amp;/g, '&')
    .trim();
}

function inlineScriptTexts(html: string): string[] {
  const $ = cheerio.load(html);
  const scripts: string[] = [];
  $('script:not([src])').each((_, element) => {
    const text = $(element).html() || '';
    if (text && text.length <= MAX_SCRIPT_TEXT) scripts.push(text);
  });
  return scripts;
}

function absoluteHttpUrl(rawValue: string, baseUrl: string): string | null {
  const value = decodeScriptString(rawValue);
  if (!value || value.length > MAX_VALUE_LENGTH || value.startsWith('data:')) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Some CMS/SPA shells serialize their visible cards into inline JavaScript and
 * render the real <img> nodes later. Read only quoted raster URLs; never execute
 * the source page's JavaScript.
 */
export function extractEmbeddedImageUrls(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const quotedValue = /(["'])([^"'\r\n]*?)\1/g;

  for (const script of inlineScriptTexts(html)) {
    for (const match of script.matchAll(quotedValue)) {
      const value = decodeScriptString(match[2]);
      if (!RASTER_IMAGE_PATH.test(value)) continue;
      const absolute = absoluteHttpUrl(value, baseUrl);
      if (absolute) found.add(absolute);
    }
  }
  return [...found];
}

/** Recover navigable page URLs from href/url/link fields in serialized CMS data. */
export function extractEmbeddedPageLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  const propertyValue = /(?:^|[,\s{])(?:href|url|link)\s*:\s*(["'])(.*?)\1/gis;
  const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase();

  for (const script of inlineScriptTexts(html)) {
    for (const match of script.matchAll(propertyValue)) {
      const absolute = absoluteHttpUrl(match[2], baseUrl);
      if (!absolute) continue;
      const url = new URL(absolute);
      if (url.hostname.replace(/^www\./, '').toLowerCase() !== baseHost) continue;
      if (RASTER_IMAGE_PATH.test(url.pathname) || !PAGE_PATH.test(url.pathname)) continue;
      found.add(absolute);
    }
  }
  return [...found];
}
