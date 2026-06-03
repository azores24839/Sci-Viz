import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { discoverLinks } from './crawler/discoverLinks.js';
import { processSingleUrl } from './crawler/runUrlCrawl.js';

const prisma = new PrismaClient();

const NIGMS_IMAGE_IDS = [
  3279, 2379, 2307, 2708, 1056, 2341, 2683, 1251, 2561, 2517, 5757, 6589,
  2369, 1332, 3744, 2489, 6964, 2437, 2771, 5778, 2322, 3725, 2808, 2314,
];

const NCI_IMAGE_IDS = [
  10623, 10584, 10573, 9881, 10486, 10611, 2306, 10597, 10599, 2423, 10541,
  2373, 13316,
];

const NOAA_ENV_URLS = [
  'https://pmel.noaa.gov/gallery/climate-weather-research-photos',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/digital-collections/collections/photo-library/3379',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/digital-collections/collections/photo-library/2282',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/media/digital-collections-photo/nur04506jpg',
];

type BatchSource = {
  name: string;
  targetDiscipline: string;
  sourceType: string;
  maxUrls: number;
  seedUrls?: string[];
  discover?: () => Promise<string[]>;
};

type SourceRun = {
  name: string;
  targetDiscipline: string;
  discoveredUrlCount: number;
  processedUrlCount: number;
  createdCaseCount: number;
  urls: string[];
  errors: string[];
};

const BATCH_SOURCES: BatchSource[] = [
  {
    name: 'NCI Visuals Online',
    targetDiscipline: '医学',
    sourceType: 'official_medical_visual_library',
    maxUrls: 13,
    seedUrls: NCI_IMAGE_IDS.map(id => `https://visualsonline.cancer.gov/details.cfm?imageid=${id}`),
  },
  {
    name: 'NIGMS Image and Video Gallery',
    targetDiscipline: '医学',
    sourceType: 'official_science_image_gallery',
    maxUrls: 21,
    seedUrls: NIGMS_IMAGE_IDS.map(id => `https://www.nigms.nih.gov/image-gallery/${id}`),
  },
  {
    name: 'NOAA PMEL Climate-Weather Research Photos',
    targetDiscipline: '环境科学',
    sourceType: 'official_lab_photo_gallery',
    maxUrls: 1,
    seedUrls: ['https://pmel.noaa.gov/gallery/climate-weather-research-photos'],
  },
  {
    name: 'NOAA Digital Collections Photo Library',
    targetDiscipline: '环境科学',
    sourceType: 'official_photo_collection',
    maxUrls: NOAA_ENV_URLS.length,
    seedUrls: NOAA_ENV_URLS,
  },
  {
    name: 'USGS Landsat Multimedia',
    targetDiscipline: '环境科学',
    sourceType: 'official_media_collection',
    maxUrls: 8,
    discover: async () => {
      const source = await prisma.crawlSource.findFirst({ where: { name: 'USGS Landsat Multimedia' } });
      if (!source) throw new Error('Missing source: USGS Landsat Multimedia');
      const links = await discoverLinks(source.url, 40, 4);
      return links.map(link => link.url).filter(url => /\/media\/images\//i.test(url));
    },
  },
];

async function tagProcessedCases(sourceUrls: string[], targetDiscipline: string, sourceName: string) {
  await prisma.visualCase.updateMany({
    where: { sourceUrl: { in: sourceUrls } },
    data: {
      discipline: targetDiscipline,
      reviewStatus: 'needs_review',
      manualNotes: `补缺专项医学环境批次初筛：${sourceName} / ${targetDiscipline}`,
    },
  });
}

async function runSource(config: BatchSource): Promise<SourceRun> {
  const source = await prisma.crawlSource.findFirst({ where: { name: config.name } });
  if (!source) throw new Error(`Missing source: ${config.name}`);

  const discovered = config.seedUrls || await config.discover?.() || [];
  const seen = new Set<string>();
  const urls = discovered.filter(url => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, config.maxUrls);

  const processedUrls: string[] = [];
  const errors: string[] = [];
  let createdCaseCount = 0;

  for (const url of urls) {
    const existing = await prisma.visualCase.count({ where: { sourceUrl: url } });
    if (existing > 0) {
      errors.push(`Skipped existing sourceUrl: ${url}`);
      continue;
    }

    const result = await processSingleUrl(url, source.name, source.sourceType || config.sourceType);
    processedUrls.push(url);
    createdCaseCount += result.createdCaseCount;
    for (const err of result.errors.slice(0, 10)) {
      errors.push(`${url} :: ${err}`);
    }
  }

  await tagProcessedCases(processedUrls, config.targetDiscipline, config.name);

  return {
    name: config.name,
    targetDiscipline: config.targetDiscipline,
    discoveredUrlCount: discovered.length,
    processedUrlCount: processedUrls.length,
    createdCaseCount,
    urls: processedUrls,
    errors,
  };
}

async function writeReport(startedAt: Date, beforeTotal: number, runs: SourceRun[]) {
  const afterTotal = await prisma.visualCase.count();
  const newCases = await prisma.visualCase.findMany({
    where: { createdAt: { gte: startedAt } },
    select: {
      id: true,
      caseTitle: true,
      pageTitle: true,
      sourceDomain: true,
      sourceUrl: true,
      discipline: true,
      mediaType: true,
      contentType: true,
      reviewStatus: true,
      collectionScore: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const byDiscipline = await prisma.visualCase.groupBy({
    by: ['discipline'],
    where: { createdAt: { gte: startedAt } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const byDomain = await prisma.visualCase.groupBy({
    by: ['sourceDomain'],
    where: { createdAt: { gte: startedAt } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const lines = [
    '# 国际非 Nature 补缺 Batch 3 医学环境入库报告',
    '',
    `开始时间：${startedAt.toISOString()}`,
    `总量变化：${beforeTotal} -> ${afterTotal}（新增 ${afterTotal - beforeTotal}）`,
    '',
    '## 来源执行结果',
    '',
    '| 来源 | 目标学科 | 发现 URL | 处理 URL | 新增案例 |',
    '|---|---|---:|---:|---:|',
    ...runs.map(run => `|${run.name}|${run.targetDiscipline}|${run.discoveredUrlCount}|${run.processedUrlCount}|${run.createdCaseCount}|`),
    '',
    '## 新增学科分布',
    '',
    '| 学科 | 新增数 |',
    '|---|---:|',
    ...byDiscipline.map(item => `|${item.discipline || '(空)'}|${item._count.id}|`),
    '',
    '## 新增来源域名分布',
    '',
    '| 域名 | 新增数 |',
    '|---|---:|',
    ...byDomain.map(item => `|${item.sourceDomain || '(空)'}|${item._count.id}|`),
    '',
    '## 新增案例样例',
    '',
    '| 标题 | 学科 | 类型 | 内容 | 来源 | 状态 | 分数 |',
    '|---|---|---|---|---|---|---:|',
    ...newCases.slice(0, 50).map(c => {
      const title = (c.caseTitle || c.pageTitle || c.id).replace(/\|/g, '/').slice(0, 80);
      return `|${title}|${c.discipline || ''}|${c.mediaType || ''}|${c.contentType || ''}|${c.sourceDomain}|${c.reviewStatus}|${c.collectionScore}|`;
    }),
    '',
    '## 错误与跳过',
    '',
    ...runs.flatMap(run => [
      `### ${run.name}`,
      '',
      run.errors.length ? run.errors.slice(0, 80).map(err => `- ${err}`).join('\n') : '- 无',
      '',
    ]),
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-med-env-batch-ingest-report-2026-05-31.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Medical/environment batch report written to ${reportPath}`);
}

async function main() {
  const startedAt = new Date();
  const beforeTotal = await prisma.visualCase.count();
  const runs: SourceRun[] = [];

  for (const source of BATCH_SOURCES) {
    console.log(`[gap-med-env] Running ${source.name}`);
    const run = await runSource(source);
    runs.push(run);
    console.log(`[gap-med-env] ${source.name}: created ${run.createdCaseCount} from ${run.processedUrlCount} urls`);
  }

  await writeReport(startedAt, beforeTotal, runs);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
