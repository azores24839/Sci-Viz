import { PrismaClient, type VisualCase } from '@prisma/client';
import fs from 'fs/promises';
import * as path from 'path';

const prisma = new PrismaClient();

const DISCIPLINE_RULES: Array<[RegExp, string]> = [
  [/医学|医疗|临床|疾病|癌|肿瘤|细胞|蛋白|基因|免疫|病毒|菌|药|health|medical|disease|cancer|cell|protein|gene|virus|immune/i, '医学'],
  [/工程|机器人|芯片|电池|传感器|设备|原型|制造|航天|机械|robot|chip|battery|sensor|device|engineering|prototype/i, '工程'],
  [/气候|生态|环境|地球|遥感|卫星|海洋|冰川|森林|landsat|climate|earth|ocean|glacier|forest|satellite/i, '环境科学'],
  [/材料|晶体|纳米|薄膜|合金|polymer|material|crystal|nano/i, '材料'],
  [/量子|物理|光子|粒子|宇宙|天文|quantum|physics|photon|particle|astronomy|space/i, '物理'],
  [/化学|催化|分子|合成|反应|chem|catalyst|molecule|synthesis/i, '化学'],
  [/算法|模型|人工智能|计算|软件|数据|AI|machine learning|algorithm|comput/i, '信息科学'],
  [/生物|植物|动物|生态|生命|biology|plant|animal|life/i, '生命科学'],
];

const CONTENT_RULES: Array<[RegExp, string]> = [
  [/显微|细胞|蛋白|分子|晶体|纳米|micro|cell|protein|molecule|crystal|nano/i, '微观样本'],
  [/设备|仪器|机器人|芯片|传感器|电池|装置|device|instrument|robot|chip|sensor|battery/i, '实验设备'],
  [/绘画肖像|手绘人物|人物插画|肖像插画|painted portrait|illustrated portrait/i, '绘画肖像'],
  [/团队|合影|多人|群体|team|group/i, '群体肖像'],
  [/研究人员|科学家|人物|肖像|scientist|researcher|portrait/i, '单人肖像'],
  [/地图|遥感|卫星|地球|海洋|冰川|森林|map|satellite|earth|ocean|glacier|forest/i, '空间环境'],
  [/模型|机制|结构|示意|路径|model|mechanism|structure|diagram|pathway/i, '机制模型'],
  [/数据|曲线|图谱|统计|chart|graph|data|plot/i, '数据结果'],
  [/实验|观测|采样|测试|experiment|test|sampling|observation/i, '实验过程'],
];

function needsValue(value: string) {
  return !value || value === '不确定';
}

function textFor(c: VisualCase) {
  return [
    c.caseTitle,
    c.pageTitle,
    c.contextText,
    c.ocrText,
    c.aiSummary,
    c.userHint,
    c.sourceDomain,
  ].filter(Boolean).join('\n');
}

function inferByRules(text: string, rules: Array<[RegExp, string]>, fallback: string) {
  return rules.find(([pattern]) => pattern.test(text))?.[1] || fallback;
}

function inferDiscipline(c: VisualCase, text: string) {
  const inferred = inferByRules(text, DISCIPLINE_RULES, '');
  if (inferred) return inferred;
  if (c.sourceDomain.includes('nature.com')) return '综合交叉';
  if (c.sourceDomain.includes('nasa') || c.sourceDomain.includes('usgs') || c.sourceDomain.includes('noaa')) return '环境科学';
  if (c.sourceDomain.includes('mit') || c.sourceDomain.includes('stanford')) return '工程';
  return '综合交叉';
}

function inferContentType(text: string) {
  return inferByRules(text, CONTENT_RULES, '科普传播');
}

function inferMediaType(c: VisualCase, text: string, contentType: string) {
  if (/显微|micro|microscopy|cell/i.test(text) || contentType === '微观样本') return '显微图';
  if (/地图|遥感|卫星|数据|曲线|图谱|map|satellite|chart|graph|data|plot/i.test(text)) return '数据可视化';
  if (/示意|diagram|illustration|schematic/i.test(text)) return '信息图';
  if (c.sourceDomain.includes('nature.com')) return '混合媒介';
  return '摄影';
}

function inferVisualStyle(c: VisualCase, text: string) {
  if (c.sourceDomain.includes('nature.com')) return '顶刊封面';
  if (/示意|教学|diagram|schematic|explainer/i.test(text)) return '教学解释';
  if (/研究人员|团队|现场|ship|field|researcher|team/i.test(text)) return '纪实';
  return '科技';
}

function fallbackTitle(c: VisualCase) {
  const title = c.pageTitle || c.aiSummary || c.sourceDomain || '科研影像案例';
  return title.replace(/\s+/g, ' ').trim().slice(0, 40);
}

async function main() {
  const startedAt = new Date();
  const cases = await prisma.visualCase.findMany({
    where: {
      OR: [
        { caseTitle: '' },
        { discipline: { in: ['', '不确定'] } },
        { mediaType: { in: ['', '不确定'] } },
        { contentType: { in: ['', '不确定'] } },
        { visualStyle: { in: ['', '不确定'] } },
      ],
    },
  });

  let updated = 0;
  const domainCounts = new Map<string, number>();

  for (const c of cases) {
    const text = textFor(c);
    const contentType = needsValue(c.contentType) ? inferContentType(text) : c.contentType;
    const data = {
      caseTitle: needsValue(c.caseTitle) ? fallbackTitle(c) : c.caseTitle,
      discipline: needsValue(c.discipline) ? inferDiscipline(c, text) : c.discipline,
      mediaType: needsValue(c.mediaType) ? inferMediaType(c, text, contentType) : c.mediaType,
      contentType,
      visualStyle: needsValue(c.visualStyle) ? inferVisualStyle(c, text) : c.visualStyle,
      reviewStatus: 'approved',
      manualNotes: [
        c.manualNotes,
        '本地规则补全核心标签：未调用外部视觉 API',
      ].filter(Boolean).join('\n'),
    };

    await prisma.visualCase.update({ where: { id: c.id }, data });
    updated++;
    domainCounts.set(c.sourceDomain || '(空)', (domainCounts.get(c.sourceDomain || '(空)') || 0) + 1);
  }

  const remaining = await prisma.visualCase.count({
    where: {
      OR: [
        { caseTitle: '' },
        { discipline: { in: ['', '不确定'] } },
        { mediaType: { in: ['', '不确定'] } },
        { contentType: { in: ['', '不确定'] } },
        { visualStyle: { in: ['', '不确定'] } },
      ],
    },
  });
  const byStatus = await prisma.visualCase.groupBy({
    by: ['reviewStatus'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  const lines = [
    '# 本地规则补全元数据报告',
    '',
    `开始时间：${startedAt.toISOString()}`,
    `结束时间：${new Date().toISOString()}`,
    '',
    `补全记录数：${updated}`,
    `剩余核心标签不完整：${remaining}`,
    '',
    '## 状态分布',
    '',
    '| 状态 | 数量 |',
    '|---|---:|',
    ...byStatus.map(row => `|${row.reviewStatus || '(空)'}|${row._count.id}|`),
    '',
    '## 补全来源分布',
    '',
    '| 来源域名 | 数量 |',
    '|---|---:|',
    ...Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]).map(([domain, count]) => `|${domain}|${count}|`),
    '',
    '说明：本报告为本地启发式补全，用于消除空标签和“不确定”状态；需要更精确语义时可在用户授权后重跑外部视觉分析。',
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'fill-incomplete-metadata-local-report-2026-05-31.md');
  await fs.writeFile(reportPath, `${lines.join('\n')}\n`);
  console.log(`Local metadata fill report written to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
