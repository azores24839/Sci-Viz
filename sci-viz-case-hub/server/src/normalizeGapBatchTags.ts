import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

type Rule = {
  label: string;
  targetDiscipline: string;
  where: {
    userHint?: { contains: string };
    sourceDomain?: string;
    manualNotes?: { startsWith: string };
  };
};

const RULES: Rule[] = [
  {
    label: 'NIGMS biomedical gallery',
    targetDiscipline: '医学',
    where: { userHint: { contains: 'NIGMS Image and Video Gallery' } },
  },
  {
    label: 'NASA Earth Observatory',
    targetDiscipline: '环境科学',
    where: { userHint: { contains: 'NASA Earth Observatory' } },
  },
  {
    label: 'USGS Landsat Multimedia',
    targetDiscipline: '环境科学',
    where: { userHint: { contains: 'USGS Landsat Multimedia' } },
  },
  {
    label: 'Stanford Engineering News',
    targetDiscipline: '工程',
    where: { sourceDomain: 'engineering.stanford.edu' },
  },
  {
    label: 'MIT engineering batch',
    targetDiscipline: '工程',
    where: { manualNotes: { startsWith: '补缺专项工程批次初筛：MIT News - Research' } },
  },
  {
    label: 'NOAA Digital environment supplement',
    targetDiscipline: '环境科学',
    where: { manualNotes: { startsWith: '补缺专项 NOAA Digital 直达页补充' } },
  },
];

async function main() {
  const lines = [
    '# 国际非 Nature 补缺标签归一化报告',
    '',
    `执行时间：${new Date().toISOString()}`,
    '',
    '| 规则 | 目标学科 | 更新数 |',
    '|---|---|---:|',
  ];

  for (const rule of RULES) {
    const result = await prisma.visualCase.updateMany({
      where: rule.where,
      data: {
        discipline: rule.targetDiscipline,
        reviewStatus: 'needs_review',
        manualNotes: `补缺专项目标学科归一化：${rule.label} / ${rule.targetDiscipline}`,
      },
    });
    lines.push(`|${rule.label}|${rule.targetDiscipline}|${result.count}|`);
  }

  const byDiscipline = await prisma.visualCase.groupBy({
    by: ['discipline'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const byDomain = await prisma.visualCase.groupBy({
    by: ['sourceDomain'],
    where: {
      sourceDomain: {
        in: [
          'www.nigms.nih.gov',
          'science.nasa.gov',
          'www.usgs.gov',
          'engineering.stanford.edu',
          'news.mit.edu',
        ],
      },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  lines.push(
    '',
    '## 当前全库学科分布',
    '',
    '| 学科 | 数量 |',
    '|---|---:|',
    ...byDiscipline.map(item => `|${item.discipline || '(空)'}|${item._count.id}|`),
    '',
    '## 本轮重点来源域名数量',
    '',
    '| 域名 | 数量 |',
    '|---|---:|',
    ...byDomain.map(item => `|${item.sourceDomain || '(空)'}|${item._count.id}|`),
  );

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-batch-tag-normalization-report-2026-05-31.md');
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Normalization report written to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
