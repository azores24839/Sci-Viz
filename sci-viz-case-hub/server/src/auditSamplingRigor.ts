import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.js';

type GroupId = 'sjtu' | 'domestic' | 'international' | 'enterprise' | 'other';

type CaseLite = {
  id: string;
  sourceDomain: string;
  userHint: string;
  sourceUrl: string;
  discipline: string;
  reviewStatus: string;
  rating: number;
  createdAt: Date;
};

type SourceLite = {
  id: number;
  name: string;
  url: string;
  category: string;
  sourceType: string;
  enabled: boolean;
  crawlStatus: string;
  crawlTier: string;
  notes: string;
  jobs: Array<{
    status: string;
    totalCount: number;
    crawledCount: number;
    newCases: number;
    createdAt: Date;
  }>;
};

const MINIMUM_APPROVED_PER_SOURCE = 20;
const STANDARD_APPROVED_PER_SOURCE = 30;
const STRONG_APPROVED_PER_SOURCE = 50;
const ARTICLE_PROTOCOL_TARGET = 200;

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

const GROUP_LABELS: Record<GroupId, string> = {
  sjtu: '交大现状',
  domestic: '国内高校',
  international: '国际研究',
  enterprise: '企业参照',
  other: '其他来源',
};

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
  if (domesticDomains.has(c.sourceDomain)) return 'domestic';
  if (/\.edu\.cn$/.test(c.sourceDomain)) return 'domestic';
  return 'other';
}

function classifySource(source: SourceLite, domesticDomains: Set<string>): GroupId {
  const domain = sourceDomainFromUrl(source.url);
  if (SJTU_DOMAINS.has(domain) || domain.endsWith('.sjtu.edu.cn') || /上海交通大学|SJTU/i.test(source.name)) return 'sjtu';
  if (ENTERPRISE_DOMAINS.has(domain) || /enterprise|企业|商业化|customer|case stud/i.test(`${source.sourceType} ${source.name} ${source.notes}`)) return 'enterprise';
  if (INTERNATIONAL_DOMAINS.has(domain)) return 'international';
  if (domesticDomains.has(domain) || source.sourceType === 'university_news' || source.category === 'H' || /\.edu\.cn$/.test(domain)) return 'domestic';
  return 'other';
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) || '(empty)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percent(part: number, total: number): string {
  if (total <= 0) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function table(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell => String(cell).replace(/\|/g, '/')).join(' | ')} |`),
  ].join('\n');
}

function topRows(counts: Map<string, number>, limit = 12): Array<[string, number]> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit);
}

function targetStatus(approved: number): string {
  if (approved >= STRONG_APPROVED_PER_SOURCE) return 'strong';
  if (approved >= STANDARD_APPROVED_PER_SOURCE) return 'standard';
  if (approved >= MINIMUM_APPROVED_PER_SOURCE) return 'minimum';
  return 'below_minimum';
}

function recommendedAction(approved: number): string {
  if (approved >= STRONG_APPROVED_PER_SOURCE) return '可进入全量/均衡双轨分析';
  if (approved >= STANDARD_APPROVED_PER_SOURCE) return `可进入标准分层分析；补 ${STRONG_APPROVED_PER_SOURCE - approved} 条达 strong`;
  if (approved >= MINIMUM_APPROVED_PER_SOURCE) return `可做保守比较；补 ${STANDARD_APPROVED_PER_SOURCE - approved} 条达 standard`;
  return `优先补 ${MINIMUM_APPROVED_PER_SOURCE - approved} 条达 minimum`;
}

function systematicSample(items: CaseLite[], sampleSize: number): CaseLite[] {
  const sorted = items.slice().sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });
  if (sampleSize <= 0) return [];
  if (sorted.length <= sampleSize) return sorted;
  if (sampleSize === 1) return [sorted[Math.floor(sorted.length / 2)]];

  const sampled: CaseLite[] = [];
  const step = (sorted.length - 1) / (sampleSize - 1);
  const used = new Set<number>();
  for (let i = 0; i < sampleSize; i++) {
    let index = Math.round(i * step);
    while (used.has(index) && index < sorted.length - 1) index++;
    while (used.has(index) && index > 0) index--;
    used.add(index);
    sampled.push(sorted[index]);
  }
  return sampled;
}

function escapeCsv(value: string | number | Date): string {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

function makeSampleCsv(rows: Array<CaseLite & { group: GroupId }>): string {
  const headers = ['sampleGroup', 'caseId', 'sourceDomain', 'discipline', 'rating', 'reviewStatus', 'createdAt', 'sourceUrl'];
  return [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => [
      GROUP_LABELS[row.group],
      row.id,
      row.sourceDomain,
      row.discipline,
      row.rating,
      row.reviewStatus,
      row.createdAt,
      row.sourceUrl,
    ].map(escapeCsv).join(',')),
  ].join('\n');
}

async function main() {
  const [cases, sources] = await Promise.all([
    prisma.visualCase.findMany({
      select: {
        id: true,
        sourceDomain: true,
        userHint: true,
        sourceUrl: true,
        discipline: true,
        reviewStatus: true,
        rating: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.crawlSource.findMany({
      include: {
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            status: true,
            totalCount: true,
            crawledCount: true,
            newCases: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const domesticDomains = new Set(
    sources
      .filter(source => source.sourceType === 'university_news' || source.category === 'H' || /大学|新闻网/.test(source.name))
      .map(source => sourceDomainFromUrl(source.url))
      .filter(Boolean)
      .filter(domain => !domain.endsWith('.sjtu.edu.cn')),
  );

  const nonRejected = cases.filter(c => c.reviewStatus !== 'rejected');
  const approved = cases.filter(c => c.reviewStatus === 'approved');

  const casesByGroup = new Map<GroupId, CaseLite[]>();
  const approvedByGroup = new Map<GroupId, CaseLite[]>();
  for (const group of Object.keys(GROUP_LABELS) as GroupId[]) {
    casesByGroup.set(group, []);
    approvedByGroup.set(group, []);
  }
  for (const c of nonRejected) {
    const group = classifyCase(c, domesticDomains);
    casesByGroup.get(group)?.push(c);
    if (c.reviewStatus === 'approved') approvedByGroup.get(group)?.push(c);
  }

  const groupRows = (Object.keys(GROUP_LABELS) as GroupId[]).map(group => {
    const groupCases = casesByGroup.get(group) || [];
    const groupApproved = approvedByGroup.get(group) || [];
    const domainCounts = countBy(groupApproved, c => c.sourceDomain);
    const domainValues = [...domainCounts.values()];
    const top = topRows(domainCounts, 1)[0];
    const topShare = top ? percent(top[1], groupApproved.length) : '0.0%';
    const eligible = domainValues.filter(value => value >= MINIMUM_APPROVED_PER_SOURCE).length;
    const low = domainValues.filter(value => value > 0 && value < MINIMUM_APPROVED_PER_SOURCE).length;
    return [
      GROUP_LABELS[group],
      groupCases.length,
      groupApproved.length,
      domainCounts.size,
      eligible,
      low,
      median(domainValues).toFixed(1),
      top ? `${top[0]} (${topShare})` : '-',
    ];
  });

  const sourceRows = sources.map(source => {
    const domain = sourceDomainFromUrl(source.url);
    const group = classifySource(source, domesticDomains);
    const sourceApproved = approved.filter(c => {
      if (domain && c.sourceDomain === domain) return true;
      return source.name && c.userHint.includes(source.name);
    });
    const latestJob = source.jobs[0];
    const crawledArticles = sum(source.jobs.map(job => job.crawledCount));
    return {
      source,
      domain,
      group,
      approvedCount: sourceApproved.length,
      totalCount: nonRejected.filter(c => {
        if (domain && c.sourceDomain === domain) return true;
        return source.name && c.userHint.includes(source.name);
      }).length,
      crawledArticles,
      latestJob,
      status: targetStatus(sourceApproved.length),
      action: recommendedAction(sourceApproved.length),
    };
  });

  const priorityRows = sourceRows
    .filter(row => row.group !== 'other' && row.source.enabled)
    .sort((a, b) => {
      const statusRank = { below_minimum: 0, minimum: 1, standard: 2, strong: 3 } as Record<string, number>;
      return statusRank[a.status] - statusRank[b.status]
        || a.approvedCount - b.approvedCount
        || a.source.name.localeCompare(b.source.name, 'zh-CN');
    })
    .slice(0, 30)
    .map(row => [
      GROUP_LABELS[row.group],
      row.source.name,
      row.domain || '-',
      row.approvedCount,
      row.crawledArticles,
      row.status,
      row.action,
    ]);

  const groupDomainTables = (Object.keys(GROUP_LABELS) as GroupId[])
    .filter(group => group !== 'other')
    .map(group => {
      const counts = countBy(approvedByGroup.get(group) || [], c => c.sourceDomain);
      return [
        `### ${GROUP_LABELS[group]} approved 来源分布`,
        table(
          ['sourceDomain', 'approved', 'status', '建议'],
          topRows(counts, 20).map(([domain, count]) => [domain, count, targetStatus(count), recommendedAction(count)]),
        ),
      ].join('\n\n');
    })
    .join('\n\n');

  const disciplineRows = topRows(countBy(approved, c => c.discipline || '未标注'), 20)
    .map(([discipline, count]) => [discipline, count, percent(count, approved.length)]);

  const statusRows = topRows(countBy(cases, c => c.reviewStatus || '未标注'), 20)
    .map(([status, count]) => [status, count, percent(count, cases.length)]);

  const allApprovedDomainCounts = countBy(approved, c => c.sourceDomain);
  const eligibleDomainCounts = [...allApprovedDomainCounts.values()].filter(count => count >= MINIMUM_APPROVED_PER_SOURCE);
  const balancedN = eligibleDomainCounts.length > 0 ? Math.min(STANDARD_APPROVED_PER_SOURCE, Math.min(...eligibleDomainCounts)) : 0;
  const balancedDomainCount = eligibleDomainCounts.length;
  const balancedSampleSize = balancedN * balancedDomainCount;
  const standardDomains = new Set([...allApprovedDomainCounts.entries()]
    .filter(([, count]) => count >= STANDARD_APPROVED_PER_SOURCE)
    .map(([domain]) => domain));
  const minimumDomains = new Set([...allApprovedDomainCounts.entries()]
    .filter(([, count]) => count >= MINIMUM_APPROVED_PER_SOURCE)
    .map(([domain]) => domain));

  function makeBalancedRows(domains: Set<string>, nPerDomain: number): Array<CaseLite & { group: GroupId }> {
    const rows: Array<CaseLite & { group: GroupId }> = [];
    for (const domain of [...domains].sort((a, b) => a.localeCompare(b))) {
      const domainCases = approved.filter(c => c.sourceDomain === domain);
      const sampled = systematicSample(domainCases, nPerDomain);
      for (const c of sampled) {
        rows.push({ ...c, group: classifyCase(c, domesticDomains) });
      }
    }
    return rows.sort((a, b) => a.group.localeCompare(b.group) || a.sourceDomain.localeCompare(b.sourceDomain) || a.createdAt.getTime() - b.createdAt.getTime());
  }

  const minimumBalancedRows = makeBalancedRows(minimumDomains, balancedN);
  const standardBalancedRows = makeBalancedRows(standardDomains, STANDARD_APPROVED_PER_SOURCE);

  const today = new Date().toISOString().slice(0, 10);
  const report = `# Sampling Rigor Audit - ${today}

## 结论摘要

- 当前案例池共有 ${cases.length} 条，非 rejected 案例 ${nonRejected.length} 条，approved 案例 ${approved.length} 条。
- 建议继续把数据库定位为“案例池”，正式分析另设“均衡分析样本”。这样不会浪费现有大样本，也能避免大来源支配结论。
- 当前可执行的均衡样本口径：从 approved 且每域名不少于 ${MINIMUM_APPROVED_PER_SOURCE} 条的来源中，按每来源 ${balancedN} 条抽样；预计覆盖 ${balancedDomainCount} 个来源、${balancedSampleSize} 条案例。
- 同时导出两份可复现 CSV：minimum-balanced 覆盖 ${minimumDomains.size} 个来源、${minimumBalancedRows.length} 条；standard-balanced 覆盖 ${standardDomains.size} 个来源、${standardBalancedRows.length} 条。
- 对公众号/文章型来源，采样强度仍建议记录为“每单位 ${ARTICLE_PROTOCOL_TARGET} 篇文章”；对现有站点型来源，用 approved 案例数分为 below_minimum / minimum / standard / strong 四档。

## 判定规则

${table(
  ['层级', 'approved 案例数/来源', '用途'],
  [
    ['below_minimum', `< ${MINIMUM_APPROVED_PER_SOURCE}`, '只能作为线索或案例展示，不单独写比例结论'],
    ['minimum', `${MINIMUM_APPROVED_PER_SOURCE}-${STANDARD_APPROVED_PER_SOURCE - 1}`, '可做保守比较，需要在文中提示样本较小'],
    ['standard', `${STANDARD_APPROVED_PER_SOURCE}-${STRONG_APPROVED_PER_SOURCE - 1}`, '可进入分层比较和来源间对照'],
    ['strong', `>= ${STRONG_APPROVED_PER_SOURCE}`, '可用于稳定趋势判断，并进入全库/均衡双轨报告'],
  ],
)}

## 来源组概览

${table(
  ['来源组', '非 rejected', 'approved', 'approved 域名数', '>=20 域名', '<20 域名', '域名中位数', '最大来源'],
  groupRows,
)}

## 下一轮补采优先级

${table(
  ['来源组', '来源', '域名', 'approved', '已爬文章/URL', '状态', '建议动作'],
  priorityRows,
)}

## 学科分布

${table(['学科', 'approved', '占比'], disciplineRows)}

## 审核状态分布

${table(['reviewStatus', '案例数', '占比'], statusRows)}

${groupDomainTables}

## 方法建议

1. 保留全库统计，但所有“整体比例”都标注为案例池结果。
2. 正式比较使用均衡样本：先按来源组，再按 sourceDomain 或学院/企业/机构单元分层，每层抽取同样数量。
3. 同时报告全库结果和均衡样本结果。若两者一致，结论较稳；若不一致，说明来源结构本身影响视觉谱系。
4. 对国内公众号继续记录“每学院 200 篇文章”的采样强度；对现有库补充 CrawlJob 的 crawledCount 或在报告中记录固定时间范围/栏目入口。
5. below_minimum 来源优先补到 ${MINIMUM_APPROVED_PER_SOURCE}，standard 以下来源优先补到 ${STANDARD_APPROVED_PER_SOURCE}，核心比较对象再补到 ${STRONG_APPROVED_PER_SOURCE}。
`;

  const docsDir = path.resolve(process.cwd(), '..', 'docs');
  await mkdir(docsDir, { recursive: true });
  const reportPath = path.join(docsDir, `sampling-rigor-audit-${today}.md`);
  const minimumCsvPath = path.join(docsDir, `sampling-rigor-minimum-balanced-sample-${today}.csv`);
  const standardCsvPath = path.join(docsDir, `sampling-rigor-standard-balanced-sample-${today}.csv`);
  await writeFile(reportPath, report, 'utf8');
  await writeFile(minimumCsvPath, makeSampleCsv(minimumBalancedRows), 'utf8');
  await writeFile(standardCsvPath, makeSampleCsv(standardBalancedRows), 'utf8');

  console.log(report);
  console.log(`\nReport written to ${reportPath}`);
  console.log(`Minimum balanced sample written to ${minimumCsvPath}`);
  console.log(`Standard balanced sample written to ${standardCsvPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
