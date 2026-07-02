import { chromium } from 'playwright';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate } from './collectionScoring.js';
import { saveImageFromUrl, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { prisma } from '../prisma.js';
import pLimit from 'p-limit';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MAX_IMAGES_PER_PAGE = 10;

const NVIDIA_CN_PAGES = [
  'https://www.nvidia.cn/',
  'https://www.nvidia.cn/geforce/graphics-cards/50-series/',
  'https://www.nvidia.cn/data-center/',
  'https://www.nvidia.cn/data-center/products/',
  'https://www.nvidia.cn/industries/automotive/',
  'https://www.nvidia.cn/industries/healthcare-life-sciences/',
  'https://www.nvidia.cn/industries/robotics/',
  'https://www.nvidia.cn/industries/manufacturing/',
  'https://www.nvidia.cn/industries/energy/',
  'https://www.nvidia.cn/industries/game-development/',
  'https://www.nvidia.cn/industries/media-and-entertainment/',
  'https://www.nvidia.cn/ai/',
  'https://www.nvidia.cn/solutions/ai/',
  'https://www.nvidia.cn/solutions/ai/agentic-ai/',
  'https://www.nvidia.cn/high-performance-computing/',
  'https://www.nvidia.cn/high-performance-computing/scientific-visualization/',
  'https://www.nvidia.cn/autonomous-machines/',
  'https://www.nvidia.cn/self-driving-cars/',
  'https://www.nvidia.cn/omniverse/',
  'https://www.nvidia.cn/studio/',
  'https://www.nvidia.cn/products/workstations/',
  'https://www.nvidia.cn/products/workstations/dgx-spark/',
  'https://www.nvidia.cn/networking/',
  'https://www.nvidia.cn/software/',
  'https://www.nvidia.cn/technologies/',
  'https://www.nvidia.cn/research/',
  'https://www.nvidia.cn/industries/aec/',
  'https://www.nvidia.cn/industries/finance/',
  'https://www.nvidia.cn/industries/retail/',
  'https://www.nvidia.cn/industries/telecommunications/',
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.evaluate(async () => {
      const distance = 400;
      const delay = 200;
      const scrollHeight = document.documentElement.scrollHeight;
      for (let y = 0; y < scrollHeight; y += distance) {
        window.scrollTo(0, y);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);

    await page.$$eval('img', imgs => {
      for (const img of imgs) {
        const currentSrc = img.currentSrc || img.src;
        if (currentSrc) {
          img.setAttribute('src', currentSrc);
          img.setAttribute('data-rendered-src', currentSrc);
        }
        if (img.naturalWidth && !img.getAttribute('width')) {
          img.setAttribute('width', String(img.naturalWidth));
        }
        if (img.naturalHeight && !img.getAttribute('height')) {
          img.setAttribute('height', String(img.naturalHeight));
        }
      }
    });

    const renderedImages = await page.$$eval('img', imgs =>
      imgs
        .map(img => {
          let width = img.naturalWidth || 0;
          let height = img.naturalHeight || 0;
          if (!width && img.hasAttribute('width')) {
            width = parseInt(img.getAttribute('width') || '0', 10);
          }
          if (!height && img.hasAttribute('height')) {
            height = parseInt(img.getAttribute('height') || '0', 10);
          }
          return {
            src: img.currentSrc || img.src,
            alt: img.alt || '',
            width,
            height,
            loaded: img.naturalWidth > 0,
          };
        })
        .filter(img => {
          if (!img.src) return false;
          if (img.width >= 160 && img.height >= 100) return true;
          if (!img.loaded && img.width > 0 && img.height > 0) return true;
          return false;
        })
    );

    await page.evaluate((images) => {
      const container = document.createElement('section');
      container.setAttribute('data-browser-rendered-images', 'true');
      for (const image of images) {
        const figure = document.createElement('figure');
        const img = document.createElement('img');
        img.setAttribute('src', image.src);
        img.setAttribute('alt', image.alt);
        img.setAttribute('width', String(image.width));
        img.setAttribute('height', String(image.height));
        figure.appendChild(img);
        if (image.alt) {
          const caption = document.createElement('figcaption');
          caption.textContent = image.alt;
          figure.appendChild(caption);
        }
        container.appendChild(figure);
      }
      document.body.appendChild(container);
    }, renderedImages);

    return {
      finalUrl: page.url(),
      title: await page.title(),
      html: await page.content(),
    };
  } finally {
    await browser.close();
  }
}

async function processPage(url: string, options: { maxImages: number }) {
  let rendered;
  try {
    rendered = await renderHtml(url);
  } catch (err) {
    return { url, pageTitle: '', status: 'failed' as const, createdCaseCount: 0, errors: [`render failed: ${(err as Error).message}`] };
  }

  const extracted = await extractImagesFromPage(rendered.finalUrl, rendered.html);
  const { valid } = filterImageCandidates(extracted.images);

  const combinedContext = [extracted.metaDescription, extracted.bodyText]
    .filter(Boolean).join('\n').substring(0, 1000);

  const scoredImages = valid
    .map(img => ({
      image: img,
      score: scoreImageCandidate({
        image: img,
        pageTitle: extracted.pageTitle,
        pageUrl: rendered.finalUrl,
        sourceName: 'NVIDIA China',
        sourceType: 'enterprise_product',
        metaDescription: extracted.metaDescription,
        bodyText: extracted.bodyText,
      }),
    }))
    .sort((a, b) => b.score.score - a.score.score);

  const selected = scoredImages
    .filter(item => item.score.shouldKeep)
    .slice(0, options.maxImages);

  let created = 0;
  for (const scored of selected) {
    const img = scored.image;
    try {
      const imageResult = await saveImageFromUrl(img.src);
      const dupeHash = await findDuplicateCase(imageResult.imageHash);
      if (dupeHash) {
        await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
        continue;
      }

      const isGif = /\.gif(\?|$)/i.test(img.src);
      const finalUrl = rendered.finalUrl;
      const parsedUrl = new URL(finalUrl);

      await prisma.visualCase.create({
        data: {
          sourceUrl: finalUrl,
          sourceDomain: parsedUrl.hostname,
          pageTitle: extracted.pageTitle,
          imageUrl: img.src,
          imagePath: imageResult.imagePath,
          thumbnailPath: imageResult.thumbnailPath,
          imageHash: imageResult.imageHash,
          contextText: [img.contextText, combinedContext].filter(Boolean).join('\n').substring(0, 1500),
          captureType: 'crawler',
          userHint: 'NVIDIA China / enterprise_product',
          collectionScore: scored.score.score,
          collectionReasons: JSON.stringify(scored.score.reasons),
          reviewStatus: 'pending_ai_analysis',
          distributionMedium: isGif ? '动图' : undefined,
        },
      }).then(c => {
        created++;
        runAnalysis(c.id, imageResult.imagePath, extracted.pageTitle, finalUrl, img.contextText).catch(() => {});
      });
    } catch {
      continue;
    }
  }

  return { url, pageTitle: extracted.pageTitle, status: 'success' as const, createdCaseCount: created, errors: [] as string[] };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxUrls = parseInt(process.argv.find(a => a.startsWith('--max-urls='))?.split('=')[1] || String(NVIDIA_CN_PAGES.length), 10);
  const concurrency = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '1', 10);

  const pages = NVIDIA_CN_PAGES.slice(0, maxUrls);
  console.log(`=== NVIDIA China Browser Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, pages=${pages.length}, concurrency=${concurrency}`);

  if (!execute) {
    console.log(`\nWould crawl ${pages.length} pages:`);
    pages.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  const limit = pLimit(concurrency);
  let totalCreated = 0;
  let totalFailed = 0;

  await Promise.all(pages.map(url =>
    limit(async () => {
      console.log(`[Browser] Rendering ${url}...`);
      const result = await processPage(url, { maxImages: MAX_IMAGES_PER_PAGE });
      if (result.status === 'failed') {
        totalFailed++;
        console.error(`  FAIL: ${url} — ${result.errors[0]}`);
      } else {
        totalCreated += result.createdCaseCount;
        console.log(`  +${result.createdCaseCount} images from ${new URL(url).pathname}`);
      }
    })
  ));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${totalCreated}`);
  console.log(`Failed: ${totalFailed}`);

  const count = await prisma.visualCase.count({
    where: { sourceDomain: 'www.nvidia.cn' },
  });
  console.log(`Total NVIDIA China cases in DB: ${count}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
