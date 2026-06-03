import type { ImageCandidate } from './extractImagesFromPage.js';

const SKIP_PATTERNS = [
  'logo', 'icon', 'avatar', 'sprite', 'favicon',
  'ads', 'banner-ad', 'tracking', 'pixel',
];

function isSkipPattern(text: string, pattern: string): boolean {
  const idx = text.indexOf(pattern);
  if (idx === -1) return false;
  const before = idx > 0 ? text[idx - 1] : '/';
  const after = (idx + pattern.length < text.length) ? text[idx + pattern.length] : '/';
  return /[\/._\-\s]/.test(before) && /[\/._\-\s]/.test(after);
}

export interface FilterResult {
  valid: ImageCandidate[];
  filteredCount: number;
}

export function filterImageCandidates(images: ImageCandidate[]): FilterResult {
  const seen = new Set<string>();
  const valid: ImageCandidate[] = [];
  let filteredCount = 0;

  for (const img of images) {
    if (!img.src) {
      filteredCount++;
      continue;
    }

    if (img.src.startsWith('data:')) {
      filteredCount++;
      continue;
    }

    const pathname = img.src.split('?')[0].toLowerCase();
    if (pathname.endsWith('.svg') || pathname.endsWith('.ico')) {
      filteredCount++;
      continue;
    }

    const urlLower = img.src.toLowerCase();
    const filename = pathname.split('/').pop() || '';
    if (SKIP_PATTERNS.some(p => isSkipPattern(urlLower, p) || isSkipPattern(filename, p))) {
      filteredCount++;
      continue;
    }

    if (img.width !== null && img.height !== null) {
      if (img.width < 300 || img.height < 300) {
        filteredCount++;
        continue;
      }
    }

    if (seen.has(img.src)) {
      filteredCount++;
      continue;
    }
    seen.add(img.src);

    valid.push(img);
  }

  return { valid, filteredCount };
}
