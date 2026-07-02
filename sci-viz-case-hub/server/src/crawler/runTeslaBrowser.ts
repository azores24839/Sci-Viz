import { chromium } from 'playwright';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate } from './collectionScoring.js';
import { saveImageFromUrl, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { prisma } from '../prisma.js';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAX_IMAGES_PER_PAGE = 15;

const TESLA_PAGES = [
  'https://www.tesla.com/',
  'https://www.tesla.com/modely',
  'https://www.tesla.com/cybertruck',
  'https://www.tesla.com/optimus',
  'https://www.tesla.com/energy',
  'https://www.tesla.com/megapack',
  'https://www.tesla.com/solarpanels',
  'https://www.tesla.com/solarroof',
  'https://www.tesla.com/powerwall',
  'https://www.tesla.com/AI',
  'https://www.tesla.com/models',
  'https://www.tesla.com/model3',
  'https://www.tesla.com/modelx',
  'https://www.tesla.com/charging',
  'https://www.tesla.com/autopilot',
];

async function renderHtml(url: string): Promise<{ finalUrl: string; title: string; html: string }> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);

    await page.evaluate(async () => {
      const distance = 300;
      const delay = 150;
      const scrollHeight = document.documentElement.scrollHeight;
      for (let y = 0; y < scrollHeight; y += distance) {
        window.scrollTo(0, y);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);

    await page.$$eval('img, video[poster]', elements => {
      for (const el of elements) {
        if (el.tagName === 'VIDEO') {
          const poster = el.getAttribute('poster');
          if (poster) {
            const img = document.createElement('img');
            img.setAttribute('src', poster);
            img.setAttribute('alt', 'Video poster');
            img.setAttribute('data-media-type', 'video');
            el.parentElement?.appendChild(img);
          }
        } else {
          const img = el as HTMLImageElement;
          const currentSrc = img.currentSrc || img.src;
          if (currentSrc && !currentSrc.startsWith('data:')) {
            img.setAttribute('src', currentSrc);
          }
          if (img.naturalWidth && !img.getAttribute('width')) {
            img.setAttribute('width', String(img.naturalWidth));
          }
          if (img.naturalHeight && !img.getAttribute('height')) {
            img.setAttribute('height', String(img.naturalHeight));
          }
        }
      }
    });

    const renderedImages = await page.$$eval('img', imgs =>
      imgs
        .map(img => ({
          src: img.currentSrc || img.src,
          alt: img.alt || '',
          width: img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10),
          height: img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10),
          isVideoPoster: img.getAttribute('data-media-type') === 'video',
        }))
        .filter(img => img.src && !img.src.startsWith('data:') && (img.width >= 200 || img.height >= 200) && img.width < 10000)
    );

    for (const image of renderedImages) {
      await page.evaluate((img) => {
        const figure = document.createElement('figure');
        figure.setAttribute('data-browser-rendered', 'true');
        const imgEl = document.createElement('img');
        imgEl.setAttribute('src', img.src);
        imgEl.setAttribute('alt', img.alt);
        imgEl.setAttribute('width', String(img.width));
        imgEl.setAttribute('height', String(img.height));
        if (img.isVideoPoster) imgEl.setAttribute('data-media-type', 'video');
        figure.appendChild(imgEl);
        document.body.appendChild(figure);
      }, image);
    }

    return {
      finalUrl: page.url(),
      title: await page.title(),
      html: await page.content(),
    };
  } finally {
    await browser.close();
  }
}

async function processPage(url: string) {
  let rendered;
  try {
    rendered = await renderHtml(url);
  } catch (err) {
    return { url, pageTitle: '', created: 0, errors: [(err as Error).message] };
  }

  const extracted = await extractImagesFromPage(rendered.finalUrl, rendered.html);
  const { valid } = filterImageCandidates(extracted.images);
  const combinedContext = [extracted.metaDescription, extracted.bodyText].filter(Boolean).join('\n').substring(0, 1000);

  const scored = valid
    .map(img => ({ img, score: scoreImageCandidate({ image: img, pageTitle: extracted.pageTitle, pageUrl: rendered.finalUrl, sourceName: 'Tesla', sourceType: 'enterprise_product', metaDescription: extracted.metaDescription, bodyText: extracted.bodyText }) }))
    .sort((a, b) => b.score.score - a.score.score);

  const selected = scored.filter(s => s.score.shouldKeep).slice(0, MAX_IMAGES_PER_PAGE);
  let created = 0;

  for (const { img, score } of selected) {
    try {
      const imageResult = await saveImageFromUrl(img.src);
      const dupe = await findDuplicateCase(imageResult.imageHash);
      if (dupe) { await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath); continue; }

      const isGif = /\.gif(\?|$)/i.test(img.src);
      const isVideo = /data-media-type.*video/i.test(img.alt || '') || /video/i.test(img.contextText || '');
      const distMedium = isGif ? '动图' : isVideo ? '视频' : undefined;
      const parsedUrl = new URL(rendered.finalUrl);

      const c = await prisma.visualCase.create({
        data: {
          sourceUrl: rendered.finalUrl, sourceDomain: parsedUrl.hostname,
          pageTitle: extracted.pageTitle, imageUrl: img.src,
          imagePath: imageResult.imagePath, thumbnailPath: imageResult.thumbnailPath,
          imageHash: imageResult.imageHash,
          contextText: [img.contextText, combinedContext].filter(Boolean).join('\n').substring(0, 1500),
          captureType: 'crawler', userHint: 'Tesla / enterprise_product',
          collectionScore: score.score, collectionReasons: JSON.stringify(score.reasons),
          reviewStatus: 'pending_ai_analysis', distributionMedium: distMedium,
        },
      });
      created++;
      runAnalysis(c.id, imageResult.imagePath, extracted.pageTitle, rendered.finalUrl, img.contextText).catch(() => {});
    } catch { continue; }
  }
  return { url, pageTitle: extracted.pageTitle, created, errors: [] as string[] };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxUrls = parseInt(process.argv.find(a => a.startsWith('--max-urls='))?.split('=')[1] || String(TESLA_PAGES.length), 10);
  const concurrency = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '2', 10);
  const pages = TESLA_PAGES.slice(0, maxUrls);

  console.log(`=== Tesla Browser Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, pages=${pages.length}`);

  if (!execute) { pages.forEach((p, i) => console.log(`  ${i + 1}. ${p}`)); console.log('\nPass --execute.'); return; }

  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(concurrency);
  let total = 0, failed = 0;

  for (const url of pages) {
    await limit(async () => {
      console.log(`[Browser] ${url}...`);
      const r = await processPage(url);
      if (r.created > 0) { total += r.created; console.log(`  +${r.created}`); }
      else { failed++; console.log(`  0 images`); }
    });
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${total}`);
  console.log(`Failed: ${failed}`);
  const count = await prisma.visualCase.count({ where: { sourceDomain: 'www.tesla.com' } });
  console.log(`Total Tesla cases in DB: ${count}`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
