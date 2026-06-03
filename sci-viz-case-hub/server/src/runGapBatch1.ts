import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { discoverLinks } from './crawler/discoverLinks.js';
import { processSingleUrl } from './crawler/runUrlCrawl.js';

const prisma = new PrismaClient();

type BatchSource = {
  name: string;
  targetDiscipline: string;
  sourceType: string;
  maxUrls: number;
  minCreated: number;
  urlFilter?: (url: string) => boolean;
  seedUrls?: string[];
};

const BATCH_SOURCES: BatchSource[] = [
  {
    name: 'NIGMS Image and Video Gallery',
    targetDiscipline: '医学',
    sourceType: 'official_science_image_gallery',
    maxUrls: 14,
    minCreated: 12,
    urlFilter: url => /\/image-gallery\/\d+$/i.test(url),
  },
  {
    name: 'NASA Earth Observatory',
    targetDiscipline: '环境科学',
    sourceType: 'official_media_collection',
    maxUrls: 16,
    minCreated: 12,
    urlFilter: url => /\/earth\/earth-observatory\//i.test(url),
  },
  {
    name: 'USGS Landsat Multimedia',
    targetDiscipline: '环境科学',
    sourceType: 'official_media_collection',
    maxUrls: 12,
    minCreated: 8,
    urlFilter: url => /\/media\/images\//i.test(url),
  },
  {
    name: 'CDC Public Health Image Library',
    targetDiscipline: '医学',
    sourceType: 'official_public_health_image_library',
    maxUrls: 6,
    minCreated: 4,
    seedUrls: [
      'https://wwwn.cdc.gov/phil/group_researchers.aspx',
      'https://wwwn.cdc.gov/phil/group_publichealth.aspx',
      'https://wwwn.cdc.gov/phil/group_healthcareproviders.aspx',
    ],
  },
];

type SourceRun = {
  name: string;
  targetDiscipline: string;
  discoveredUrlCount: number;
  processedUrlCount: number;
  createdCaseCount: number;
  urls: string[];
  errors: string[];
};

async function discoverBatchUrls(sourceName: string, filter?: (url: string) => boolean): Promise<string[]> {
  const source = await prisma.crawlSource.findFirst({ where: { name: sourceName } });
  if (!source) throw new Error(`Missing source: ${sourceName}`);

  const links = await discoverLinks(source.url, 40, 3);
  const urls = links.map(link => link.url);
  return filter ? urls.filter(filter) : urls;
}

async function updateCreatedCaseFallbacks(sourceUrls: string[], targetDiscipline: string, sourceName: string) {
  await prisma.visualCase.updateMany({
    where: {
      sourceUrl: { in: sourceUrls },
      OR: [{ discipline: '' }, { discipline: '不确定' }],
    },
    data: {
      discipline: targetDiscipline,
      reviewStatus: 'needs_review',
      manualNotes: `补缺专项初筛：${sourceName} / ${targetDiscipline}`,
    },
  });
}

async function runSource(config: BatchSource): Promise<SourceRun> {
  const source = await prisma.crawlSource.findFirst({ where: { name: config.name } });
  if (!source) throw new Error(`Missing source: ${config.name}`);

  const discovered = config.seedUrls || await discoverBatchUrls(config.name, config.urlFilter);
  const seen = new Set<string>();
  const urls = discovered.filter(url => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  }).slice(0, config.maxUrls);

  const errors: string[] = [];
  let createdCaseCount = 0;
  const processedUrls: string[] = [];

  for (const url of urls) {
    const existing = await prisma.visualCase.count({ where: { sourceUrl: url } });
    if (existing > 0) {
      errors.push(`Skipped existing sourceUrl: ${url}`);
      continue;
    }

    const result = await processSingleUrl(url, source.name, source.sourceType || config.sourceType);
    processedUrls.push(url);
    createdCaseCount += result.createdCaseCount;
    for (const err of result.errors.slice(0, 8)) {
      errors.push(`${url} :: ${err}`);
    }
  }

  await updateCreatedCaseFallbacks(processedUrls, config.targetDiscipline, config.name);

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
    '# 国际非 Nature 补缺 Batch 1 入库报告',
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
    ...newCases.slice(0, 40).map(c => {
      const title = (c.caseTitle || c.pageTitle || c.id).replace(/\|/g, '/').slice(0, 80);
      return `|${title}|${c.discipline || ''}|${c.mediaType || ''}|${c.contentType || ''}|${c.sourceDomain}|${c.reviewStatus}|${c.collectionScore}|`;
    }),
    '',
    '## 错误与跳过',
    '',
    ...runs.flatMap(run => [
      `### ${run.name}`,
      '',
      run.errors.length ? run.errors.slice(0, 40).map(err => `- ${err}`).join('\n') : '- 无',
      '',
    ]),
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-batch1-ingest-report-2026-05-31.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Batch report written to ${reportPath}`);
}

async function main() {
  const startedAt = new Date();
  const beforeTotal = await prisma.visualCase.count();
  const runs: SourceRun[] = [];

  for (const source of BATCH_SOURCES) {
    console.log(`[gap-batch1] Running ${source.name}`);
    const run = await runSource(source);
    runs.push(run);
    console.log(`[gap-batch1] ${source.name}: created ${run.createdCaseCount} from ${run.processedUrlCount} urls`);
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
