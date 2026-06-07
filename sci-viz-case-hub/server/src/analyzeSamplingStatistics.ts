import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.js';

type GroupId = 'sjtu' | 'domestic' | 'international' | 'enterprise' | 'other';
type AxisKey = 'functionalPurpose' | 'distributionMedium' | 'technicalMethod' | 'mediaType' | 'contentType' | 'discipline';

type CaseLite = {
  id: string;
  sourceDomain: string;
  userHint: string;
  sourceUrl: string;
  functionalPurpose: string;
  distributionMedium: string;
  technicalMethod: string;
  mediaType: string;
  contentType: string;
  discipline: string;
  reviewStatus: string;
  rating: number;
  createdAt: Date;
};

const MINIMUM_APPROVED_PER_SOURCE = 20;
const STANDARD_APPROVED_PER_SOURCE = 30;
const STRONG_APPROVED_PER_SOURCE = 50;

const AXIS_LABELS: Record<AxisKey, string> = {
  functionalPurpose: '功能用途',
  distributionMedium: '传播媒介',
  technicalMethod: '技术手段',
  mediaType: '呈现方式',
  contentType: '内容对象',
  discipline: '学科',
};

const GROUP_LABELS: Record<GroupId, string> = {
  sjtu: '交大现状',
  domestic: '国内高校',
  international: '国际研究',
  enterprise: '企业参照',
  other: '其他来源',
};

const GROUP_ORDER: GroupId[] = ['sjtu', 'domestic', 'international', 'enterprise', 'other'];
const CORE_GROUPS: GroupId[] = ['sjtu', 'domestic', 'international', 'enterprise'];
const CORE_AXES: AxisKey[] = ['functionalPurpose', 'technicalMethod', 'contentType', 'discipline'];

const SJTU_DOMAINS = new Set([
  'news.sjtu.edu.cn', 'me.sjtu.edu.cn', 'oce.sjtu.edu.cn', 'www.seiee.sjtu.edu.cn',
  'cs.sjtu.edu.cn', 'smse.sjtu.edu.cn', 'www.aero.sjtu.edu.cn', 'sese.sjtu.edu.cn',
  'scce.sjtu.edu.cn', 'bme.sjtu.edu.cn', 'phys.sjtu.edu.cn', 'math.sjtu.edu.cn',
  'biosci.sjtu.edu.cn', 'pharm.sjtu.edu.cn', 'acem.sjtu.edu.cn', 'design.sjtu.edu.cn',
  'comm.sjtu.edu.cn', 'soo.sjtu.edu.cn', 'agri.sjtu.edu.cn',
  'sklcm.sjtu.edu.cn', 'imr.sjtu.edu.cn', 'speit.sjtu.edu.cn', 'tdli.sjtu.edu.cn',
  'www.physics.sjtu.edu.cn',
]);

const INTERNATIONAL_DOMAINS = new Set([
  'www.nature.com', 'nature.com',
  'news.mit.edu', 'news.harvard.edu',
  'news.stanford.edu', 'engineering.stanford.edu',
  'newscenter.lbl.gov', 'www.mpg.de', 'images.nasa.gov',
  'public.tableau.com',
]);

const ENTERPRISE_DOMAINS = new Set([
  'www.kongsberg.com', 'www.arup.com', 'www.autodesk.com',
  'www.siemens-energy.com', 'www.rolls-royce.com', 'www.cat.com',
  'www.huawei.com', 'www.qualcomm.com', 'developer.nvidia.com', 'www.nvidia.com',
  'new.abb.com', 'www.se.com', 'www.eaton.com',
  'bostondynamics.com', 'www.fanucamerica.com',
  'research.google', 'www.microsoft.com', 'aiotlabs.microsoft.com',
  'www.asml.com', 'pr.tsmc.com', 'newsroom.arm.com', 'www.arm.com',
  'www.basf.com', 'www.corning.com', 'corporate.dow.com',
  'www.xylem.com', 'www.veolia.com', 'orsted.com',
  'www.siemens-healthineers.com', 'www.gehealthcare.com', 'news.bostonscientific.com',
  'www.airbus.com', 'boeing.mediaroom.com',
]);

function sourceDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function classifyCase(c: Pick<CaseLite, 'sourceDomain' | 'userHint'>, domesticDomains: Set<string>): GroupId {
  if (SJTU_DOMAINS.has(c.sourceDomain) || c.sourceDomain.endsWith('.sjtu.edu.cn')) return 'sjtu';
  if (String(c.userHint || '').includes('/ enterprise') || ENTERPRISE_DOMAINS.has(c.sourceDomain)) return 'enterprise';
  if (INTERNATIONAL_DOMAINS.has(c.sourceDomain)) return 'international';
  if (domesticDomains.has(c.sourceDomain) || /\.edu\.cn$/.test(c.sourceDomain)) return 'domestic';
  return 'other';
}

function normalize(value: string): string {
  const cleaned = String(value || '').trim();
  return cleaned || '未标注';
}

function percent(part: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function round(value: number, digits = 3): string {
  return value.toFixed(digits);
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalize(keyFn(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function topRows(counts: Map<string, number>, limit = 10): Array<[string, number]> {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')).slice(0, limit);
}

function table(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell => String(cell).replace(/\|/g, '/')).join(' | ')} |`),
  ].join('\n');
}

function hhi(counts: number[]): number {
  const total = counts.reduce((acc, value) => acc + value, 0);
  if (total <= 0) return 0;
  return counts.reduce((acc, value) => {
    const p = value / total;
    return acc + p * p;
  }, 0);
}

function effectiveN(counts: number[]): number {
  const value = hhi(counts);
  return value > 0 ? 1 / value : 0;
}

function shannonEvenness(counts: number[]): number {
  const total = counts.reduce((acc, value) => acc + value, 0);
  const positive = counts.filter(value => value > 0);
  if (total <= 0 || positive.length <= 1) return positive.length === 1 ? 1 : 0;
  const entropy = positive.reduce((acc, value) => {
    const p = value / total;
    return acc - p * Math.log(p);
  }, 0);
  return entropy / Math.log(positive.length);
}

function cramersV(groups: Record<GroupId, CaseLite[]>, axis: AxisKey, groupIds: GroupId[]): { v: number; chi2: number; rows: number; cols: number; n: number } {
  const labels = new Set<string>();
  let n = 0;
  for (const groupId of groupIds) {
    for (const c of groups[groupId] || []) {
      labels.add(normalize(c[axis]));
      n++;
    }
  }
  const cols = [...labels].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const matrix = groupIds.map(groupId => {
    const counts = countBy(groups[groupId] || [], c => c[axis]);
    return cols.map(label => counts.get(label) || 0);
  });
  const rowTotals = matrix.map(row => row.reduce((acc, value) => acc + value, 0));
  const colTotals = cols.map((_, colIndex) => matrix.reduce((acc, row) => acc + row[colIndex], 0));
  let chi2 = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const expected = n > 0 ? (rowTotals[r] * colTotals[c]) / n : 0;
      if (expected > 0) {
        const observed = matrix[r][c];
        chi2 += ((observed - expected) ** 2) / expected;
      }
    }
  }
  const minDim = Math.min(groupIds.length - 1, cols.length - 1);
  return { v: n > 0 && minDim > 0 ? Math.sqrt(chi2 / (n * minDim)) : 0, chi2, rows: groupIds.length, cols: cols.length, n };
}

function distribution(cases: CaseLite[], axis: AxisKey): Map<string, number> {
  return countBy(cases, c => c[axis]);
}

function totalVariationDistance(a: Map<string, number>, b: Map<string, number>): number {
  const labels = new Set([...a.keys(), ...b.keys()]);
  const totalA = [...a.values()].reduce((acc, value) => acc + value, 0);
  const totalB = [...b.values()].reduce((acc, value) => acc + value, 0);
  if (totalA <= 0 || totalB <= 0) return 0;
  let sumAbs = 0;
  for (const label of labels) {
    sumAbs += Math.abs((a.get(label) || 0) / totalA - (b.get(label) || 0) / totalB);
  }
  return sumAbs / 2;
}

function systematicSample(items: CaseLite[], sampleSize: number): CaseLite[] {
  const sorted = items.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  if (sampleSize <= 0) return [];
  if (sorted.length <= sampleSize) return sorted;
  if (sampleSize === 1) return [sorted[Math.floor(sorted.length / 2)]];
  const step = (sorted.length - 1) / (sampleSize - 1);
  const used = new Set<number>();
  const sampled: CaseLite[] = [];
  for (let i = 0; i < sampleSize; i++) {
    let index = Math.round(i * step);
    while (used.has(index) && index < sorted.length - 1) index++;
    while (used.has(index) && index > 0) index--;
    used.add(index);
    sampled.push(sorted[index]);
  }
  return sampled;
}

function targetStatus(approved: number): string {
  if (approved >= STRONG_APPROVED_PER_SOURCE) return 'strong';
  if (approved >= STANDARD_APPROVED_PER_SOURCE) return 'standard';
  if (approved >= MINIMUM_APPROVED_PER_SOURCE) return 'minimum';
  return 'below_minimum';
}

function escapeCsv(value: string | number): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function groupRowsForCsv(rows: Array<Array<string | number>>): string {
  return rows.map(row => row.map(escapeCsv).join(',')).join('\n');
}

async function main() {
  const [cases, sources] = await Promise.all([
    prisma.visualCase.findMany({
      where: { reviewStatus: 'approved' },
      select: {
        id: true,
        sourceDomain: true,
        userHint: true,
        sourceUrl: true,
        functionalPurpose: true,
        distributionMedium: true,
        technicalMethod: true,
        mediaType: true,
        contentType: true,
        discipline: true,
        reviewStatus: true,
        rating: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.crawlSource.findMany({
      select: {
        name: true,
        url: true,
        sourceType: true,
        category: true,
      },
    }),
  ]);

  const domesticDomains = new Set(
    sources
      .filter(source => source.sourceType === 'university_news' || source.category === 'H' || /大学|新闻网/.test(source.name))
      .map(source => sourceDomainFromUrl(source.url))
      .filter(Boolean)
      .filter(domain => !domain.endsWith('.sjtu.edu.cn')),
  );

  const groups = Object.fromEntries(GROUP_ORDER.map(group => [group, []])) as Record<GroupId, CaseLite[]>;
  for (const c of cases) {
    groups[classifyCase(c, domesticDomains)].push(c);
  }

  const domainCounts = countBy(cases, c => c.sourceDomain);
  const minimumDomains = new Set([...domainCounts.entries()].filter(([, count]) => count >= MINIMUM_APPROVED_PER_SOURCE).map(([domain]) => domain));
  const standardDomains = new Set([...domainCounts.entries()].filter(([, count]) => count >= STANDARD_APPROVED_PER_SOURCE).map(([domain]) => domain));
  const balancedN = Math.min(STANDARD_APPROVED_PER_SOURCE, Math.min(...[...minimumDomains].map(domain => domainCounts.get(domain) || 0)));
  const minimumBalanced = [...minimumDomains].flatMap(domain => systematicSample(cases.filter(c => c.sourceDomain === domain), balancedN));
  const standardBalanced = [...standardDomains].flatMap(domain => systematicSample(cases.filter(c => c.sourceDomain === domain), STANDARD_APPROVED_PER_SOURCE));

  const groupOverview = GROUP_ORDER.map(group => {
    const groupCases = groups[group];
    const counts = countBy(groupCases, c => c.sourceDomain);
    const values = [...counts.values()];
    const largest = topRows(counts, 1)[0];
    return [
      GROUP_LABELS[group],
      groupCases.length,
      counts.size,
      largest ? `${largest[0]} (${percent(largest[1], groupCases.length)})` : '-',
      round(hhi(values), 3),
      round(effectiveN(values), 1),
      round(shannonEvenness(values), 3),
    ];
  });

  const effectRows = CORE_AXES.map(axis => {
    const full = cramersV(groups, axis, CORE_GROUPS);
    const balancedGroups = Object.fromEntries(GROUP_ORDER.map(group => [group, []])) as Record<GroupId, CaseLite[]>;
    for (const c of standardBalanced) balancedGroups[classifyCase(c, domesticDomains)].push(c);
    const balanced = cramersV(balancedGroups, axis, CORE_GROUPS);
    return [
      AXIS_LABELS[axis],
      full.n,
      round(full.v, 3),
      balanced.n,
      round(balanced.v, 3),
      full.v >= 0.3 ? '强' : full.v >= 0.2 ? '中' : full.v >= 0.1 ? '弱' : '很弱',
    ];
  });

  const driftRows = CORE_AXES.map(axis => {
    const fullDist = distribution(cases.filter(c => CORE_GROUPS.includes(classifyCase(c, domesticDomains))), axis);
    const minimumDist = distribution(minimumBalanced.filter(c => CORE_GROUPS.includes(classifyCase(c, domesticDomains))), axis);
    const standardDist = distribution(standardBalanced.filter(c => CORE_GROUPS.includes(classifyCase(c, domesticDomains))), axis);
    const fullTop = topRows(fullDist, 3).map(([label, count]) => `${label} ${percent(count, [...fullDist.values()].reduce((acc, v) => acc + v, 0))}`).join(' / ');
    const standardTop = topRows(standardDist, 3).map(([label, count]) => `${label} ${percent(count, [...standardDist.values()].reduce((acc, v) => acc + v, 0))}`).join(' / ');
    return [
      AXIS_LABELS[axis],
      round(totalVariationDistance(fullDist, minimumDist), 3),
      round(totalVariationDistance(fullDist, standardDist), 3),
      fullTop,
      standardTop,
    ];
  });

  const domainWeightRows = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([domain, count]) => {
      const domainCases = cases.filter(c => c.sourceDomain === domain);
      const group = classifyCase(domainCases[0], domesticDomains);
      const fullShare = count / cases.length;
      const equalDomainWeight = minimumDomains.has(domain) ? 1 / minimumDomains.size : 0;
      const caseWeight = minimumDomains.has(domain) ? equalDomainWeight / count : 0;
      return [
        GROUP_LABELS[group],
        domain,
        count,
        targetStatus(count),
        `${(fullShare * 100).toFixed(2)}%`,
        equalDomainWeight ? `${(equalDomainWeight * 100).toFixed(2)}%` : '0.00%',
        round(caseWeight, 6),
      ];
    });

  const replenishmentRows = [...domainCounts.entries()]
    .map(([domain, count]) => {
      const group = classifyCase(cases.find(c => c.sourceDomain === domain) || cases[0], domesticDomains);
      const toMinimum = Math.max(MINIMUM_APPROVED_PER_SOURCE - count, 0);
      const toStandard = Math.max(STANDARD_APPROVED_PER_SOURCE - count, 0);
      const toStrong = Math.max(STRONG_APPROVED_PER_SOURCE - count, 0);
      return [GROUP_LABELS[group], domain, count, targetStatus(count), toMinimum, toStandard, toStrong];
    })
    .filter(row => row[3] !== 'strong')
    .sort((a, b) => {
      const statusRank: Record<string, number> = { below_minimum: 0, minimum: 1, standard: 2, strong: 3 };
      return statusRank[String(a[3])] - statusRank[String(b[3])] || Number(b[6]) - Number(a[6]);
    })
    .slice(0, 40);

  const axisDistributionRows: Array<Array<string | number>> = [['scope', 'axis', 'label', 'count', 'share']];
  for (const [scope, scopeCases] of [
    ['full_core', cases.filter(c => CORE_GROUPS.includes(classifyCase(c, domesticDomains)))],
    ['minimum_balanced_core', minimumBalanced.filter(c => CORE_GROUPS.includes(classifyCase(c, domesticDomains)))],
    ['standard_balanced_core', standardBalanced.filter(c => CORE_GROUPS.includes(classifyCase(c, domesticDomains)))],
  ] as Array<[string, CaseLite[]]>) {
    for (const axis of CORE_AXES) {
      const dist = distribution(scopeCases, axis);
      const total = [...dist.values()].reduce((acc, value) => acc + value, 0);
      for (const [label, count] of topRows(dist, 100)) {
        axisDistributionRows.push([scope, AXIS_LABELS[axis], label, count, percent(count, total)]);
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const report = `# Sampling Statistical Analysis - ${today}

## Executive Summary

- 当前 approved 案例为 ${cases.length} 条；正式比较建议使用“全库 + 均衡样本”双轨。
- minimum-balanced 样本：${minimumDomains.size} 个来源，每来源 ${balancedN} 条，共 ${minimumBalanced.length} 条。
- standard-balanced 样本：${standardDomains.size} 个来源，每来源 ${STANDARD_APPROVED_PER_SOURCE} 条，共 ${standardBalanced.length} 条。
- 来源集中度最高的是国际研究组，HHI=${groupOverview.find(row => row[0] === '国际研究')?.[4]}，有效来源数约 ${groupOverview.find(row => row[0] === '国际研究')?.[5]}；这说明全库统计会明显受 Nature 影响。
- 企业参照组的有效来源数较高但单源样本薄，适合做案例谱系展示；若要做比例结论，应先补到每核心企业/域名不少于 ${MINIMUM_APPROVED_PER_SOURCE}-${STANDARD_APPROVED_PER_SOURCE} 条。

## 来源集中度

HHI 越高代表越集中；有效来源数可以理解为“按当前分布折算后相当于多少个均衡来源”。

${table(['来源组', 'approved', '域名数', '最大来源', 'HHI', '有效来源数', '均匀度'], groupOverview)}

## 组间差异效应量

Cramer's V 用于衡量来源组与分类轴之间的关联强度。这里不把 p 值作为重点，因为样本量较大时微小差异也容易显著；更适合看效应量。

${table(['分类轴', '全库N', '全库V', '均衡N', '均衡V', '解释'], effectRows)}

## 全库与均衡样本分布偏移

TVD 为 0 表示两种口径分布一致，越接近 1 表示越不同。若某轴 TVD 较高，报告中应同时展示全库与均衡样本。

${table(['分类轴', 'minimum TVD', 'standard TVD', '全库前三', 'standard前三'], driftRows)}

## 补采优先级

${table(['来源组', 'sourceDomain', 'approved', '状态', '补到20', '补到30', '补到50'], replenishmentRows)}

## 统计执行建议

1. 报告正文使用 standard-balanced 作为主要比较样本，保留全库作为背景案例池。
2. 对国际研究组，任何“总体比例”都要注明 Nature 占比高；最好单独报告 Nature 与非 Nature 两套结果。
3. 对企业参照组，当前更适合做视觉策略归纳，不适合直接和高校组做比例强比较；先补 ZEISS、Boston Scientific、NVIDIA、Microsoft、ASML、Airbus、Siemens Healthineers 等核心域名。
4. 对交大组，综合新闻已足够，但学院/中心域名偏薄；如果研究问题是“学院视觉传播能力”，应按学院补采，而不是只继续抓 news.sjtu.edu.cn。
5. 方法章节建议写明：案例池用于覆盖多样性，均衡样本用于统计比较，来源低于 ${MINIMUM_APPROVED_PER_SOURCE} 条不单独作比例结论。
`;

  const docsDir = path.resolve(process.cwd(), '..', 'docs');
  await mkdir(docsDir, { recursive: true });
  const reportPath = path.join(docsDir, `sampling-statistical-analysis-${today}.md`);
  const weightsPath = path.join(docsDir, `sampling-domain-weights-${today}.csv`);
  const axisPath = path.join(docsDir, `sampling-axis-distributions-${today}.csv`);

  await writeFile(reportPath, report, 'utf8');
  await writeFile(weightsPath, [
    ['group', 'sourceDomain', 'approved', 'status', 'fullPoolShare', 'equalDomainShareIfEligible', 'caseWeightIfEligible'].map(escapeCsv).join(','),
    groupRowsForCsv(domainWeightRows),
  ].join('\n'), 'utf8');
  await writeFile(axisPath, groupRowsForCsv(axisDistributionRows), 'utf8');

  console.log(report);
  console.log(`\nReport written to ${reportPath}`);
  console.log(`Domain weights written to ${weightsPath}`);
  console.log(`Axis distributions written to ${axisPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
