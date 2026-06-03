import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { processSingleUrl } from './crawler/runUrlCrawl.js';

const prisma = new PrismaClient();

const NOAA_URLS = [
  'https://prod-01-alb-www-noaa.woc.noaa.gov/noaa-collections/photo-library/nur04506jpg',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/noaa-collections/collections/photo-library/3379',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/noaa-collections/collections/photo-library/2282',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/noaa-collections/collections/photo-library/2366',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/noaa-collections/collections/photo-library/2720',
  'https://prod-01-alb-www-noaa.woc.noaa.gov/noaa-collections/collections/photo-library/3394',
];

async function tagProcessedCases(sourceUrls: string[]) {
  await prisma.visualCase.updateMany({
    where: { sourceUrl: { in: sourceUrls } },
    data: {
      discipline: '环境科学',
      reviewStatus: 'needs_review',
      manualNotes: '补缺专项 NOAA Digital 直达页补充：环境科学',
    },
  });
}

async function main() {
  const startedAt = new Date();
  const beforeTotal = await prisma.visualCase.count();
  const source = await prisma.crawlSource.findFirst({ where: { name: 'NOAA Digital Collections Photo Library' } });
  if (!source) throw new Error('Missing source: NOAA Digital Collections Photo Library');

  const processedUrls: string[] = [];
  const errors: string[] = [];
  let createdCaseCount = 0;

  for (const url of NOAA_URLS) {
    const existing = await prisma.visualCase.count({ where: { sourceUrl: url } });
    if (existing > 0) {
      errors.push(`Skipped existing sourceUrl: ${url}`);
      continue;
    }
    const result = await processSingleUrl(url, source.name, source.sourceType);
    processedUrls.push(url);
    createdCaseCount += result.createdCaseCount;
    for (const err of result.errors.slice(0, 12)) {
      errors.push(`${url} :: ${err}`);
    }
  }

  await tagProcessedCases(processedUrls);

  const afterTotal = await prisma.visualCase.count();
  const newCases = await prisma.visualCase.findMany({
    where: { createdAt: { gte: startedAt } },
    select: {
      caseTitle: true,
      pageTitle: true,
      sourceDomain: true,
      discipline: true,
      mediaType: true,
      contentType: true,
      reviewStatus: true,
      collectionScore: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const lines = [
    '# 国际非 Nature 补缺 NOAA 环境补充报告',
    '',
    `开始时间：${startedAt.toISOString()}`,
    `总量变化：${beforeTotal} -> ${afterTotal}（新增 ${afterTotal - beforeTotal}，脚本创建 ${createdCaseCount}）`,
    '',
    '## 新增案例样例',
    '',
    '| 标题 | 学科 | 类型 | 内容 | 来源 | 状态 | 分数 |',
    '|---|---|---|---|---|---|---:|',
    ...newCases.map(c => {
      const title = (c.caseTitle || c.pageTitle || '').replace(/\|/g, '/').slice(0, 80);
      return `|${title}|${c.discipline || ''}|${c.mediaType || ''}|${c.contentType || ''}|${c.sourceDomain}|${c.reviewStatus}|${c.collectionScore}|`;
    }),
    '',
    '## 错误与跳过',
    '',
    ...errors.map(err => `- ${err}`),
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-noaa-supplement-report-2026-05-31.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`NOAA supplement report written to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
