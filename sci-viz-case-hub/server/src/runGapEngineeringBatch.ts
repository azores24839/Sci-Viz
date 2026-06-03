import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { discoverLinks } from './crawler/discoverLinks.js';
import { processSingleUrl } from './crawler/runUrlCrawl.js';

const prisma = new PrismaClient();

const ENGINEERING_KEYWORDS = [
  'engineering',
  'engineer',
  'robot',
  'robotics',
  'battery',
  'batteries',
  'chip',
  'semiconductor',
  'device',
  'sensor',
  'prototype',
  'material',
  'materials',
  'manufacturing',
  'solar',
  'energy',
  'storage',
  'turbine',
  'machine',
  'mechanical',
  'electrical',
  'fabrication',
  'instrument',
];

const STANFORD_ENGINEERING_URLS = [
  'https://engineering.stanford.edu/news/new-center-unites-stanfords-robotics-expertise-under-one-roof',
  'https://engineering.stanford.edu/news/meet-few-roboticists-designing-tomorrows-technology-new-robotics-center',
  'https://engineering.stanford.edu/news/team-engineers-create-shape-changing-free-roaming-soft-robot',
  'https://engineering.stanford.edu/news/stanford-engineers-make-first-working-prototype-memory-chip-ideal-mobile-devices',
  'https://engineering.stanford.edu/news/researchers-illuminate-barrier-next-generation-battery',
  'https://engineering.stanford.edu/news/precise-imaging-helps-reveal-secrets-rechargeable-batteries',
  'https://engineering.stanford.edu/news/seeking-indestructible-battery',
  'https://engineering.stanford.edu/news/stanford-engineers-and-slac-scientists-invent-self-healing-battery-electrode',
  'https://engineering.stanford.edu/news/stanford-scientists-create-smart-lithium-ion-battery-warns-potential-fire-hazards',
  'https://engineering.stanford.edu/news/new-stanford-battery-shuts-down-high-temperatures-and-restarts-when-it-cools',
  'https://engineering.stanford.edu/news/promising-new-kind-battery-based-sodium-not-lithium',
  'https://engineering.stanford.edu/news/stanford-team-aims-improve-storage-batteries-used-cellphones-ipods-more',
];

type BatchSource = {
  name: string;
  targetDiscipline: string;
  sourceType: string;
  maxUrls: number;
  seedUrls?: string[];
  filter?: (url: string, title: string) => boolean;
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
    name: 'Stanford Engineering News',
    targetDiscipline: '工程',
    sourceType: 'university_department_news',
    maxUrls: 12,
    seedUrls: STANFORD_ENGINEERING_URLS,
  },
  {
    name: 'MIT News - Research',
    targetDiscipline: '工程',
    sourceType: 'university_research_news',
    maxUrls: 18,
    filter: (url, title) => hasEngineeringSignal(`${url} ${title}`),
  },
  {
    name: 'Berkeley Lab News Center',
    targetDiscipline: '工程',
    sourceType: 'national_lab_news',
    maxUrls: 18,
    filter: (url, title) => hasEngineeringSignal(`${url} ${title}`),
  },
];

function hasEngineeringSignal(text: string) {
  const haystack = text.toLowerCase();
  return ENGINEERING_KEYWORDS.some(keyword => haystack.includes(keyword));
}

async function discoverBatchUrls(sourceName: string, filter?: BatchSource['filter']): Promise<string[]> {
  const source = await prisma.crawlSource.findFirst({ where: { name: sourceName } });
  if (!source) throw new Error(`Missing source: ${sourceName}`);

  const links = await discoverLinks(source.url, 80, 4);
  const filtered = filter ? links.filter(link => filter(link.url, link.title)) : links;
  return filtered.map(link => link.url);
}

async function tagProcessedCases(sourceUrls: string[], targetDiscipline: string, sourceName: string) {
  await prisma.visualCase.updateMany({
    where: { sourceUrl: { in: sourceUrls } },
    data: {
      discipline: targetDiscipline,
      reviewStatus: 'needs_review',
      manualNotes: `补缺专项工程批次初筛：${sourceName} / ${targetDiscipline}`,
    },
  });
}

async function runSource(config: BatchSource): Promise<SourceRun> {
  const source = await prisma.crawlSource.findFirst({ where: { name: config.name } });
  if (!source) throw new Error(`Missing source: ${config.name}`);

  const discovered = config.seedUrls || await discoverBatchUrls(config.name, config.filter);
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
    '# 国际非 Nature 补缺 Batch 2 工程入库报告',
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
      run.errors.length ? run.errors.slice(0, 60).map(err => `- ${err}`).join('\n') : '- 无',
      '',
    ]),
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-engineering-batch-ingest-report-2026-05-31.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Engineering batch report written to ${reportPath}`);
}

async function main() {
  const startedAt = new Date();
  const beforeTotal = await prisma.visualCase.count();
  const runs: SourceRun[] = [];

  for (const source of BATCH_SOURCES) {
    console.log(`[gap-engineering] Running ${source.name}`);
    const run = await runSource(source);
    runs.push(run);
    console.log(`[gap-engineering] ${source.name}: created ${run.createdCaseCount} from ${run.processedUrlCount} urls`);
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
