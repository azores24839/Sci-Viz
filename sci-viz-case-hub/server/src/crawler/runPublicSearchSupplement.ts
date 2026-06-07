import { chromium } from 'playwright';
import { prisma } from '../prisma.js';
import { saveImageFromUrl, deleteSavedImage } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { extractImagesFromPage } from './extractImagesFromPage.js';
import { filterImageCandidates } from './filterImageCandidates.js';
import { scoreImageCandidate } from './collectionScoring.js';

type SearchTarget = {
  label: string;
  query: string;
  urls: string[];
  goal: number;
  discipline: string;
  sourceType: string;
};

const SEARCH_TARGETS: SearchTarget[] = [
  {
    label: 'Stanford News public video/search',
    query: 'Stanford research visualization science engineering video',
    urls: [
      'https://www.youtube.com/results?search_query=Stanford+research+visualization+science+engineering',
      'https://www.youtube.com/results?search_query=Stanford+News+research+science+visualization',
    ],
    goal: 4,
    discipline: '综合科研',
    sourceType: 'public_video_search',
  },
  {
    label: 'Tableau public gallery search',
    query: 'Tableau public dashboard scientific visualization',
    urls: [
      'https://www.youtube.com/results?search_query=Tableau+Public+scientific+visualization+dashboard',
      'https://www.youtube.com/results?search_query=Tableau+dashboard+data+visualization+science',
      'https://public.tableau.com/app/discover/viz-of-the-day',
    ],
    goal: 6,
    discipline: '数据可视化',
    sourceType: 'public_visualization_search',
  },
  {
    label: 'Boston Scientific public video/search',
    query: 'Boston Scientific product animation medical device visualization',
    urls: [
      'https://www.youtube.com/results?search_query=Boston+Scientific+medical+device+animation',
      'https://www.youtube.com/results?search_query=Boston+Scientific+product+visualization',
      'https://www.youtube.com/results?search_query=Boston+Scientific+procedure+animation+medical+device',
      'https://www.youtube.com/results?search_query=Boston+Scientific+Watchman+animation',
    ],
    goal: 4,
    discipline: '医学',
    sourceType: 'public_video_search',
  },
  {
    label: 'SJTU ME public video/search',
    query: '上海交通大学 机械与动力工程学院 科研 视频',
    urls: [
      'https://search.bilibili.com/all?keyword=%E4%B8%8A%E6%B5%B7%E4%BA%A4%E9%80%9A%E5%A4%A7%E5%AD%A6%20%E6%9C%BA%E6%A2%B0%E4%B8%8E%E5%8A%A8%E5%8A%9B%E5%B7%A5%E7%A8%8B%E5%AD%A6%E9%99%A2%20%E7%A7%91%E7%A0%94',
      'https://www.youtube.com/results?search_query=Shanghai+Jiao+Tong+University+mechanical+engineering+research',
    ],
    goal: 9,
    discipline: '工程',
    sourceType: 'public_video_search',
  },
  {
    label: 'SJTU CS public video/search',
    query: '上海交通大学 计算机学院 科研 可视化 视频',
    urls: [
      'https://search.bilibili.com/all?keyword=%E4%B8%8A%E6%B5%B7%E4%BA%A4%E9%80%9A%E5%A4%A7%E5%AD%A6%20%E8%AE%A1%E7%AE%97%E6%9C%BA%E5%AD%A6%E9%99%A2%20%E7%A7%91%E7%A0%94',
      'https://search.bilibili.com/all?keyword=%E4%B8%8A%E6%B5%B7%E4%BA%A4%E9%80%9A%E5%A4%A7%E5%AD%A6%20%E8%AE%A1%E7%AE%97%E6%9C%BA%20AI%20%E5%8F%AF%E8%A7%86%E5%8C%96',
      'https://search.bilibili.com/all?keyword=%E4%B8%8A%E6%B5%B7%E4%BA%A4%E5%A4%A7%20%E8%AE%A1%E7%AE%97%E6%9C%BA%20%E6%9C%BA%E5%99%A8%E4%BA%BA%20%E7%A7%91%E7%A0%94',
      'https://www.youtube.com/results?search_query=Shanghai+Jiao+Tong+University+computer+science+research+visualization',
    ],
    goal: 15,
    discipline: '信息科学',
    sourceType: 'public_video_search',
  },
  {
    label: 'SJTU SMSE public video/search',
    query: '上海交通大学 材料科学与工程学院 科研 视频',
    urls: [
      'https://search.bilibili.com/all?keyword=%E4%B8%8A%E6%B5%B7%E4%BA%A4%E9%80%9A%E5%A4%A7%E5%AD%A6%20%E6%9D%90%E6%96%99%E7%A7%91%E5%AD%A6%E4%B8%8E%E5%B7%A5%E7%A8%8B%E5%AD%A6%E9%99%A2%20%E7%A7%91%E7%A0%94',
      'https://www.youtube.com/results?search_query=Shanghai+Jiao+Tong+University+materials+science+research',
    ],
    goal: 7,
    discipline: '材料',
    sourceType: 'public_video_search',
  },
  {
    label: 'SJTU OCE public video/search',
    query: '上海交通大学 船舶海洋与建筑工程学院 科研 视频',
    urls: [
      'https://search.bilibili.com/all?keyword=%E4%B8%8A%E6%B5%B7%E4%BA%A4%E9%80%9A%E5%A4%A7%E5%AD%A6%20%E8%88%B9%E8%88%B6%E6%B5%B7%E6%B4%8B%E4%B8%8E%E5%BB%BA%E7%AD%91%E5%B7%A5%E7%A8%8B%E5%AD%A6%E9%99%A2',
      'https://www.youtube.com/results?search_query=Shanghai+Jiao+Tong+University+naval+architecture+ocean+engineering',
    ],
    goal: 9,
    discipline: '工程',
    sourceType: 'public_video_search',
  },
  {
    label: 'HIT public video/search',
    query: '哈尔滨工业大学 科研 航天 机器人 视频',
    urls: [
      'https://search.bilibili.com/all?keyword=%E5%93%88%E5%B0%94%E6%BB%A8%E5%B7%A5%E4%B8%9A%E5%A4%A7%E5%AD%A6%20%E7%A7%91%E7%A0%94%20%E8%88%AA%E5%A4%A9',
      'https://search.bilibili.com/all?keyword=%E5%93%88%E5%B0%94%E6%BB%A8%E5%B7%A5%E4%B8%9A%E5%A4%A7%E5%AD%A6%20%E6%9C%BA%E5%99%A8%E4%BA%BA%20%E7%A7%91%E7%A0%94',
      'https://search.bilibili.com/all?keyword=%E5%93%88%E5%B7%A5%E5%A4%A7%20%E8%88%AA%E5%A4%A9%20%E7%A7%91%E7%A0%94%20%E6%88%90%E6%9E%9C',
      'https://search.bilibili.com/all?keyword=%E5%93%88%E5%B7%A5%E5%A4%A7%20%E6%9C%BA%E5%99%A8%E4%BA%BA%20%E7%A7%91%E7%A0%94',
      'https://www.youtube.com/results?search_query=Harbin+Institute+of+Technology+robotics+space+research',
    ],
    goal: 19,
    discipline: '工程',
    sourceType: 'public_video_search',
  },
  {
    label: 'SEU public video/search',
    query: '东南大学 科研 建筑 机器人 视频',
    urls: [
      'https://search.bilibili.com/all?keyword=%E4%B8%9C%E5%8D%97%E5%A4%A7%E5%AD%A6%20%E7%A7%91%E7%A0%94%20%E5%BB%BA%E7%AD%91',
      'https://search.bilibili.com/all?keyword=%E4%B8%9C%E5%8D%97%E5%A4%A7%E5%AD%A6%20%E6%9C%BA%E5%99%A8%E4%BA%BA%20%E7%A7%91%E7%A0%94',
      'https://search.bilibili.com/all?keyword=%E4%B8%9C%E5%8D%97%E5%A4%A7%E5%AD%A6%20%E7%A7%91%E7%A0%94%20%E6%88%90%E6%9E%9C%20%E5%8F%AF%E8%A7%86%E5%8C%96',
      'https://search.bilibili.com/all?keyword=%E4%B8%9C%E5%8D%97%E5%A4%A7%E5%AD%A6%20%E5%BB%BA%E7%AD%91%20%E6%95%B0%E5%AD%97%20%E4%BB%BF%E7%9C%9F',
      'https://www.youtube.com/results?search_query=Southeast+University+China+research+architecture+engineering',
    ],
    goal: 20,
    discipline: '工程',
    sourceType: 'public_video_search',
  },
];

function getStringArg(name: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : '';
}

function getNumberArg(name: string, fallback: number): number {
  const raw = getStringArg(name);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function matchesOnly(target: SearchTarget, only: string) {
  if (!only) return true;
  const terms = only.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  const haystack = `${target.label} ${target.query}`.toLowerCase();
  return terms.some(term => haystack.includes(term));
}

async function render(url: string, executablePath: string | null) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.35)));
    await page.waitForTimeout(1500);
    await page.$$eval('img', imgs => {
      for (const img of imgs) {
        const src = img.currentSrc || img.src;
        if (src) img.setAttribute('src', src);
        if (img.naturalWidth && !img.getAttribute('width')) img.setAttribute('width', String(img.naturalWidth));
        if (img.naturalHeight && !img.getAttribute('height')) img.setAttribute('height', String(img.naturalHeight));
      }
    });
    return { finalUrl: page.url(), title: await page.title(), html: await page.content() };
  } finally {
    await browser.close();
  }
}

async function runTarget(target: SearchTarget, execute: boolean, maxImagesPerUrl: number, executablePath: string | null) {
  const existing = await prisma.visualCase.count({
    where: {
      userHint: `${target.label} / public_supplement / ${target.sourceType}`,
      reviewStatus: { not: 'rejected' },
    },
  });
  const remainingGoal = Math.max(0, target.goal - existing);
  let created = 0;
  let rendered = 0;
  let candidates = 0;
  let duplicates = 0;
  const errors: string[] = [];

  if (remainingGoal === 0) {
    return { label: target.label, existing, rendered, candidates, created, duplicates, errors };
  }

  for (const url of target.urls) {
    if (created >= remainingGoal) break;
    try {
      const page = await render(url, executablePath);
      rendered++;
      const extracted = await extractImagesFromPage(page.finalUrl, page.html);
      const { valid } = filterImageCandidates(extracted.images);
      candidates += valid.length;
      const scored = valid
        .map(image => ({
          image,
          score: scoreImageCandidate({
            image,
            pageTitle: extracted.pageTitle || page.title,
            pageUrl: page.finalUrl,
            sourceName: target.label,
            sourceType: target.sourceType,
            metaDescription: extracted.metaDescription,
            bodyText: extracted.bodyText,
          }),
        }))
        .sort((a, b) => b.score.score - a.score.score)
        .slice(0, maxImagesPerUrl);

      if (!execute) {
        console.log(`[dry-run] ${target.label}: ${url} selected=${scored.length} candidates=${valid.length}`);
        continue;
      }

      for (const item of scored) {
        if (created >= remainingGoal) break;
        try {
          const imageResult = await saveSearchImage(item.image.src);
          const duplicate = await findDuplicateCase(imageResult.imageHash);
          if (duplicate) {
            await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
            duplicates++;
            continue;
          }

          await prisma.visualCase.create({
            data: {
              title: `${target.label} - ${extracted.pageTitle || page.title}`,
              caseTitle: `${target.label} public supplement`,
              sourceUrl: page.finalUrl,
              sourceDomain: new URL(page.finalUrl).hostname,
              pageTitle: extracted.pageTitle || page.title,
              imageUrl: item.image.src,
              imagePath: imageResult.imagePath,
              thumbnailPath: imageResult.thumbnailPath,
              imageHash: imageResult.imageHash,
              contextText: [target.query, item.image.contextText, extracted.metaDescription].filter(Boolean).join('\n').slice(0, 1500),
              captureType: 'public_search_image',
              userHint: `${target.label} / public_supplement / ${target.sourceType}`,
              collectionScore: item.score.score,
              collectionReasons: JSON.stringify(item.score.reasons),
              mediaType: '网页/视频缩略图',
              contentType: '公开视频与搜索结果',
              discipline: target.discipline,
              technicalMethod: '检索补采',
              functionalPurpose: '传播',
              distributionMedium: '静图',
              reviewStatus: 'needs_review',
              manualNotes: [
                'public_supplement: non-official/search/video-platform source',
                `target: ${target.label}`,
                `query: ${target.query}`,
              ].join('\n'),
            },
          });
          created++;
        } catch (err) {
          errors.push(`${item.image.src}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      errors.push(`${url}: ${(err as Error).message}`);
    }
  }

  return { label: target.label, existing, remainingGoal, rendered, candidates, created, duplicates, errors: errors.slice(0, 8) };
}

function imageUrlVariants(src: string): string[] {
  const variants = [src];
  try {
    const parsed = new URL(src);
    if (/hdslb\.com$/i.test(parsed.hostname) || /\.hdslb\.com$/i.test(parsed.hostname)) {
      const at = parsed.pathname.indexOf('@');
      if (at > 0) {
        const clean = new URL(parsed.href);
        clean.pathname = parsed.pathname.slice(0, at);
        clean.search = '';
        variants.push(clean.href);
      }
    }
    if (/ytimg\.com$/i.test(parsed.hostname) || /\.ytimg\.com$/i.test(parsed.hostname)) {
      const clean = new URL(parsed.href);
      clean.search = '';
      variants.push(clean.href);
      const parts = clean.pathname.split('/');
      const file = parts[parts.length - 1] || '';
      if (/^hq720/.test(file) || /^oar/.test(file) || /^oardefault/.test(file)) {
        parts[parts.length - 1] = 'hqdefault.jpg';
        clean.pathname = parts.join('/');
        variants.push(clean.href);
      }
      if (/^hq720/.test(file) || /^oar/.test(file) || /^oardefault/.test(file)) {
        parts[parts.length - 1] = 'mqdefault.jpg';
        clean.pathname = parts.join('/');
        variants.push(clean.href);
      }
    }
  } catch {
    // Keep original URL only.
  }
  return Array.from(new Set(variants));
}

async function saveSearchImage(src: string) {
  let lastErr: unknown;
  for (const url of imageUrlVariants(src)) {
    try {
      return await saveImageFromUrl(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Image download failed');
}

async function main() {
  const execute = process.argv.includes('--execute');
  const only = getStringArg('only');
  const maxImagesPerUrl = getNumberArg('max-images-per-url', 8);
  const executablePath = getStringArg('chrome-executable') || process.env.CHROME_EXECUTABLE || null;
  const selected = SEARCH_TARGETS.filter(target => matchesOnly(target, only));
  if (!selected.length) throw new Error(`No targets matched --only=${only}`);

  console.log(`Public search supplement: ${execute ? 'EXECUTE' : 'DRY-RUN'} (${selected.length} targets)`);
  const results = [];
  for (const target of selected) {
    const result = await runTarget(target, execute, maxImagesPerUrl, executablePath);
    results.push(result);
    console.log(JSON.stringify(result));
  }
  console.log('SUMMARY');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
