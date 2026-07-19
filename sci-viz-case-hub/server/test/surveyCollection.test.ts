import assert from 'node:assert/strict';
import test from 'node:test';
import { extractImagesFromPage, type ImageCandidate } from '../src/crawler/extractImagesFromPage.js';
import { canonicalImageUrl, filterImageCandidates } from '../src/crawler/filterImageCandidates.js';
import { scoreSurveyImage } from '../src/crawler/collectionScoring.js';

function image(src: string, width: number | null, height: number | null): ImageCandidate {
  return { src, width, height, alt: '', contextText: '', sizeUnknown: width === null || height === null };
}

test('survey mode keeps banners, profiles, adverts, and images without text', () => {
  const candidates = [
    image('https://example.com/banner/profile-award-social-logo-icon-advert.jpg', 1920, 200),
  ];
  const result = filterImageCandidates(candidates);
  assert.equal(result.valid.length, 1);

  const score = scoreSurveyImage({
    image: result.valid[0],
    pageTitle: 'Award ceremony',
    pageUrl: 'https://example.com/',
  });
  assert.equal(score.shouldKeep, true);
});

test('survey mode filters only genuinely tiny raster assets', () => {
  const result = filterImageCandidates([
    image('https://example.com/tracker-photo.jpg', 1, 1),
    image('https://example.com/useful-narrow-photo.jpg', 1200, 60),
    image('https://example.com/regular-photo.jpg', 500, 500),
  ]);
  assert.deepEqual(result.valid.map(item => item.src), [
    'https://example.com/useful-narrow-photo.jpg',
    'https://example.com/regular-photo.jpg',
  ]);
  assert.equal(result.reasonCounts.tooSmallCount, 1);
});

test('format-only query variants deduplicate without merging distinct Next.js images', () => {
  const result = filterImageCandidates([
    image('https://example.com/photo.jpg?webp', 1000, 800),
    image('https://example.com/photo.jpg', 1000, 800),
    image('https://example.com/_next/image?url=%2Fa.jpg&w=1200&q=80', 1200, 800),
    image('https://example.com/_next/image?url=%2Fb.jpg&w=1200&q=80', 1200, 800),
  ]);
  assert.equal(result.valid.length, 3);
  assert.equal(result.filteredCount, 1);
  assert.equal(result.reasonCounts.duplicateUrlCount, 1);
});

test('canonical image URLs support cross-page preview deduplication', () => {
  const seen = new Set<string>();
  const pageImages = [
    'https://cdn.example.com/shared-logo.png?fm=webp&q=80',
    'https://cdn.example.com/article-figure.jpg',
    'https://cdn.example.com/shared-logo.png',
  ];
  const unique = pageImages.filter(src => {
    const key = canonicalImageUrl(src);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  assert.deepEqual(unique, pageImages.slice(0, 2));
});

test('transformed CDN URLs deduplicate by their embedded original asset', () => {
  const original = 'https%3A%2F%2Forigin.example.com%2Fimages%2Fscientist.png';
  const small = `https://cdn.example.com/dims/crop/resize/384x384/?url=${original}`;
  const large = `https://cdn.example.com/dims/crop/resize/1440x810/?url=${original}`;

  assert.equal(canonicalImageUrl(small), canonicalImageUrl(large));
  assert.equal(canonicalImageUrl(small), 'https://origin.example.com/images/scientist.png');
});

test('survey mode reports unsupported formats separately from tiny and duplicate images', () => {
  const result = filterImageCandidates([
    image('https://example.com/diagram.svg', 1200, 800),
    image('data:image/png;base64,abc', 500, 500),
    image('https://example.com/tiny.png', 40, 40),
  ]);
  assert.deepEqual(result.reasonCounts, {
    missingSourceCount: 0,
    inlineDataCount: 1,
    unsupportedFormatCount: 1,
    tooSmallCount: 1,
    duplicateUrlCount: 0,
  });
});

test('survey extraction scans header, advert, profile, and article regions', async () => {
  const html = `
    <html><head><title>Site survey</title></head><body>
      <header><img src="/banner.jpg" width="1200" height="180"></header>
      <aside class="advertisement"><img src="/advert.jpg" width="600" height="400"></aside>
      <main><img class="profile" src="/profile.jpg" width="500" height="500"></main>
      <footer><img src="/event-award.jpg" width="800" height="500"></footer>
    </body></html>`;
  const page = await extractImagesFromPage('https://news.mit.edu/example', html, { mode: 'survey' });
  assert.deepEqual(page.images.map(item => item.src), [
    'https://news.mit.edu/banner.jpg',
    'https://news.mit.edu/advert.jpg',
    'https://news.mit.edu/profile.jpg',
    'https://news.mit.edu/event-award.jpg',
  ]);
});

test('survey extraction splits srcset candidates even without a space after the comma', async () => {
  const html = `
    <html><head><title>Responsive images</title></head><body>
      <img srcset="https://cdn.example.com/photo-small.jpg 1x,https://cdn.example.com/photo-large.jpg 2x">
    </body></html>`;
  const page = await extractImagesFromPage('https://example.com/story', html, { mode: 'survey' });

  assert.deepEqual(page.images.map(item => item.src), [
    'https://cdn.example.com/photo-large.jpg',
  ]);
});

test('survey extraction recovers images serialized in an SPA/CMS shell', async () => {
  const html = `
    <html><head><title>Dynamic university home</title></head><body>
      <div id="root"></div>
      <script>
        main.cards = [
          { image: '/_upload/article/images/a/hero.jpg', href: '/2026/0718/c1/page.htm' },
          { image: '/_upload/article/images/b/research.png', href: '/news/list.htm' }
        ];
      </script>
      <img src="/_visitcount" width="0" height="0">
    </body></html>`;
  const page = await extractImagesFromPage('https://example.edu/', html, { mode: 'survey' });

  assert.equal(page.embeddedImageCount, 2);
  assert.deepEqual(page.images.map(item => item.src), [
    'https://example.edu/_visitcount',
    'https://example.edu/_upload/article/images/a/hero.jpg',
    'https://example.edu/_upload/article/images/b/research.png',
  ]);
  const filtered = filterImageCandidates(page.images);
  assert.equal(filtered.valid.length, 2);
  assert.equal(filtered.reasonCounts.tooSmallCount, 1);
});
