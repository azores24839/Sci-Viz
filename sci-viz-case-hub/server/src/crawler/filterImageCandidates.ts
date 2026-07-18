import type { ImageCandidate } from './extractImagesFromPage.js';

export function canonicalImageUrl(src: string): string {
  try {
    const url = new URL(src);
    // Image transformation CDNs (Brightspot, Next.js, etc.) often expose the
    // original asset in a `url` query parameter while changing crop/resize
    // segments in the outer URL. Treat those variants as one source image.
    const embeddedUrl = url.searchParams.get('url');
    if (embeddedUrl) {
      try {
        const resolvedEmbeddedUrl = new URL(embeddedUrl, url.origin).href;
        if (resolvedEmbeddedUrl !== url.href) return canonicalImageUrl(resolvedEmbeddedUrl);
      } catch {
        // Keep the outer URL when the embedded value is malformed.
      }
    }
    // Remove only format negotiation flags. Keep identity/crop/size params:
    // e.g. Next.js uses one /_next/image pathname for many different images.
    for (const key of ['webp', 'format', 'fm', 'quality', 'q']) {
      url.searchParams.delete(key);
    }
    url.hash = '';
    return url.href;
  } catch {
    return src.split('#')[0];
  }
}

export interface FilterResult {
  valid: ImageCandidate[];
  filteredCount: number;
  reasonCounts: FilterReasonCounts;
}

export interface FilterReasonCounts {
  missingSourceCount: number;
  inlineDataCount: number;
  unsupportedFormatCount: number;
  tooSmallCount: number;
  duplicateUrlCount: number;
}

export function emptyFilterReasonCounts(): FilterReasonCounts {
  return {
    missingSourceCount: 0,
    inlineDataCount: 0,
    unsupportedFormatCount: 0,
    tooSmallCount: 0,
    duplicateUrlCount: 0,
  };
}

export function filterImageCandidates(images: ImageCandidate[]): FilterResult {
  const seen = new Set<string>();
  const valid: ImageCandidate[] = [];
  let filteredCount = 0;
  const reasonCounts = emptyFilterReasonCounts();

  for (const img of images) {
    if (!img.src) {
      filteredCount++;
      reasonCounts.missingSourceCount++;
      continue;
    }

    if (img.src.startsWith('data:')) {
      filteredCount++;
      reasonCounts.inlineDataCount++;
      continue;
    }

    const pathname = img.src.split('?')[0].toLowerCase();
    if (pathname.endsWith('.svg') || pathname.endsWith('.ico')) {
      filteredCount++;
      reasonCounts.unsupportedFormatCount++;
      continue;
    }

    if (img.width !== null && img.height !== null) {
      const area = img.width * img.height;
      // Survey mode keeps narrow banners and useful thumbnails. Only reject
      // assets that are genuinely tiny in both dimensions or total area.
      if ((img.width < 96 && img.height < 96) || area < 8_000) {
        filteredCount++;
        reasonCounts.tooSmallCount++;
        continue;
      }
    }

    const canonicalSrc = canonicalImageUrl(img.src);
    if (seen.has(canonicalSrc)) {
      filteredCount++;
      reasonCounts.duplicateUrlCount++;
      continue;
    }
    seen.add(canonicalSrc);

    valid.push(img);
  }

  return { valid, filteredCount, reasonCounts };
}
