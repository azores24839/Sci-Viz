import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { discoverLinks } from './crawler/discoverLinks.js';
import { processSingleUrl } from './crawler/runUrlCrawl.js';
import { SJTU_VISUAL_SOURCES } from './seedSjtuVisualSources.js';

const prisma = new PrismaClient();

type SourceRun = {
  name: string;
  school: string;
  discipline: string;
  discoveredUrlCount: number;
  processedUrlCount: number;
  createdCaseCount: number;
  dryRun: boolean;
  urls: string[];
  errors: string[];
};

function getNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const parsed = parseInt(raw.split('=').slice(1).join('='), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getStringArg(name: string): string {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.split('=').slice(1).join('=') : '';
}

function matchesOnly(name: string, school: string, only: string) {
  if (!only) return true;
  const haystack = `${name} ${school}`.toLowerCase();
  return only
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
    .some(item => haystack.includes(item));
}

async function tagProcessedCases(sourceUrls: string[], discipline: string, school: string, sourceName: string) {
  if (sourceUrls.length === 0) return;
  const urlVariants = Array.from(new Set(sourceUrls.flatMap(url => {
    const withoutSlash = url.replace(/\/$/, '');
    return [url, withoutSlash, `${withoutSlash}/`];
  })));

  await prisma.visualCase.updateMany({
    where: {
      OR: [
        { sourceUrl: { in: urlVariants } },
        { userHint: { contains: sourceName } },
      ],
    },
    data: {
      discipline,
      reviewStatus: 'needs_review',
      manualNotes: [
        `SJTU 高质量科研可视化补强批次：${school}`,
        `source: ${sourceName}`,
        'quality_focus: non_news_gallery_or_technical_visual',
      ].join('\n'),
    },
  });
}

async function waitForAnalysisToSettle(runs: SourceRun[], timeoutMs = 30000) {
  const urls = Array.from(new Set(runs.flatMap(run => run.urls).flatMap(url => {
    const withoutSlash = url.replace(/\/$/, '');
    return [url, withoutSlash, `${withoutSlash}/`];
  })));
  if (urls.length === 0) return;

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pending = await prisma.visualCase.count({
      where: {
        sourceUrl: { in: urls },
        reviewStatus: { in: ['pending_ai_analysis'] },
      },
    });
    if (pending === 0) return;
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

async function retagCompletedRuns(runs: SourceRun[]) {
  for (const run of runs) {
    if (!run.dryRun) {
      await tagProcessedCases(run.urls, run.discipline, run.school, run.name);
    }
  }
}

async function runSource(config: (typeof SJTU_VISUAL_SOURCES)[number], execute: boolean, maxLinks: number, maxPages: number): Promise<SourceRun> {
  const source = await prisma.crawlSource.findFirst({ where: { name: config.name } });
  if (!source) throw new Error(`Missing CrawlSource: ${config.name}. Run npm run sjtu:seed-visual-sources first.`);

  const errors: string[] = [];
  let discovered: string[] = [];

  if (config.seedUrls?.length) {
    discovered = config.seedUrls;
  } else {
    try {
      const links = await discoverLinks(source.url, maxLinks, maxPages);
      discovered = links.map(link => link.url);
    } catch (err) {
      errors.push(`Discovery failed: ${(err as Error).message}`);
    }
  }

  const urls = Array.from(new Set(discovered)).slice(0, maxLinks);
  const processedUrls: string[] = [];
  let createdCaseCount = 0;

  if (execute) {
    for (const url of urls) {
      const existing = await prisma.visualCase.count({ where: { sourceUrl: url } });
      if (existing > 0) {
        errors.push(`Skipped existing sourceUrl: ${url}`);
        continue;
      }

      const result = await processSingleUrl(url, source.name, source.sourceType || config.sourceType);
      processedUrls.push(url);
      createdCaseCount += result.createdCaseCount;
      for (const err of result.errors.slice(0, 12)) {
        errors.push(`${url} :: ${err}`);
      }
    }

  }

  return {
    name: config.name,
    school: config.school,
    discipline: config.discipline,
    discoveredUrlCount: discovered.length,
    processedUrlCount: execute ? processedUrls.length : 0,
    createdCaseCount,
    dryRun: !execute,
    urls: execute ? processedUrls : urls,
    errors,
  };
}

async function writeReport(startedAt: Date, beforeTotal: number, runs: SourceRun[]) {
  const afterTotal = await prisma.visualCase.count();
  const batchWhere = {
    createdAt: { gte: startedAt },
    OR: [
      { manualNotes: { contains: 'SJTU 高质量科研可视化补强批次' } },
      ...runs.map(run => ({ userHint: { contains: run.name } })),
    ],
  };
  const newCases = await prisma.visualCase.findMany({
    where: batchWhere,
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
      manualNotes: true,
    },
    orderBy: [{ collectionScore: 'desc' }, { createdAt: 'desc' }],
    take: 80,
  });

  const byDiscipline = await prisma.visualCase.groupBy({
    by: ['discipline'],
    where: batchWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const byDomain = await prisma.visualCase.groupBy({
    by: ['sourceDomain'],
    where: batchWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const schoolCounts = new Map<string, number>();
  for (const c of newCases) {
    const school = c.manualNotes.match(/SJTU 高质量科研可视化补强批次：([^\n]+)/)?.[1] || '(未标记)';
    schoolCounts.set(school, (schoolCounts.get(school) || 0) + 1);
  }

  const lines = [
    '# SJTU 工科学院高质量科研可视化补强批次报告',
    '',
    `开始时间：${startedAt.toISOString()}`,
    `结束时间：${new Date().toISOString()}`,
    `执行模式：${runs.some(run => !run.dryRun) ? 'execute' : 'dry-run'}`,
    `总量变化：${beforeTotal} -> ${afterTotal}（新增 ${afterTotal - beforeTotal}）`,
    '',
    '## 来源执行结果',
    '',
    '| 来源 | 目标学院 | 学科 | 发现 URL | 处理 URL | 新增案例 |',
    '|---|---|---|---:|---:|---:|',
    ...runs.map(run => `|${run.name}|${run.school}|${run.discipline}|${run.discoveredUrlCount}|${run.processedUrlCount}|${run.createdCaseCount}|`),
    '',
    '## 新增学院分布',
    '',
    '| 学院 | 新增数 |',
    '|---|---:|',
    ...Array.from(schoolCounts.entries()).sort((a, b) => b[1] - a[1]).map(([school, count]) => `|${school}|${count}|`),
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
    ...newCases.map(c => {
      const title = (c.caseTitle || c.pageTitle || c.id).replace(/\|/g, '/').slice(0, 80);
      return `|${title}|${c.discipline || ''}|${c.mediaType || ''}|${c.contentType || ''}|${c.sourceDomain}|${c.reviewStatus}|${c.collectionScore}|`;
    }),
    '',
    '## URL 与错误',
    '',
    ...runs.flatMap(run => [
      `### ${run.name}`,
      '',
      '候选/处理 URL：',
      ...run.urls.slice(0, 40).map(url => `- ${url}`),
      '',
      '错误与跳过：',
      run.errors.length ? run.errors.slice(0, 80).map(err => `- ${err}`).join('\n') : '- 无',
      '',
    ]),
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'sjtu-visual-supplement-report-2026-06-04.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`SJTU visual supplement report written to ${reportPath}`);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinks = getNumberArg('max-links', 8);
  const maxPages = getNumberArg('max-pages', 2);
  const only = getStringArg('only');
  const startedAt = new Date();
  const beforeTotal = await prisma.visualCase.count();
  const runs: SourceRun[] = [];

  const selected = SJTU_VISUAL_SOURCES.filter(source => matchesOnly(source.name, source.school, only));
  if (selected.length === 0) throw new Error(`No SJTU visual sources matched --only=${only}`);

  for (const source of selected) {
    console.log(`[sjtu-visual] ${execute ? 'Executing' : 'Dry-running'} ${source.name}`);
    const run = await runSource(source, execute, maxLinks, maxPages);
    runs.push(run);
    console.log(`[sjtu-visual] ${source.name}: discovered ${run.discoveredUrlCount}, created ${run.createdCaseCount}`);
  }

  if (execute) {
    await waitForAnalysisToSettle(runs);
    await retagCompletedRuns(runs);
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
