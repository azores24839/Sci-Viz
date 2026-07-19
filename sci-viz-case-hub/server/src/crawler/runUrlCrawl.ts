import pLimit from 'p-limit';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import {
  canonicalImageUrl,
  emptyFilterReasonCounts,
  filterImageCandidates,
  type FilterReasonCounts,
} from './filterImageCandidates.js';
import { prisma } from '../prisma.js';
import { deleteSavedImage, saveImageFromUrl } from '../services/image.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { assertPublicHttpUrl, readTextWithLimit } from '../utils/httpSafety.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { scoreSurveyImage } from './collectionScoring.js';
import {
  createBrowserPageRenderer,
  shouldUseBrowserRendering,
  type BrowserPageRenderer,
} from './browserPageRenderer.js';

const AUTH_DOMAINS = [
  'idp.', 'login.', 'auth.', 'sso.', 'account.', 'signin.', 'sign-in.',
  'cas.', 'oauth.', 'saml.', 'authenticate.',
];

const AUTH_KEYWORDS = [
  'sign in', 'sign in', 'log in', 'login',
  'access through', 'institutional access',
  'please log in', 'sign in to access',
  'your session has expired',
];

const AUTH_PAGE_TITLES = [
  'sign in', 'log in', 'login', 'authentication',
  'authorization', 'access denied',
];

const AUTH_URL_PARAMS = [
  'error=cookies_not_supported',
  'error=session_expired',
  'error=access_denied',
  'redirect_uri=',
  'response_type=cookie',
];

const MAX_IMAGES_PER_PAGE = 100;

interface CrawlDedupContext {
  imageKeys: Set<string>;
  imageHashes: Set<string>;
}

function createCrawlDedupContext(): CrawlDedupContext {
  return { imageKeys: new Set<string>(), imageHashes: new Set<string>() };
}

export type CrawlImageOutcome = 'created' | 'duplicate' | 'filtered' | 'capped' | 'failed';

export type CrawlProgressEvent =
  | { type: 'page_started'; url: string }
  | { type: 'page_scanned'; url: string; candidateImageCount: number }
  | { type: 'images_processed'; url: string; count: number; outcome: CrawlImageOutcome }
  | { type: 'page_completed'; url: string; result: CrawlPageResult };

export interface RunUrlCrawlOptions {
  signal?: AbortSignal;
  onProgress?: (event: CrawlProgressEvent) => void;
  /** Maximum number of new cases to create for one task. */
  maxCreatedCases?: number;
  /** Allows batch collection to defer AI analysis until images are safely in the case library. */
  enqueueAnalysis?: boolean;
}

interface CrawlCaseBudget {
  limit: number;
  remaining: number;
  tryReserve: () => boolean;
  release: () => void;
}

function createCaseBudget(limit?: number): CrawlCaseBudget | undefined {
  if (!Number.isFinite(limit) || !limit || limit < 1) return undefined;
  let remaining = Math.floor(limit);
  return {
    limit: remaining,
    get remaining() { return remaining; },
    tryReserve() {
      if (remaining < 1) return false;
      remaining -= 1;
      return true;
    },
    release() { remaining += 1; },
  };
}

interface ProcessSingleUrlOptions extends RunUrlCrawlOptions {
  dedupContext?: CrawlDedupContext;
  browserRenderer?: BrowserPageRenderer;
  caseBudget?: CrawlCaseBudget;
}

export class CrawlCancelledError extends Error {
  constructor() {
    super('Crawl cancelled');
    this.name = 'CrawlCancelledError';
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new CrawlCancelledError();
}

function reportProgress(options: RunUrlCrawlOptions, event: CrawlProgressEvent) {
  try {
    options.onProgress?.(event);
  } catch (error) {
    console.warn('[url-crawl] Progress observer failed:', error);
  }
}

function detectAuthRedirect(originalUrl: string, finalUrl: string): string | null {
  if (originalUrl === finalUrl) return null;
  try {
    const original = new URL(originalUrl);
    const final = new URL(finalUrl);
    if (original.hostname !== final.hostname) {
      for (const domain of AUTH_DOMAINS) {
        if (final.hostname.includes(domain)) {
          return `Redirected to authentication page (${final.hostname})`;
        }
      }
    }
    const searchLower = final.search.toLowerCase();
    for (const param of AUTH_URL_PARAMS) {
      if (searchLower.includes(param)) {
        return `Page requires authentication or cookies (detected: "${param}")`;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function detectAuthPage(html: string, pageTitle: string): string | null {
  const lowerHtml = html.toLowerCase().substring(0, 5000);
  const lowerTitle = pageTitle.toLowerCase();

  for (const title of AUTH_PAGE_TITLES) {
    if (lowerTitle.includes(title)) {
      return `Page appears to require authentication (title: "${pageTitle}")`;
    }
  }

  let keywordCount = 0;
  for (const keyword of AUTH_KEYWORDS) {
    if (lowerHtml.includes(keyword)) {
      keywordCount++;
    }
  }
  if (keywordCount >= 3) {
    return `Page requires authentication (detected ${keywordCount} login-related signals)`;
  }

  return null;
}

export interface CrawlPageResult {
  url: string;
  status: 'success' | 'failed' | 'auth_required';
  pageTitle: string;
  candidateImageCount: number;
  filteredImageCount: number;
  filterReasons: FilterReasonCounts;
  createdCaseCount: number;
  duplicateImageCount: number;
  cappedImageCount: number;
  failedImageCount: number;
  createdCases: CrawlCreatedCase[];
  errors: string[];
  notices: string[];
}

export interface CrawlCreatedCase {
  id: string;
  pageTitle: string;
  sourceUrl: string;
  imageUrl: string;
  imagePath: string;
  thumbnailPath: string;
}

export interface CrawlSummary {
  inputUrlCount: number;
  fetchedPageCount: number;
  failedPageCount: number;
  candidateImageCount: number;
  filteredImageCount: number;
  filterReasons: FilterReasonCounts;
  createdCaseCount: number;
  duplicateImageCount: number;
  cappedImageCount: number;
  failedImageCount: number;
  caseLimit: number | null;
  reachedCaseLimit: boolean;
  unprocessedPageCount: number;
}

export interface CrawlResponse {
  success: boolean;
  summary: CrawlSummary;
  results: CrawlPageResult[];
}

export async function processSingleUrl(
  url: string,
  sourceName?: string,
  sourceType?: string,
  cookie?: string,
  options: ProcessSingleUrlOptions = {},
): Promise<CrawlPageResult> {
  throwIfCancelled(options.signal);
  const errors: string[] = [];
  const notices: string[] = [];
  let pageTitle = '';
  let candidateImageCount = 0;
  let filteredImageCount = 0;
  const filterReasons = emptyFilterReasonCounts();
  let createdCaseCount = 0;
  let duplicateImageCount = 0;
  let cappedImageCount = 0;
  let failedImageCount = 0;
  const createdCases: CrawlCreatedCase[] = [];

  try {
    let parsedUrl = await assertPublicHttpUrl(url);
    const cookieOrigin = parsedUrl.origin;

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        throwIfCancelled(options.signal);
        const fetchSignal = options.signal
          ? AbortSignal.any([options.signal, controller.signal])
          : controller.signal;
        response = await fetch(parsedUrl.href, {
          signal: fetchSignal,
          redirect: 'manual',
          headers: {
            ...fetchHeaders,
            ...(cookie?.trim() && parsedUrl.origin === cookieOrigin ? { Cookie: cookie.trim() } : {}),
          },
        });
      } catch (fetchErr) {
        throwIfCancelled(options.signal);
        throw new Error(`Page request failed: ${(fetchErr as Error).message}`);
      } finally {
        clearTimeout(timeout);
      }

      if (response.status < 300 || response.status >= 400) break;

      const location = response.headers.get('location') || '';
      if (!location) {
        throw new Error(`Page redirected (HTTP ${response.status}) without a Location header`);
      }

      const redirectUrl = new URL(location, parsedUrl.href);
      const authMsg = detectAuthRedirect(url, redirectUrl.href);
      if (authMsg) {
        return {
          url,
          status: 'auth_required',
          pageTitle,
          candidateImageCount: 0,
          filteredImageCount: 0,
          filterReasons,
          createdCaseCount: 0,
          duplicateImageCount: 0,
          cappedImageCount: 0,
          failedImageCount: 0,
          createdCases,
          errors: [authMsg],
          notices: [],
        };
      }
      parsedUrl = await assertPublicHttpUrl(redirectUrl.href);
    }

    if (!response) {
      throw new Error('Page request failed: no response');
    }

    if (response.status >= 300 && response.status < 400) {
      throw new Error(`Page redirected too many times (last status ${response.status})`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(`Page requires authentication or is blocked (HTTP ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(`Page request failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    let html = await readTextWithLimit(response);

    let extracted = await extractImagesFromPage(parsedUrl.href, html, { mode: 'survey' });
    pageTitle = extracted.pageTitle;

    const authPageMsg = detectAuthPage(html, pageTitle);
    if (authPageMsg) {
      return {
        url,
        status: 'auth_required',
        pageTitle,
        candidateImageCount: 0,
        filteredImageCount: 0,
        filterReasons,
        createdCaseCount: 0,
        duplicateImageCount: 0,
        cappedImageCount: 0,
        failedImageCount: 0,
        createdCases,
        errors: [authPageMsg],
        notices: [],
      };
    }

    const staticFiltered = filterImageCandidates(extracted.images);
    if (options.browserRenderer
      && shouldUseBrowserRendering(html, staticFiltered.valid.length, extracted.embeddedImageCount)) {
      try {
        const rendered = await options.browserRenderer.render(parsedUrl.href, {
          cookie,
          signal: options.signal,
        });
        const authRedirectMsg = detectAuthRedirect(url, rendered.finalUrl);
        if (authRedirectMsg) {
          return {
            url,
            status: 'auth_required',
            pageTitle,
            candidateImageCount: 0,
            filteredImageCount: 0,
            filterReasons,
            createdCaseCount: 0,
            duplicateImageCount: 0,
            cappedImageCount: 0,
            failedImageCount: 0,
            createdCases,
            errors: [authRedirectMsg],
            notices,
          };
        }
        parsedUrl = await assertPublicHttpUrl(rendered.finalUrl);
        html = rendered.html;
        extracted = await extractImagesFromPage(parsedUrl.href, html, { mode: 'survey' });
        pageTitle = extracted.pageTitle || rendered.title;
        const renderedAuthPageMsg = detectAuthPage(html, pageTitle);
        if (renderedAuthPageMsg) throw new Error(renderedAuthPageMsg);
        notices.push('已自动使用浏览器渲染动态页面');
      } catch (error) {
        if (options.signal?.aborted) throw new CrawlCancelledError();
        notices.push(`动态渲染不可用，已保留静态扫描结果：${(error as Error).message}`);
      }
    }

    candidateImageCount = extracted.images.length;
    reportProgress(options, { type: 'page_scanned', url, candidateImageCount });

    const { valid, filteredCount, reasonCounts } = filterImageCandidates(extracted.images);
    filteredImageCount = filteredCount;
    Object.assign(filterReasons, reasonCounts);

    const taskUniqueImages = valid.filter(image => {
      if (!options.dedupContext) return true;
      const key = canonicalImageUrl(image.src);
      if (options.dedupContext.imageKeys.has(key)) {
        duplicateImageCount++;
        notices.push(`Cross-page duplicate skipped: ${image.src}`);
        return false;
      }
      options.dedupContext.imageKeys.add(key);
      return true;
    });
    if (filteredCount > 0) reportProgress(options, { type: 'images_processed', url, count: filteredCount, outcome: 'filtered' });
    if (duplicateImageCount > 0) reportProgress(options, { type: 'images_processed', url, count: duplicateImageCount, outcome: 'duplicate' });

    const combinedContext = [
      extracted.metaDescription,
      extracted.bodyText,
    ].filter(Boolean).join('\n').substring(0, 1000);

    const scoredImages = taskUniqueImages
      .map(img => ({
        image: img,
        score: scoreSurveyImage({
          image: img,
          pageTitle,
          pageUrl: parsedUrl.href,
          sourceName,
          sourceType,
          metaDescription: extracted.metaDescription,
          bodyText: extracted.bodyText,
        }),
      }))
      .sort((a, b) => b.score.score - a.score.score);

    const selectedImages = scoredImages.slice(0, MAX_IMAGES_PER_PAGE);

    if (scoredImages.length > selectedImages.length) {
      cappedImageCount = scoredImages.length - selectedImages.length;
      reportProgress(options, { type: 'images_processed', url, count: cappedImageCount, outcome: 'capped' });
      for (const skipped of scoredImages.slice(MAX_IMAGES_PER_PAGE)) {
        notices.push(`Safety cap skipped: ${skipped.image.src}`);
      }
    }

    for (const scored of selectedImages) {
      throwIfCancelled(options.signal);
      if (options.caseBudget?.remaining === 0) {
        const skipped = selectedImages.length - selectedImages.indexOf(scored);
        cappedImageCount += skipped;
        notices.push(`Reached task image limit (${options.caseBudget.limit}); remaining images on this page were not collected.`);
        reportProgress(options, { type: 'images_processed', url, count: skipped, outcome: 'capped' });
        break;
      }
      const img = scored.image;
      let imageResult;
      try {
        imageResult = await saveImageFromUrl(img.src, options.signal);
      } catch (imgErr) {
        throwIfCancelled(options.signal);
        const message = (imgErr as Error).message;
        if (/unsupported image (type|format)|not an image|invalid or unsafe image data|could not determine image dimensions/i.test(message)) {
          filteredImageCount++;
          filterReasons.unsupportedFormatCount++;
          notices.push(`Unsupported image format skipped: ${img.src}`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'filtered' });
          continue;
        }
        if (/image (dimensions )?too small/i.test(message)) {
          filteredImageCount++;
          filterReasons.tooSmallCount++;
          notices.push(`Tiny image skipped: ${img.src}`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'filtered' });
          continue;
        }
        if (/image (dimensions )?too large|response too large/i.test(message)) {
          cappedImageCount++;
          notices.push(`Image safety limit skipped: ${img.src}`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'capped' });
          continue;
        }
        if (/failed to fetch image: HTTP (400|404|410)\b/i.test(message)) {
          filteredImageCount++;
          filterReasons.missingSourceCount++;
          notices.push(`Invalid or expired image URL skipped: ${img.src}`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'filtered' });
          continue;
        }
        failedImageCount++;
        errors.push(`Image download failed: ${img.src} - ${message}`);
        reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'failed' });
        continue;
      }

      let budgetReserved = false;
      try {
        if (options.dedupContext?.imageHashes.has(imageResult.imageHash)) {
          duplicateImageCount++;
          await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
          notices.push(`Concurrent duplicate image skipped: ${img.src}`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'duplicate' });
          continue;
        }
        options.dedupContext?.imageHashes.add(imageResult.imageHash);

        const duplicate = await findDuplicateCase(imageResult.imageHash);
        if (duplicate) {
          duplicateImageCount++;
          await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
          notices.push(`Duplicate image skipped: ${img.src} - matched ${duplicate.caseEntry?.id ?? 'deleted-image'} (${duplicate.matchType})`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'duplicate' });
          continue;
        }

        if (!options.caseBudget?.tryReserve() && options.caseBudget) {
          cappedImageCount++;
          await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
          notices.push(`Task image limit (${options.caseBudget.limit}) reached: ${img.src}`);
          reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'capped' });
          continue;
        }
        budgetReserved = Boolean(options.caseBudget);

        const contextParts = [
          img.contextText,
          combinedContext,
        ].filter(Boolean).join('\n').substring(0, 1500);

        const userHint = [sourceName, sourceType].filter(Boolean).join(' / ');

        const isAnimatedGif = /\.gif(\?|$)/i.test(img.src);
        const initialDistributionMedium = isAnimatedGif ? '动图' : undefined;

        const caseEntry = await prisma.visualCase.create({
          data: {
            sourceUrl: parsedUrl.href,
            sourceDomain: parsedUrl.hostname,
            pageTitle,
            imageUrl: img.src,
            imagePath: imageResult.imagePath,
            thumbnailPath: imageResult.thumbnailPath,
            imageHash: imageResult.imageHash,
            contextText: contextParts,
            captureType: 'crawler',
            userHint,
            collectionScore: scored.score.score,
            collectionReasons: JSON.stringify(scored.score.reasons),
            reviewStatus: 'pending_ai_analysis',
            distributionMedium: initialDistributionMedium,
          },
        });

        createdCaseCount++;
        budgetReserved = false;
        createdCases.push({
          id: caseEntry.id,
          pageTitle,
          sourceUrl: parsedUrl.href,
          imageUrl: img.src,
          imagePath: imageResult.imagePath,
          thumbnailPath: imageResult.thumbnailPath,
        });
        reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'created' });

        if (options.enqueueAnalysis !== false) {
          runAnalysis(caseEntry.id, imageResult.imagePath, pageTitle, url, contextParts);
        }
      } catch (createErr) {
        if (options.caseBudget && budgetReserved) options.caseBudget.release();
        options.dedupContext?.imageHashes.delete(imageResult.imageHash);
        failedImageCount++;
        errors.push(`Case creation failed: ${img.src} - ${(createErr as Error).message}`);
        reportProgress(options, { type: 'images_processed', url, count: 1, outcome: 'failed' });
      }
    }

    return {
      url,
      status: 'success',
      pageTitle,
      candidateImageCount,
      filteredImageCount,
      filterReasons,
      createdCaseCount,
      duplicateImageCount,
      cappedImageCount,
      failedImageCount,
      createdCases,
      errors,
      notices,
    };
  } catch (err) {
    if (err instanceof CrawlCancelledError || options.signal?.aborted) throw new CrawlCancelledError();
    return {
      url,
      status: 'failed',
      pageTitle,
      candidateImageCount,
      filteredImageCount,
      filterReasons,
      createdCaseCount,
      duplicateImageCount,
      cappedImageCount,
      failedImageCount,
      createdCases,
      errors: [(err as Error).message],
      notices,
    };
  }
}

export async function runUrlCrawl(
  urls: string[],
  sourceName?: string,
  sourceType?: string,
  cookie?: string,
  options: RunUrlCrawlOptions = {},
): Promise<CrawlResponse> {
  const validUrls = urls
    .map(u => u.trim())
    .filter(u => u.length > 0);

  const limit = pLimit(2);
  const dedupContext = createCrawlDedupContext();
  const browserRenderer = createBrowserPageRenderer();
  const caseBudget = createCaseBudget(options.maxCreatedCases);

  let results: CrawlPageResult[];
  try {
    const collected: CrawlPageResult[] = [];
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < validUrls.length && caseBudget?.remaining !== 0) {
        const url = validUrls[nextIndex++];
        const result = await limit(async () => {
          throwIfCancelled(options.signal);
          reportProgress(options, { type: 'page_started', url });
          const pageResult = await processSingleUrl(url, sourceName, sourceType, cookie, {
            ...options,
            dedupContext,
            browserRenderer,
            caseBudget,
          });
          reportProgress(options, { type: 'page_completed', url, result: pageResult });
          return pageResult;
        });
        collected.push(result);
      }
    };
    await Promise.all([worker(), worker()]);
    results = collected;
  } finally {
    await browserRenderer.close();
  }

  const authRequiredCount = results.filter(r => r.status === 'auth_required').length;

  const summary: CrawlSummary = {
    inputUrlCount: validUrls.length,
    fetchedPageCount: results.filter(r => r.status === 'success').length,
    failedPageCount: results.filter(r => r.status === 'failed').length + authRequiredCount,
    candidateImageCount: results.reduce((s, r) => s + r.candidateImageCount, 0),
    filteredImageCount: results.reduce((s, r) => s + r.filteredImageCount, 0),
    filterReasons: results.reduce<FilterReasonCounts>((totals, result) => ({
      missingSourceCount: totals.missingSourceCount + result.filterReasons.missingSourceCount,
      inlineDataCount: totals.inlineDataCount + result.filterReasons.inlineDataCount,
      unsupportedFormatCount: totals.unsupportedFormatCount + result.filterReasons.unsupportedFormatCount,
      tooSmallCount: totals.tooSmallCount + result.filterReasons.tooSmallCount,
      duplicateUrlCount: totals.duplicateUrlCount + result.filterReasons.duplicateUrlCount,
    }), emptyFilterReasonCounts()),
    createdCaseCount: results.reduce((s, r) => s + r.createdCaseCount, 0),
    duplicateImageCount: results.reduce((s, r) => s + r.duplicateImageCount, 0),
    cappedImageCount: results.reduce((s, r) => s + r.cappedImageCount, 0),
    failedImageCount: results.reduce((s, r) => s + r.failedImageCount, 0),
    caseLimit: caseBudget?.limit ?? null,
    reachedCaseLimit: Boolean(caseBudget && caseBudget.remaining === 0),
    unprocessedPageCount: validUrls.length - results.length,
  };

  return { success: true, summary, results };
}
