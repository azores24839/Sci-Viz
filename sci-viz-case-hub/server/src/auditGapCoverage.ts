import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const GAP_DOMAINS = [
  'www.nigms.nih.gov',
  'science.nasa.gov',
  'www.usgs.gov',
  'engineering.stanford.edu',
  'prod-01-alb-www-noaa.woc.noaa.gov',
];

const gapWhere: Prisma.VisualCaseWhereInput = {
  OR: [
    { sourceDomain: { in: GAP_DOMAINS } },
    { manualNotes: { contains: '补缺专项' } },
  ],
};

const directionWhere: Record<string, Prisma.VisualCaseWhereInput> = {
  医学: {
    OR: [
      { sourceDomain: 'www.nigms.nih.gov' },
      { discipline: '医学', manualNotes: { contains: '补缺专项' } },
    ],
  },
  工程: {
    OR: [
      { sourceDomain: 'engineering.stanford.edu' },
      { manualNotes: { contains: '工程批次' } },
      { discipline: '工程', manualNotes: { contains: '补缺专项' } },
    ],
  },
  环境科学: {
    OR: [
      { sourceDomain: { in: ['science.nasa.gov', 'www.usgs.gov', 'prod-01-alb-www-noaa.woc.noaa.gov'] } },
      { discipline: '环境科学', manualNotes: { contains: '补缺专项' } },
    ],
  },
};

async function groupByField(field: 'discipline' | 'contentType' | 'mediaType' | 'visualStyle' | 'sourceDomain') {
  return prisma.visualCase.groupBy({
    by: [field],
    where: gapWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
}

function tableForGroup(field: string, rows: Array<Record<string, unknown> & { _count: { id: number } }>) {
  return [
    `### ${field}`,
    '',
    '| 值 | 数量 |',
    '|---|---:|',
    ...rows.map(row => `|${String(row[field] || '(空)').replace(/\|/g, '/')}|${row._count.id}|`),
    '',
  ];
}

async function candidateRows(direction: string) {
  const rows = await prisma.visualCase.findMany({
    where: directionWhere[direction],
    select: {
      id: true,
      caseTitle: true,
      pageTitle: true,
      sourceDomain: true,
      sourceUrl: true,
      discipline: true,
      mediaType: true,
      contentType: true,
      visualStyle: true,
      collectionScore: true,
      reviewStatus: true,
    },
    orderBy: [{ collectionScore: 'desc' }, { createdAt: 'desc' }],
    take: 15,
  });

  return [
    `### ${direction}`,
    '',
    '| 标题 | 学科 | 媒体 | 内容 | 风格 | 来源 | 分数 | 状态 |',
    '|---|---|---|---|---|---|---:|---|',
    ...rows.map(row => {
      const title = (row.caseTitle || row.pageTitle || row.id).replace(/\|/g, '/').slice(0, 80);
      return `|${title}|${row.discipline || ''}|${row.mediaType || ''}|${row.contentType || ''}|${row.visualStyle || ''}|${row.sourceDomain}|${row.collectionScore}|${row.reviewStatus}|`;
    }),
    '',
  ];
}

async function main() {
  const total = await prisma.visualCase.count();
  const gapCount = await prisma.visualCase.count({ where: gapWhere });
  const domainGroups = await groupByField('sourceDomain');
  const disciplineGroups = await groupByField('discipline');
  const contentGroups = await groupByField('contentType');
  const mediaGroups = await groupByField('mediaType');
  const styleGroups = await groupByField('visualStyle');

  const lines = [
    '# 国际非 Nature 补缺覆盖审计',
    '',
    `执行时间：${new Date().toISOString()}`,
    `当前全库总量：${total}`,
    `本轮补缺重点来源/标记案例数：${gapCount}`,
    '',
    '## 新增覆盖分布',
    '',
    ...tableForGroup('sourceDomain', domainGroups),
    ...tableForGroup('discipline', disciplineGroups),
    ...tableForGroup('contentType', contentGroups),
    ...tableForGroup('mediaType', mediaGroups),
    ...tableForGroup('visualStyle', styleGroups),
    '## 高价值候选案例',
    '',
    ...await candidateRows('医学'),
    ...await candidateRows('工程'),
    ...await candidateRows('环境科学'),
    '## 执行结论',
    '',
    '- 已完成一轮实际入库，重点来源从 Nature 之外补入 NIH/NIGMS、NASA、USGS、Stanford Engineering、NOAA 等官方或权威来源。',
    '- NCI Visuals Online 与 PMEL 在当前本机抓取环境下仍需专用下载/接口适配；DOE/NREL 入口也需要后续独立适配，不建议在本轮硬抓。',
    '- 本轮优先保证来源权威性和视觉类型互补，新增数量低于 260-320 的原始目标，但避免了单一来源继续膨胀。',
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-coverage-audit-2026-05-31.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Coverage audit written to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
