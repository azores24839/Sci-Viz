import pLimit from 'p-limit';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { prisma } from '../prisma.js';
import { deleteSavedImage, saveImageFromUrl } from '../services/image.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { assertPublicHttpUrl, readTextWithLimit } from '../utils/httpSafety.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { scoreImageCandidate } from './collectionScoring.js';

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

const MAX_IMAGES_PER_PAGE = 5;

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
  createdCaseCount: number;
  errors: string[];
}

export interface CrawlSummary {
  inputUrlCount: number;
  fetchedPageCount: number;
  failedPageCount: number;
  candidateImageCount: number;
  filteredImageCount: number;
  createdCaseCount: number;
  failedImageCount: number;
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
): Promise<CrawlPageResult> {
  const errors: string[] = [];
  let pageTitle = '';
  let candidateImageCount = 0;
  let filteredImageCount = 0;
  let createdCaseCount = 0;

  try {
    const urlCheck = await prisma.visualCase.findFirst({
      where: { sourceUrl: url },
      select: { id: true },
    });
    if (urlCheck) {
      return {
        url,
        status: 'success',
        pageTitle: 'Skipped: URL already exists',
        candidateImageCount: 0,
        filteredImageCount: 0,
        createdCaseCount: 0,
        errors: [`Skipped: sourceUrl already exists (id=${urlCheck.id})`],
      };
    }

    let parsedUrl = await assertPublicHttpUrl(url);

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };
    if (cookie?.trim()) {
      fetchHeaders['Cookie'] = cookie.trim();
    }

    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        response = await fetch(parsedUrl.href, {
          signal: controller.signal,
          redirect: 'manual',
          headers: fetchHeaders,
        });
      } catch (fetchErr) {
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
          createdCaseCount: 0,
          errors: [authMsg],
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

    const html = await readTextWithLimit(response);

    const extracted = await extractImagesFromPage(url, html);
    pageTitle = extracted.pageTitle;

    const authPageMsg = detectAuthPage(html, pageTitle);
    if (authPageMsg) {
      return {
        url,
        status: 'auth_required',
        pageTitle,
        candidateImageCount: 0,
        filteredImageCount: 0,
        createdCaseCount: 0,
        errors: [authPageMsg],
      };
    }

    candidateImageCount = extracted.images.length;

    const { valid, filteredCount } = filterImageCandidates(extracted.images);
    filteredImageCount = filteredCount;

    const combinedContext = [
      extracted.metaDescription,
      extracted.bodyText,
    ].filter(Boolean).join('\n').substring(0, 1000);

    const scoredImages = valid
      .map(img => ({
        image: img,
        score: scoreImageCandidate({
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

    const selectedImages = scoredImages
      .filter(item => item.score.shouldKeep)
      .slice(0, MAX_IMAGES_PER_PAGE);

    for (const skipped of scoredImages.filter(item => !item.score.shouldKeep)) {
      errors.push(`Low-value image skipped: ${skipped.image.src} - score ${skipped.score.score}`);
    }

    if (scoredImages.length > selectedImages.length) {
      for (const skipped of scoredImages.slice(MAX_IMAGES_PER_PAGE).filter(item => item.score.shouldKeep)) {
        errors.push(`Image skipped by per-page cap: ${skipped.image.src} - score ${skipped.score.score}`);
      }
    }

    for (const scored of selectedImages) {
      const img = scored.image;
      let imageResult;
      try {
        imageResult = await saveImageFromUrl(img.src);
      } catch (imgErr) {
        errors.push(`Image download failed: ${img.src} - ${(imgErr as Error).message}`);
        continue;
      }

      try {
        const duplicate = await findDuplicateCase(imageResult.imageHash);
        if (duplicate) {
          await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
          errors.push(`Duplicate image skipped: ${img.src} - matched ${duplicate.caseEntry.id} (${duplicate.matchType})`);
          continue;
        }

        const contextParts = [
          img.contextText,
          combinedContext,
        ].filter(Boolean).join('\n').substring(0, 1500);

        const userHint = [sourceName, sourceType].filter(Boolean).join(' / ');

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
          },
        });

        createdCaseCount++;

        runAnalysis(caseEntry.id, imageResult.imagePath, pageTitle, url, contextParts);
      } catch (createErr) {
        errors.push(`Case creation failed: ${img.src} - ${(createErr as Error).message}`);
      }
    }

    return {
      url,
      status: 'success',
      pageTitle,
      candidateImageCount,
      filteredImageCount,
      createdCaseCount,
      errors,
    };
  } catch (err) {
    return {
      url,
      status: 'failed',
      pageTitle,
      candidateImageCount,
      filteredImageCount: 0,
      createdCaseCount: 0,
      errors: [(err as Error).message],
    };
  }
}

export async function runUrlCrawl(
  urls: string[],
  sourceName?: string,
  sourceType?: string,
  cookie?: string,
): Promise<CrawlResponse> {
  const validUrls = urls
    .map(u => u.trim())
    .filter(u => u.length > 0);

  const limit = pLimit(2);

  const results = await Promise.all(
    validUrls.map(url =>
      limit(() => processSingleUrl(url, sourceName, sourceType, cookie))
    )
  );

  const authRequiredCount = results.filter(r => r.status === 'auth_required').length;

  const summary: CrawlSummary = {
    inputUrlCount: validUrls.length,
    fetchedPageCount: results.filter(r => r.status === 'success').length,
    failedPageCount: results.filter(r => r.status === 'failed').length + authRequiredCount,
    candidateImageCount: results.reduce((s, r) => s + r.candidateImageCount, 0),
    filteredImageCount: results.reduce((s, r) => s + r.filteredImageCount, 0),
    createdCaseCount: results.reduce((s, r) => s + r.createdCaseCount, 0),
    failedImageCount: results.reduce((s, r) => s + r.errors.length, 0),
  };

  return { success: true, summary, results };
}
