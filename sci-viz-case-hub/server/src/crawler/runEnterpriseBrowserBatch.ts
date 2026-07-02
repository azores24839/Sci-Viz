import { chromium } from 'playwright';
import { ENTERPRISE_SOURCES } from './enterpriseSources.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate } from './collectionScoring.js';
import { saveImageFromUrl, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { prisma } from '../prisma.js';

const MAX_IMAGES_PER_PAGE = 5;

function getStringArg(name: string): string | null {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : null;
}

function getNumberArg(name: string, fallback: number): number {
  const raw = getStringArg(name);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getListArg(name: string): string[] | null {
  const raw = getStringArg(name);
  if (!raw) return null;
  const values = raw.split(',').map(item => item.trim()).filter(Boolean);
  return values.length ? values : null;
}

function matchesOnly(sourceName: string, only: string | null): boolean {
  if (!only) return true;
  const wanted = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  return wanted.length === 0 || wanted.some(item => sourceName.toLowerCase().includes(item));
}

async function renderHtml(url: string, executablePath: string | null): Promise<{ finalUrl: string; title: string; html: string }> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
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

async function processRenderedSource(
  source: typeof ENTERPRISE_SOURCES[number],
  options: { execute: boolean; maxImages: number; executablePath: string | null },
) {
  const errors: string[] = [];
  let createdCaseCount = 0;
  let filteredImageCount = 0;
  let candidateImageCount = 0;
  let rendered;

  try {
    rendered = await renderHtml(source.url, options.executablePath);
  } catch (err) {
    return {
      name: source.name,
      url: source.url,
      status: 'failed',
      createdCaseCount: 0,
      candidateImageCount: 0,
      filteredImageCount: 0,
      errors: [`render failed: ${(err as Error).message}`],
    };
  }

  const extracted = await extractImagesFromPage(rendered.finalUrl, rendered.html);
  candidateImageCount = extracted.images.length;

  const { valid, filteredCount } = filterImageCandidates(extracted.images);
  filteredImageCount = filteredCount;

  const context = [extracted.metaDescription, extracted.bodyText]
    .filter(Boolean)
    .join('\n')
    .substring(0, 1000);

  const scored = valid
    .map(image => ({
      image,
      score: scoreImageCandidate({
        image,
        pageTitle: extracted.pageTitle || rendered.title,
        pageUrl: rendered.finalUrl,
        sourceName: source.name,
        sourceType: source.sourceType,
        metaDescription: extracted.metaDescription,
        bodyText: extracted.bodyText,
      }),
    }))
    .sort((a, b) => b.score.score - a.score.score);

  const selected = scored
    .filter(item => item.score.shouldKeep)
    .slice(0, Math.min(options.maxImages, MAX_IMAGES_PER_PAGE));

  for (const skipped of scored.filter(item => !item.score.shouldKeep).slice(0, 10)) {
    errors.push(`Low-value image skipped: ${skipped.image.src} - score ${skipped.score.score}`);
  }

  if (!options.execute) {
    return {
      name: source.name,
      url: source.url,
      finalUrl: rendered.finalUrl,
      status: 'dry-run',
      pageTitle: extracted.pageTitle || rendered.title,
      candidateImageCount,
      filteredImageCount,
      selectedImageCount: selected.length,
      selectedImages: selected.map(item => ({ src: item.image.src, score: item.score.score })),
      createdCaseCount,
      errors,
    };
  }

  for (const item of selected) {
    let imageResult;
    try {
      imageResult = await saveImageFromUrl(item.image.src);
    } catch (err) {
      errors.push(`Image download failed: ${item.image.src} - ${(err as Error).message}`);
      continue;
    }

    try {
      const duplicate = await findDuplicateCase(imageResult.imageHash);
      if (duplicate) {
        await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
        errors.push(`Duplicate image skipped: ${item.image.src} - matched ${duplicate.caseEntry.id} (${duplicate.matchType})`);
        continue;
      }

      const caseEntry = await prisma.visualCase.create({
        data: {
          sourceUrl: rendered.finalUrl,
          sourceDomain: new URL(rendered.finalUrl).hostname,
          pageTitle: extracted.pageTitle || rendered.title,
          imageUrl: item.image.src,
          imagePath: imageResult.imagePath,
          thumbnailPath: imageResult.thumbnailPath,
          imageHash: imageResult.imageHash,
          contextText: [item.image.contextText, context].filter(Boolean).join('\n').substring(0, 1500),
          captureType: 'crawler_browser',
          userHint: [source.name, source.sourceType].filter(Boolean).join(' / '),
          collectionScore: item.score.score,
          collectionReasons: JSON.stringify(item.score.reasons),
          reviewStatus: 'pending_ai_analysis',
        },
      });
      createdCaseCount++;
      runAnalysis(caseEntry.id, imageResult.imagePath, extracted.pageTitle || rendered.title, rendered.finalUrl, context);
    } catch (err) {
      errors.push(`Case creation failed: ${item.image.src} - ${(err as Error).message}`);
    }
  }

  return {
    name: source.name,
    url: source.url,
    finalUrl: rendered.finalUrl,
    status: 'success',
    pageTitle: extracted.pageTitle || rendered.title,
    candidateImageCount,
    filteredImageCount,
    selectedImageCount: selected.length,
    createdCaseCount,
    errors,
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const only = getStringArg('only');
  const statuses = getListArg('statuses');
  const maxImages = getNumberArg('max-images', 3);
  const executablePath = getStringArg('chrome-executable') || process.env.CHROME_EXECUTABLE || null;

  const sources = ENTERPRISE_SOURCES.filter(source =>
    source.sourceType === 'enterprise'
    && source.category === 'ENT'
    && (!statuses || statuses.includes(source.crawlStatus))
    && matchesOnly(source.name, only)
  );

  if (sources.length === 0) {
    console.error('No enterprise sources matched the requested filter.');
    process.exit(1);
  }

  if (execute) {
    console.warn('Executing browser-rendered enterprise crawl: this will download images, write VisualCase rows, and run analysis.');
  } else {
    console.warn('Dry-run mode: rendering pages and selecting images only. Pass --execute to ingest images.');
  }

  const results = [];
  for (const source of sources) {
    const result = await processRenderedSource(source, { execute, maxImages, executablePath });
    results.push(result);
    console.log(JSON.stringify(result));
    await new Promise(r => setTimeout(r, 2000));
  }

  const summary = results.reduce((acc, result) => ({
    sources: acc.sources + 1,
    createdCaseCount: acc.createdCaseCount + result.createdCaseCount,
    candidateImageCount: acc.candidateImageCount + result.candidateImageCount,
    filteredImageCount: acc.filteredImageCount + result.filteredImageCount,
  }), { sources: 0, createdCaseCount: 0, candidateImageCount: 0, filteredImageCount: 0 });
  console.log('\nSummary');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
