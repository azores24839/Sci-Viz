import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { getStaticSourceAdapter } from './staticSourceAdapters.js';
type CheerioRoot = ReturnType<typeof cheerio.load>;

const PLACEHOLDER_PATTERNS = [
  'placeholder', '1x1.gif', 'pixel.gif', 'blank.gif', 'empty.gif',
  'data:image/gif;base64',
];

export interface ImageCandidate {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  contextText: string;
  sizeUnknown: boolean;
}

export interface ExtractedPage {
  pageTitle: string;
  metaDescription: string;
  bodyText: string;
  images: ImageCandidate[];
}

function extractContext($: CheerioRoot, el: Element, pageTitle: string, contentSelectors: string[]): string {
  const $el = $(el);
  const alt = $el.attr('alt') || '';
  let contextParts: string[] = [];

  if (alt) contextParts.push(alt);

  const parent = $el.parent();
  const figure = parent.closest('figure');
  if (figure.length) {
    const caption = figure.find('figcaption').first().text().replace(/\s+/g, ' ').trim();
    if (caption) contextParts.push(caption);
  }

  if (pageTitle && contextParts.length === 0) {
    contextParts.push(pageTitle);
  }

  for (const selector of contentSelectors) {
    const contentArea = $(selector);
    if (!contentArea.length) continue;

    const section = $el.closest('p, div, section');
    if (section.length) {
      const prevP = section.prevAll('p').first().text().replace(/\s+/g, ' ').trim();
      if (prevP && prevP.length > 20) {
        contextParts.push(prevP.substring(0, 200));
      }
      const nextP = section.nextAll('p').first().text().replace(/\s+/g, ' ').trim();
      if (nextP && nextP.length > 20) {
        contextParts.push(nextP.substring(0, 200));
      }
    }

    const nearestP = $el.closest('p').text().replace(/\s+/g, ' ').trim();
    if (nearestP && nearestP.length > 20 && !contextParts.includes(nearestP)) {
      contextParts.push(nearestP.substring(0, 200));
    }
    break;
  }

  if (contextParts.length === 0) {
    const parentText = parent.text().replace(/\s+/g, ' ').trim().substring(0, 300);
    if (parentText) contextParts.push(parentText);
  }

  return contextParts.join(' | ').substring(0, 800);
}

function parseSrcset(srcset: string): Array<{ url: string; width: number }> {
  return srcset.split(', ')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const parts = entry.split(/\s+/);
      const desc = parts[parts.length - 1];
      const url = parts.length >= 2 ? parts.slice(0, -1).join(' ') : parts[0];
      if (!url) return null;
      let width = 0;
      if (desc && desc !== url) {
        if (desc.endsWith('w')) {
          width = parseInt(desc.replace('w', ''), 10);
        } else if (desc.endsWith('x')) {
          width = Math.round(parseFloat(desc.replace('x', '')) * 300);
        }
      }
      return { url, width: isNaN(width) ? 0 : width };
    })
    .filter((item): item is NonNullable<typeof item> =>
      item !== null && item.url.length > 0
    );
}

function pickLargestSrcsetUrl(srcset: string): string {
  const parsed = parseSrcset(srcset);
  const largest = parsed.sort((a, b) => b.width - a.width)[0];
  return largest?.url || '';
}

function isPlaceholder(src: string): boolean {
  const lower = src.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(p => lower.includes(p));
}

function imageUrlFromResponsiveJson(rawSrc: string): string {
  const trimmed = rawSrc.trim();
  if (!trimmed.startsWith('{')) return rawSrc;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, string>;
    return parsed.max
      || parsed.xxlarge
      || parsed.xlarge
      || parsed.large
      || parsed.medium
      || parsed.small
      || rawSrc;
  } catch {
    return rawSrc;
  }
}

export async function extractImagesFromPage(url: string, html: string): Promise<ExtractedPage> {
  const $ = cheerio.load(html);
  const adapter = getStaticSourceAdapter(url);
  const contentSelectors = adapter?.contentSelectors || ['article', 'main', 'body'];

  const pageTitle = (adapter?.titleSelectors || ['h1', 'title'])
    .map(selector => $(selector).first().text().replace(/\s+/g, ' ').trim())
    .find(Boolean) || $('title').first().text().trim();
  const metaDescription = $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || '';

  const $bodyClone = $('body').clone();
  $bodyClone.find('script, style, noscript, iframe, svg').remove();
  for (const selector of adapter?.excludeSelectors || []) {
    $bodyClone.find(selector).remove();
  }
  const bodyText = $bodyClone.text().replace(/\s+/g, ' ').trim().substring(0, 1000);

  const baseUrl = $('base[href]').first().attr('href') || url;

  const images: ImageCandidate[] = [];
  const seenUrls = new Set<string>();

  function addCandidate(rawSrc: string, alt: string, width: number | null, height: number | null, contextText: string) {
    if (!rawSrc) return;
    let src = imageUrlFromResponsiveJson(rawSrc);
    try {
      src = new URL(src, baseUrl).href;
    } catch {
      return;
    }
    if (seenUrls.has(src)) return;
    seenUrls.add(src);
    const sizeUnknown = width === null && height === null;
    images.push({ src, alt, width, height, contextText, sizeUnknown });
  }

  const metaImage = $('meta[property="og:image"]').attr('content')
    || $('meta[name="twitter:image"]').attr('content')
    || '';
  if (metaImage) {
    addCandidate(metaImage, pageTitle, null, null, [pageTitle, metaDescription].filter(Boolean).join(' | ').substring(0, 500));
  }

  const roots = adapter?.contentSelectors?.length
    ? adapter.contentSelectors.map(selector => $(selector)).filter(root => root.length > 0)
    : [$('body')];
  const $scope = roots[0] || $('body');

  for (const selector of adapter?.excludeSelectors || []) {
    $scope.find(selector).remove();
  }

  const imageSelector = adapter?.imageSelectors?.join(', ') || 'img';
  const isScoped = !$scope.is('body');

  $scope.find('picture source[srcset], picture source[data-srcset]').each((_, el) => {
    const $el = $(el);
    const src = pickLargestSrcsetUrl($el.attr('srcset') || $el.attr('data-srcset') || '');
    if (!src) return;
    const picture = $el.closest('picture');
    const img = picture.find('img').first();
    const alt = img.attr('alt') || pageTitle;
    addCandidate(src, alt, null, null, extractContext($, el, pageTitle, contentSelectors));
  });

  $scope.find(isScoped ? `img, figure img, ${imageSelector}` : imageSelector).each((_, el) => {
    const $el = $(el);

    let src = $el.attr('src') || '';
    const dataSrc = $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original') || '';

    if (dataSrc && (!src || isPlaceholder(src))) {
      src = dataSrc;
    }

    const alt = $el.attr('alt') || '';

    const attrWidth = $el.attr('width');
    const attrHeight = $el.attr('height');
    let width: number | null = attrWidth ? parseInt(attrWidth, 10) : null;
    let height: number | null = attrHeight ? parseInt(attrHeight, 10) : null;

    const srcset = $el.attr('srcset') || $el.attr('data-srcset') || '';
    if (srcset) {
      const parsed = parseSrcset(srcset);
      const largest = parsed.sort((a, b) => b.width - a.width)[0];
      if (largest && largest.width > 0) {
        try {
          src = largest.url;
          if (width === null) width = largest.width;
          if (height === null && width !== null) height = Math.round(width * 0.667);
        } catch {
        }
      }
    }

    const contextText = extractContext($, el, pageTitle, contentSelectors);
    addCandidate(src, alt, width, height, contextText);
  });

  return { pageTitle, metaDescription, bodyText, images };
}
