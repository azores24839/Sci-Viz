import { Router, Request, Response } from 'express';
import type { Prisma, VisualCase } from '@prisma/client';
import { prisma } from '../prisma.js';
import { toTrimmedString } from '../utils/httpSafety.js';
import { remapImagePath } from '../services/oss.js';

export const insightsRouter = Router();

type CaseInsightFields = Pick<
  VisualCase,
  'sourceDomain' | 'mediaType' | 'contentType' | 'discipline' | 'visualStyle' | 'composition' | 'colorTone' | 'functionalPurpose' | 'distributionMedium' | 'rating' | 'reviewStatus'
>;

type DistributionItem = {
  label: string;
  count: number;
  percentage: number;
};

type CrossMatrixCell = {
  columnLabel: string;
  count: number;
  percentage: number;
};

type CrossMatrixRow = {
  rowLabel: string;
  total: number;
  cells: CrossMatrixCell[];
};

type CrossMatrix = {
  rowDimension: string;
  columnDimension: string;
  rowLabel: string;
  columnLabel: string;
  columns: string[];
  rows: CrossMatrixRow[];
};

type FilterKey = 'sourceDomain' | 'sourceName' | 'mediaType' | 'contentType' | 'discipline' | 'visualStyle' | 'composition' | 'colorTone' | 'functionalPurpose' | 'distributionMedium' | 'reviewStatus';

type DimensionKey = 'mediaType' | 'contentType' | 'discipline' | 'visualStyle' | 'composition' | 'colorTone' | 'functionalPurpose' | 'distributionMedium';

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  mediaType: '呈现方式',
  contentType: '内容类型',
  discipline: '学科',
  visualStyle: '视觉风格',
  composition: '构图',
  colorTone: '色调',
  functionalPurpose: '功能用途',
  distributionMedium: '传播媒介',
};

const DIMENSION_KEYS: DimensionKey[] = ['mediaType', 'contentType', 'discipline', 'visualStyle', 'composition', 'colorTone', 'functionalPurpose', 'distributionMedium'];

const FIELD_QUERY_ALIASES: Record<Exclude<FilterKey, 'sourceName'>, string[]> = {
  sourceDomain: ['sourceDomain', 'source_domain'],
  mediaType: ['mediaType', 'media_type'],
  contentType: ['contentType', 'content_type'],
  discipline: ['discipline'],
  visualStyle: ['visualStyle', 'visual_style'],
  composition: ['composition'],
  colorTone: ['colorTone', 'color_tone'],
  functionalPurpose: ['functionalPurpose', 'functional_purpose'],
  distributionMedium: ['distributionMedium', 'distribution_medium'],
  reviewStatus: ['reviewStatus', 'review_status'],
};

const SOURCE_NAME_ALIASES = ['sourceName', 'source_name'];
const UNKNOWN_LABEL = '未标注';
const LOW_SAMPLE_THRESHOLD = 20;

const VALID_CROSS_DIMENSIONS: DimensionKey[] = ['mediaType', 'contentType', 'discipline', 'visualStyle', 'composition', 'colorTone', 'functionalPurpose', 'distributionMedium'];

function splitValues(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function readQueryValue(query: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const raw = query[alias];
    if (typeof raw === 'string') return toTrimmedString(raw, 200);
    if (Array.isArray(raw) && typeof raw[0] === 'string') return toTrimmedString(raw[0], 200);
  }
  return '';
}

function normalizeLabel(value: string): string {
  return value.trim() || UNKNOWN_LABEL;
}

function sourceDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isUsefulLabel(label: string): boolean {
  return label !== UNKNOWN_LABEL && label !== '不确定';
}

function roundPercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function addExactFilter(
  where: Prisma.VisualCaseWhereInput,
  field: Exclude<FilterKey, 'sourceName'>,
  rawValue: string,
) {
  const values = splitValues(rawValue);
  if (values.length === 0) return;
  where[field] = values.length === 1 ? values[0] : { in: values };
}

async function makeSourceNameWhere(sourceNames: string[]): Promise<Prisma.VisualCaseWhereInput | null> {
  if (sourceNames.length === 0) return null;

  const sources = await prisma.crawlSource.findMany({
    where: { name: { in: sourceNames } },
    select: { name: true, url: true },
  });
  const sourceByName = new Map(sources.map(source => [source.name, source]));

  const titleCounts = new Map<string, number>();
  await Promise.all(sourceNames.map(async (name) => {
    titleCounts.set(name, await prisma.visualCase.count({
      where: { caseTitle: { contains: name } },
    }));
  }));

  const clauses: Prisma.VisualCaseWhereInput[] = [];
  for (const name of sourceNames) {
    const source = sourceByName.get(name);
    const domain = source ? sourceDomainFromUrl(source.url) : '';
    const userHintCount = await prisma.visualCase.count({ where: { userHint: { contains: name } } });
    if (userHintCount > 0) {
      clauses.push({ userHint: { contains: name } });
      continue;
    }

    const titleCount = titleCounts.get(name) || 0;

    if (titleCount > 0) {
      clauses.push({ caseTitle: { contains: name } });
    } else if (domain) {
      clauses.push({ sourceDomain: domain });
    } else {
      clauses.push({ caseTitle: { contains: name } });
    }
  }

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

async function buildWhere(query: Record<string, unknown>): Promise<Prisma.VisualCaseWhereInput> {
  const where: Prisma.VisualCaseWhereInput = {};
  const andClauses: Prisma.VisualCaseWhereInput[] = [];

  for (const [field, aliases] of Object.entries(FIELD_QUERY_ALIASES) as Array<[Exclude<FilterKey, 'sourceName'>, string[]]>) {
    addExactFilter(where, field, readQueryValue(query, aliases));
  }

  const sourceNameValue = readQueryValue(query, SOURCE_NAME_ALIASES);
  const sourceNames = splitValues(sourceNameValue);
  const sourceNameWhere = await makeSourceNameWhere(sourceNames);
  if (sourceNameWhere) andClauses.push(sourceNameWhere);

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  return where;
}

function makeDistribution(cases: CaseInsightFields[], field: keyof CaseInsightFields): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const item of cases) {
    const label = normalizeLabel(String(item[field] ?? ''));
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: roundPercent(count, cases.length) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
}

function makeFilterOption(values: string[]): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = normalizeLabel(value);
    if (!isUsefulLabel(label)) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: roundPercent(count, total) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
}

async function makeSourceNameOptions(sources: Array<{ name: string; url: string }>): Promise<DistributionItem[]> {
  const uniqueSources = [...new Map(
    sources
      .map(source => ({ ...source, name: source.name.trim(), domain: sourceDomainFromUrl(source.url) }))
      .filter(source => source.name)
      .map(source => [source.name, source]),
  ).values()];

  const domainCounts = await prisma.visualCase.groupBy({
    by: ['sourceDomain'],
    _count: { id: true },
  });
  const domainCountMap = new Map(domainCounts.map(item => [item.sourceDomain, item._count.id]));

  const pairs = await Promise.all(
    uniqueSources.map(async (source) => {
      const titleCount = await prisma.visualCase.count({ where: { caseTitle: { contains: source.name } } });
      return {
        label: source.name,
        count: titleCount > 0 ? titleCount : (domainCountMap.get(source.domain) || 0),
      };
    }),
  );
  const filtered = pairs.filter(item => item.count > 0);
  const total = filtered.reduce((sum, item) => sum + item.count, 0);
  return filtered
    .map(item => ({ ...item, percentage: roundPercent(item.count, total) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
}

function topUseful(distribution: DistributionItem[]): DistributionItem | undefined {
  return distribution.find(item => isUsefulLabel(item.label));
}

function secondUseful(distribution: DistributionItem[]): DistributionItem | undefined {
  return distribution.filter(item => isUsefulLabel(item.label))[1];
}

function makeCrossMatrix(
  cases: CaseInsightFields[],
  rowField: DimensionKey,
  colField: DimensionKey,
): CrossMatrix {
  const usefulCases = cases.filter(item =>
    isUsefulLabel(normalizeLabel(String(item[rowField] ?? ''))) &&
    isUsefulLabel(normalizeLabel(String(item[colField] ?? '')))
  );

  const colTotals = new Map<string, number>();
  const rowTotals = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const item of usefulCases) {
    const rowVal = normalizeLabel(String(item[rowField] ?? ''));
    const colVal = normalizeLabel(String(item[colField] ?? ''));
    colTotals.set(colVal, (colTotals.get(colVal) || 0) + 1);
    rowTotals.set(rowVal, (rowTotals.get(rowVal) || 0) + 1);
    pairCounts.set(`${rowVal}::${colVal}`, (pairCounts.get(`${rowVal}::${colVal}`) || 0) + 1);
  }

  const columns = [...colTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([label]) => label);

  const rows = [...rowTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([rowLabel, total]) => ({
      rowLabel,
      total,
      cells: columns.map(columnLabel => {
        const count = pairCounts.get(`${rowLabel}::${columnLabel}`) || 0;
        return { columnLabel, count, percentage: roundPercent(count, total) };
      }),
    }));

  return {
    rowDimension: rowField,
    columnDimension: colField,
    rowLabel: DIMENSION_LABELS[rowField],
    columnLabel: DIMENSION_LABELS[colField],
    columns,
    rows,
  };
}

function makeRatingDistribution(cases: CaseInsightFields[]): DistributionItem[] {
  const counts = new Map<number, number>();
  for (const item of cases) {
    const rating = item.rating ?? 0;
    counts.set(rating, (counts.get(rating) || 0) + 1);
  }
  const labels: Record<number, string> = {
    0: '未评分',
    1: '1 分',
    2: '2 分',
    3: '3 分',
    4: '4 分',
    5: '5 分',
  };
  return [0, 1, 2, 3, 4, 5]
    .map(rating => ({
      label: labels[rating] || `${rating} 分`,
      count: counts.get(rating) || 0,
      percentage: roundPercent(counts.get(rating) || 0, cases.length),
    }));
}

function makeScopeLabel(filters: Record<FilterKey, string>): string {
  const parts: string[] = [];
  if (filters.sourceName) parts.push(`${splitValues(filters.sourceName).join('、')} 来源`);
  else if (filters.sourceDomain) parts.push(`${splitValues(filters.sourceDomain).join('、')} 来源`);
  if (filters.discipline) parts.push(`${splitValues(filters.discipline).join('、')} 学科`);
  if (filters.mediaType) parts.push(`${splitValues(filters.mediaType).join('、')} 呈现方式`);
  if (filters.visualStyle) parts.push(`${splitValues(filters.visualStyle).join('、')} 风格`);
  if (filters.contentType) parts.push(`${splitValues(filters.contentType).join('、')} 内容类型`);
  if (filters.composition) parts.push(`${splitValues(filters.composition).join('、')} 构图`);
  if (filters.colorTone) parts.push(`${splitValues(filters.colorTone).join('、')} 色调`);
  if (filters.functionalPurpose) parts.push(`${splitValues(filters.functionalPurpose).join('、')} 功能用途`);
  if (filters.distributionMedium) parts.push(`${splitValues(filters.distributionMedium).join('、')} 传播媒介`);
  return parts.length > 0 ? parts.join(' + ') : '全部案例';
}

function makeGeneratedInsights(args: {
  totalCases: number;
  sourceCount: number;
  filters: Record<FilterKey, string>;
  media: DistributionItem[];
  discipline: DistributionItem[];
  visualStyle: DistributionItem[];
  contentType: DistributionItem[];
  composition: DistributionItem[];
  colorTone: DistributionItem[];
  functionalPurpose: DistributionItem[];
  distributionMedium: DistributionItem[];
  rating: DistributionItem[];
}): string[] {
  const { totalCases, sourceCount, filters, media, discipline, visualStyle, contentType, composition, colorTone, functionalPurpose, distributionMedium, rating } = args;
  const scope = makeScopeLabel(filters);
  const insights: string[] = [];

  if (totalCases === 0) {
    return ['基于当前样本库，当前筛选条件下暂无案例，建议放宽来源、学科或复核状态后再观察趋势。'];
  }

  if (totalCases < LOW_SAMPLE_THRESHOLD) {
    insights.push(`基于当前样本库，${scope}当前筛选样本为 ${totalCases} 条，样本量较少，结论仅供参考。`);
  }

  const topMedia = topUseful(media);
  const nextMedia = secondUseful(media);
  if (topMedia) {
    insights.push(`基于当前样本库，${scope}以"${topMedia.label}"为主要呈现方式，占比 ${topMedia.percentage.toFixed(1)}%。`);
  }

  if (topMedia && nextMedia && Math.abs(topMedia.percentage - nextMedia.percentage) <= 8) {
    insights.push(`基于当前样本库，${scope}的表达方式较均衡，"${topMedia.label}"与"${nextMedia.label}"占比接近，可作为 PPT 中的并列趋势呈现。`);
  }

  const topDiscipline = topUseful(discipline);
  if (!filters.discipline && topDiscipline) {
    insights.push(`基于当前样本库，${scope}中"${topDiscipline.label}"案例最多，占比 ${topDiscipline.percentage.toFixed(1)}%，后续可优先拆解该学科的视觉策略。`);
  }

  const topStyle = topUseful(visualStyle);
  if (topStyle) {
    insights.push(`基于当前样本库，${scope}的视觉风格以"${topStyle.label}"为主，占比 ${topStyle.percentage.toFixed(1)}%。`);
  }

  const topContent = topUseful(contentType);
  if (topContent) {
    insights.push(`基于当前样本库，${scope}最常见的内容对象是"${topContent.label}"，占比 ${topContent.percentage.toFixed(1)}%，适合转化为拍摄/制图重点。`);
  }

  const topComp = topUseful(composition);
  if (topComp && !filters.composition) {
    insights.push(`基于当前样本库，${scope}的构图以"${topComp.label}"为主，占比 ${topComp.percentage.toFixed(1)}%。`);
  }

  const topColor = topUseful(colorTone);
  if (topColor && !filters.colorTone) {
    insights.push(`基于当前样本库，${scope}的色调以"${topColor.label}"为主，占比 ${topColor.percentage.toFixed(1)}%。`);
  }

  const topFp = topUseful(functionalPurpose);
  if (topFp) {
    insights.push(`基于当前样本库，${scope}的功能用途以"${topFp.label}"为主，占比 ${topFp.percentage.toFixed(1)}%。`);
  }

  const topDm = topUseful(distributionMedium);
  if (topDm) {
    insights.push(`基于当前样本库，${scope}的传播媒介以"${topDm.label}"为主，占比 ${topDm.percentage.toFixed(1)}%。`);
  }

  const rated = rating.filter(r => r.label !== '未评分');
  if (rated.length > 0) {
    const highValue = rated.filter(r => r.label === '4 分' || r.label === '5 分').reduce((s, r) => s + r.count, 0);
    if (highValue > 0) {
      insights.push(`基于当前样本库，${scope}中有 ${highValue} 条高价值案例（4-5 分），可优先用于案例拆解和风格分析。`);
    }
  }

  if (sourceCount > 1 && !filters.sourceDomain && !filters.sourceName) {
    insights.push(`基于当前样本库，当前统计覆盖 ${sourceCount} 个来源，适合做跨来源对比；若用于 PPT，可继续筛选单一来源查看更明确的风格差异。`);
  }

  return insights.slice(0, 5);
}

async function makeFilterOptions() {
  const [cases, crawlSources] = await Promise.all([
    prisma.visualCase.findMany({
      select: {
        sourceDomain: true,
        mediaType: true,
        contentType: true,
        discipline: true,
        visualStyle: true,
        composition: true,
        colorTone: true,
        functionalPurpose: true,
        distributionMedium: true,
        reviewStatus: true,
      },
    }),
    prisma.crawlSource.findMany({ select: { name: true, url: true } }),
  ]);

  return {
    sourceDomain: makeFilterOption(cases.map(item => item.sourceDomain)),
    sourceName: await makeSourceNameOptions(crawlSources),
    mediaType: makeFilterOption(cases.map(item => item.mediaType)),
    contentType: makeFilterOption(cases.map(item => item.contentType)),
    discipline: makeFilterOption(cases.map(item => item.discipline)),
    visualStyle: makeFilterOption(cases.map(item => item.visualStyle)),
    composition: makeFilterOption(cases.map(item => item.composition)),
    colorTone: makeFilterOption(cases.map(item => item.colorTone)),
    functionalPurpose: makeFilterOption(cases.map(item => item.functionalPurpose)),
    distributionMedium: makeFilterOption(cases.map(item => item.distributionMedium)),
    reviewStatus: makeFilterOption(cases.map(item => item.reviewStatus)),
  };
}

function parseDimensionParam(value: string | undefined, validDimensions: DimensionKey[], fallback: DimensionKey): DimensionKey {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  for (const dim of validDimensions) {
    if (dim.toLowerCase() === normalized) return dim;
  }
  return fallback;
}

insightsRouter.get('/insights/summary', async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, unknown>;
    const filters: Record<FilterKey, string> = {
      sourceDomain: readQueryValue(query, FIELD_QUERY_ALIASES.sourceDomain),
      sourceName: readQueryValue(query, SOURCE_NAME_ALIASES),
      mediaType: readQueryValue(query, FIELD_QUERY_ALIASES.mediaType),
      contentType: readQueryValue(query, FIELD_QUERY_ALIASES.contentType),
      discipline: readQueryValue(query, FIELD_QUERY_ALIASES.discipline),
      visualStyle: readQueryValue(query, FIELD_QUERY_ALIASES.visualStyle),
      composition: readQueryValue(query, FIELD_QUERY_ALIASES.composition),
      colorTone: readQueryValue(query, FIELD_QUERY_ALIASES.colorTone),
      functionalPurpose: readQueryValue(query, FIELD_QUERY_ALIASES.functionalPurpose),
      distributionMedium: readQueryValue(query, FIELD_QUERY_ALIASES.distributionMedium),
      reviewStatus: readQueryValue(query, FIELD_QUERY_ALIASES.reviewStatus),
    };

    const rowDimension = parseDimensionParam(
      typeof query.rowDimension === 'string' ? query.rowDimension : undefined,
      VALID_CROSS_DIMENSIONS,
      'discipline',
    );
    const colDimension = parseDimensionParam(
      typeof query.colDimension === 'string' ? query.colDimension : undefined,
      VALID_CROSS_DIMENSIONS,
      'mediaType',
    );

    const where = await buildWhere(query);
    const [cases, filterOptions] = await Promise.all([
      prisma.visualCase.findMany({
        where,
        select: {
          sourceDomain: true,
          mediaType: true,
          contentType: true,
          discipline: true,
          visualStyle: true,
          composition: true,
          colorTone: true,
          functionalPurpose: true,
          distributionMedium: true,
          rating: true,
          reviewStatus: true,
        },
      }),
      makeFilterOptions(),
    ]);

    const selectedSourceCount = splitValues(filters.sourceName).length;
    const sourceCount = selectedSourceCount > 0
      ? selectedSourceCount
      : new Set(cases.map(item => item.sourceDomain).filter(Boolean)).size;

    const distributions = {
      mediaType: makeDistribution(cases, 'mediaType'),
      discipline: makeDistribution(cases, 'discipline'),
      visualStyle: makeDistribution(cases, 'visualStyle'),
      contentType: makeDistribution(cases, 'contentType'),
      composition: makeDistribution(cases, 'composition'),
      colorTone: makeDistribution(cases, 'colorTone'),
      functionalPurpose: makeDistribution(cases, 'functionalPurpose'),
      distributionMedium: makeDistribution(cases, 'distributionMedium'),
    };

    const crossMatrix = makeCrossMatrix(cases, rowDimension, colDimension);
    const ratingDistribution = makeRatingDistribution(cases);

    const leadingMediaType = topUseful(distributions.mediaType)?.label || '';
    const leadingDiscipline = topUseful(distributions.discipline)?.label || '';
    const leadingVisualStyle = topUseful(distributions.visualStyle)?.label || '';

    res.json({
      success: true,
      data: {
        filters,
        filterOptions,
        totalCases: cases.length,
        sourceCount,
        leadingMediaType,
        leadingDiscipline,
        leadingVisualStyle,
        distributions,
        crossMatrix,
        ratingDistribution,
        allDimensions: DIMENSION_KEYS.map(key => ({ key, label: DIMENSION_LABELS[key] })),
        generatedInsights: makeGeneratedInsights({
          totalCases: cases.length,
          sourceCount,
          filters,
          media: distributions.mediaType,
          discipline: distributions.discipline,
          visualStyle: distributions.visualStyle,
          contentType: distributions.contentType,
          composition: distributions.composition,
          colorTone: distributions.colorTone,
          functionalPurpose: distributions.functionalPurpose,
          distributionMedium: distributions.distributionMedium,
          rating: ratingDistribution,
        }),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── Three-column comparison endpoint ──────────────────────────────────

const COMPARISON_GROUPS: Record<string, { id: string; label: string; domains: string[] }> = {
  sjtu: {
    id: 'sjtu',
    label: '交大现状',
    domains: [
      'news.sjtu.edu.cn', 'me.sjtu.edu.cn', 'oce.sjtu.edu.cn', 'www.seiee.sjtu.edu.cn',
      'cs.sjtu.edu.cn', 'smse.sjtu.edu.cn', 'www.aero.sjtu.edu.cn', 'sese.sjtu.edu.cn',
      'scce.sjtu.edu.cn', 'bme.sjtu.edu.cn', 'phys.sjtu.edu.cn', 'math.sjtu.edu.cn',
      'biosci.sjtu.edu.cn', 'pharm.sjtu.edu.cn', 'acem.sjtu.edu.cn', 'design.sjtu.edu.cn',
      'comm.sjtu.edu.cn', 'soo.sjtu.edu.cn', 'agri.sjtu.edu.cn',
      'sklcm.sjtu.edu.cn', 'imr.sjtu.edu.cn', 'speit.sjtu.edu.cn', 'tdli.sjtu.edu.cn',
      'www.physics.sjtu.edu.cn',
    ],
  },
  domestic: {
    id: 'domestic',
    label: '国内顶尖高校',
    domains: [],
  },
  international: {
    id: 'international',
    label: '国际研究',
    domains: [
      'www.nature.com', 'news.mit.edu', 'news.harvard.edu', 'newscenter.lbl.gov',
      'www.mpg.de', 'images.nasa.gov', 'nature.com',
    ],
  },
  enterprise: {
    id: 'enterprise',
    label: '头部企业',
    domains: [
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
    ],
  },
};

const SJTU_SCHOOLS = [
  { id: 'all', label: '全部交大', discipline: '', domains: COMPARISON_GROUPS.sjtu.domains },
  { id: 'oce', label: '船舶海洋与建筑工程学院', discipline: '工程', domains: ['oce.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'me', label: '机械与动力工程学院', discipline: '工程', domains: ['me.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'seiee', label: '电子信息与电气工程学院', discipline: '信息科学', domains: ['www.seiee.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'ee', label: '电气工程学院', discipline: '工程', domains: ['www.seiee.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'auto', label: '自动化与感知学院', discipline: '信息科学', domains: ['www.seiee.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'cs', label: '计算机学院', discipline: '信息科学', domains: ['cs.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'ic', label: '集成电路学院', discipline: '信息科学', domains: ['www.seiee.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'smse', label: '材料科学与工程学院', discipline: '材料', domains: ['smse.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'sese', label: '环境科学与工程学院', discipline: '环境科学', domains: ['sese.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'bme', label: '生物医学工程学院', discipline: '医学', domains: ['bme.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
  { id: 'aero', label: '航空航天学院', discipline: '工程', domains: ['www.aero.sjtu.edu.cn', 'news.sjtu.edu.cn'] },
];

type ComparisonGroupId = 'sjtu' | 'domestic' | 'international' | 'enterprise';

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function enterpriseNameFromHint(userHint: string): string {
  return userHint
    .replace(/\s*\/\s*enterprise\s*$/i, '')
    .trim() || '未标注企业';
}

function makeEnterpriseCommercialSignals(cases: any[]) {
  const signals = [
    {
      key: 'applicationScenario',
      label: '应用场景化',
      patterns: [/case-stud(y|ies)|customer-stor(y|ies)|success-stor(y|ies)|industr(y|ies)|applications?|use-cases?|现场|场景|客户|行业|应用/i],
    },
    {
      key: 'productSolution',
      label: '产品/解决方案绑定',
      patterns: [/solutions?|products?|platform|service|system|demo|product-demo|解决方案|产品|平台|系统|设备|服务/i],
    },
    {
      key: 'performanceEvidence',
      label: '性能指标或成果可视化',
      patterns: [/performance|result|impact|efficien|faster|reduc|increase|improv|%|times|x\s|指标|效率|提升|降低|成果/i],
    },
    {
      key: 'brandNarrative',
      label: '品牌化叙事',
      patterns: [/innovation|leadership|customer|success|story|brand|partner|trusted|商业|宣传|客户|成功|合作|标杆/i],
    },
    {
      key: 'conversionPath',
      label: '商业转化路径',
      patterns: [/contact|request|demo|download|sales|quote|trial|white-?paper|learn-more|咨询|下载|演示|试用|报价/i],
    },
    {
      key: 'audienceOriented',
      label: '面向客户/行业受众',
      patterns: [/customers?|industr(y|ies)|market|business|enterprise|healthcare|manufacturing|energy|客户|行业|市场|企业|制造|能源|医疗/i],
    },
  ];

  const counts = signals.map(signal => ({ key: signal.key, label: signal.label, count: 0, percentage: 0 }));
  let dynamicOrRendered = 0;

  for (const c of cases) {
    const text = [
      c.sourceUrl, c.pageTitle, c.caseTitle, c.contextText, c.mediaType, c.contentType,
      c.visualStyle, c.functionalPurpose, c.distributionMedium, c.mediaSubType, c.contentSubType,
    ].filter(Boolean).join(' ');

    counts.forEach((signal, index) => {
      if (includesAny(text, signals[index].patterns)) signal.count++;
    });

    if (/视频|动图|交互|3D|3d|render|渲染|demo|simulation/i.test(text)) {
      dynamicOrRendered++;
    }
  }

  const total = cases.length;
  const enriched = counts
    .map(item => ({
      ...item,
      percentage: total > 0 ? Math.round((item.count / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  enriched.push({
    key: 'dynamicOrRendered',
    label: '动图/视频/3D/演示潜力',
    count: dynamicOrRendered,
    percentage: total > 0 ? Math.round((dynamicOrRendered / total) * 1000) / 10 : 0,
  });

  return {
    total,
    signals: enriched,
    sourceBreakdown: makeDistribution(cases.map(c => ({
      sourceDomain: '',
      mediaType: enterpriseNameFromHint(c.userHint || ''),
      contentType: '',
      discipline: '',
      visualStyle: '',
      composition: '',
      colorTone: '',
      functionalPurpose: '',
      distributionMedium: '',
      rating: 0,
      reviewStatus: '',
    })), 'mediaType').slice(0, 16),
    summary: total === 0
      ? '企业商业化样本仍待采集。'
      : `企业组当前有 ${total} 条 approved 样本，商业化信号最高的是「${enriched[0]?.label || '待判断'}」，适合作为科研成果转译成行业场景、产品方案和客户价值表达的参照。`,
  };
}

function scoreEnterpriseSample(c: any): number {
  const text = [
    c.sourceUrl, c.pageTitle, c.caseTitle, c.contextText, c.mediaType, c.contentType,
    c.visualStyle, c.functionalPurpose, c.distributionMedium,
  ].filter(Boolean).join(' ');
  let score = 0;
  if (/case-stud(y|ies)|customer-stor(y|ies)|success-stor(y|ies)/i.test(text)) score += 80;
  if (/solutions?|products?|platform|application|use-cases?|industr(y|ies)/i.test(text)) score += 35;
  if (/performance|result|impact|efficien|faster|increase|improv|%|指标|效率|提升|成果/i.test(text)) score += 20;
  if (/www\.nvidia\.com|www\.cat\.com|www\.microsoft\.com|aiotlabs\.microsoft\.com|www\.arm\.com|www\.airbus\.com|www\.xylem\.com|news\.bostonscientific\.com/i.test(c.sourceDomain || '')) score += 14;
  if (/podcast|interview|meet-|meet\s|profile|headshot|人物|肖像|播客|访谈|合影/i.test(text)) score -= 35;
  if (/developer\.nvidia\.com/i.test(c.sourceDomain || '')) score -= 12;
  if (/research\.google/i.test(c.sourceDomain || '')) score -= 50;
  return score;
}

function pickEnterpriseSamples(cases: any[], limit: number): any[] {
  const buckets = new Map<string, any[]>();
  const prioritized = cases.filter(c => scoreEnterpriseSample(c) > 0);
  const fallback = cases.filter(c => scoreEnterpriseSample(c) <= 0);
  for (const c of prioritized) {
    const key = c.sourceDomain || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const orderedDomains = [...buckets.entries()]
    .sort((a, b) => scoreEnterpriseSample(b[1][0]) - scoreEnterpriseSample(a[1][0]))
    .map(([domain]) => domain);

  const result: any[] = [];
  while (result.length < limit && orderedDomains.length > 0) {
    let addedThisRound = false;
    for (const domain of orderedDomains) {
      const bucket = buckets.get(domain) || [];
      const next = bucket.shift();
      if (!next) continue;
      result.push(next);
      addedThisRound = true;
      if (result.length >= limit) break;
    }
    if (!addedThisRound) break;
  }

  if (result.length < limit) {
    result.push(...fallback.slice(0, limit - result.length));
  }

  return result;
}

insightsRouter.get('/insights/comparison', async (req: Request, res: Response) => {
  try {
    const school = toTrimmedString(req.query.school as string, 100) || '';
    const discipline = toTrimmedString(req.query.discipline as string, 200) || '';
    const dimension = toTrimmedString(req.query.dimension as string, 200) || 'mediaType';

    let effectiveDiscipline = discipline;
    let schoolLabel = '';
    let sjtuDomains = COMPARISON_GROUPS.sjtu.domains;

    if (school) {
      const schoolObj = SJTU_SCHOOLS.find(s => s.id === school);
      if (!schoolObj) {
        res.status(400).json({ success: false, error: `Unknown school: ${school}` });
        return;
      }
      schoolLabel = schoolObj.label;
      sjtuDomains = schoolObj.domains;
      if (!effectiveDiscipline && schoolObj.discipline) {
        effectiveDiscipline = schoolObj.discipline;
      }
    }

    const validDimensions: DimensionKey[] = ['mediaType', 'contentType', 'visualStyle', 'functionalPurpose', 'distributionMedium'];
    const dimKey: DimensionKey = validDimensions.includes(dimension as DimensionKey) ? (dimension as DimensionKey) : 'mediaType';
    const dimLabel = DIMENSION_LABELS[dimKey] || dimension;

    const where: Prisma.VisualCaseWhereInput = effectiveDiscipline
      ? { discipline: effectiveDiscipline, reviewStatus: 'approved' }
      : { reviewStatus: 'approved' };

    const cases = await prisma.visualCase.findMany({
      where,
      select: { id: true, sourceDomain: true, sourceUrl: true, pageTitle: true, caseTitle: true, contextText: true, userHint: true, mediaType: true, contentType: true, visualStyle: true, discipline: true, functionalPurpose: true, distributionMedium: true, mediaSubType: true, contentSubType: true, thumbnailPath: true, imagePath: true, imageUrl: true, [dimKey]: true },
    });

    const SJTU_DOMAINS = new Set(sjtuDomains);

    const domesticSources = await prisma.crawlSource.findMany({
      where: { category: 'H', enabled: true },
      select: { url: true },
    });
    const domesticBaseDomains = new Set<string>();
    for (const src of domesticSources) {
      try { domesticBaseDomains.add(new URL(src.url).hostname); } catch { }
    }
    COMPARISON_GROUPS.domestic.domains = [...domesticBaseDomains];

    const SAMPLES_PER_GROUP = 8;

    const groups = Object.values(COMPARISON_GROUPS).map((group) => {
      const domainSet = group.id === 'sjtu' ? SJTU_DOMAINS : new Set(group.domains);
      const groupCases = cases
        .filter((c: any) => group.id === 'enterprise'
          ? String(c.userHint || '').includes('/ enterprise') || domainSet.has(c.sourceDomain)
          : domainSet.has(c.sourceDomain))
        .sort((a: any, b: any) => group.id === 'enterprise' ? scoreEnterpriseSample(b) - scoreEnterpriseSample(a) : 0);
      const total = groupCases.length;

      const countMap = new Map<string, number>();
      for (const c of groupCases) {
        const val = (c as any)[dimKey] || '不确定';
        countMap.set(val, (countMap.get(val) || 0) + 1);
      }

      const distribution = [...countMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({
          label,
          count,
          percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        }));

      const sampled = group.id === 'enterprise'
        ? pickEnterpriseSamples(groupCases, SAMPLES_PER_GROUP)
        : total <= SAMPLES_PER_GROUP
        ? groupCases
        : (() => {
            const buckets = new Map<string, any[]>();
            for (const c of groupCases) {
              const val = (c as any)[dimKey] || '不确定';
              if (!buckets.has(val)) buckets.set(val, []);
              buckets.get(val)!.push(c);
            }
            const result: any[] = [];
            const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
            for (const [, bucket] of sorted) {
              for (const c of bucket) {
                if (result.length < SAMPLES_PER_GROUP) result.push(c);
              }
            }
            return result.slice(0, SAMPLES_PER_GROUP);
          })();

      const samples = sampled.map((c: any) => ({
        id: c.id,
        title: c.caseTitle || c.mediaType,
        thumbnail: remapImagePath(c.thumbnailPath) || remapImagePath(c.imagePath) || c.imageUrl || '',
        sourceUrl: c.sourceUrl,
        sourceDomain: c.sourceDomain,
        mediaType: c.mediaType,
        contentType: c.contentType,
        visualStyle: c.visualStyle,
      }));

      const label = group.id === 'sjtu' && schoolLabel ? schoolLabel : group.label;

      return {
        id: group.id as ComparisonGroupId,
        label,
        sourceDomains: group.id === 'enterprise'
          ? [...new Set(groupCases.map((c: any) => c.sourceDomain).filter(Boolean))]
          : group.id === 'sjtu' ? [...SJTU_DOMAINS] : group.domains,
        total,
        distribution,
        samples,
      };
    });

    const subtypeCross = (() => {
      const SJTU_SET = new Set(sjtuDomains);
      const sjtuCases = cases.filter((c: any) => SJTU_SET.has(c.sourceDomain) && c.mediaSubType && c.contentSubType);
      const map = new Map<string, number>();
      const rowSet = new Set<string>();
      const colSet = new Set<string>();
      for (const c of sjtuCases) {
        const row = c.mediaSubType || '其他';
        const col = c.contentSubType || '其他';
        rowSet.add(row); colSet.add(col);
        const key = `${row}||${col}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
      const rows = [...rowSet].sort();
      const cols = [...colSet].sort();
      return {
        rows,
        columns: cols,
        matrix: rows.map(row => ({
          row,
          cells: cols.map(col => ({ col, count: map.get(`${row}||${col}`) || 0 })),
        })),
      };
    })();

    const findings = (() => {
      const result: { groupId: ComparisonGroupId; groupLabel: string; topLabel: string; topPercentage: number; summary: string }[] = [];
      const coreGroups = groups.filter(g => g.id !== 'enterprise' && g.total > 0);
      if (coreGroups.length < 2) return result;
      for (const group of coreGroups) {
        const top = group.distribution[0];
        if (!top) continue;
        const others = coreGroups.filter(g => g.id !== group.id && g.total > 0);
        const lowerThan = others.every(o => {
          const sameLabel = o.distribution.find(d => d.label === top.label);
          return !sameLabel || sameLabel.percentage < top.percentage;
        });
        if (lowerThan) {
          const label = group.id === 'sjtu' && schoolLabel ? schoolLabel : group.label;
          if (dimKey === 'mediaType') {
            result.push({ groupId: group.id as ComparisonGroupId, groupLabel: label, topLabel: top.label, topPercentage: top.percentage, summary: `在呈现方式上，${label}更偏向「${top.label}」（占比 ${top.percentage.toFixed(1)}%），与其他来源相比倾向性更为显著。` });
          } else if (dimKey === 'contentType') {
            result.push({ groupId: group.id as ComparisonGroupId, groupLabel: label, topLabel: top.label, topPercentage: top.percentage, summary: `在内容类型上，${label}更偏向「${top.label}」（占比 ${top.percentage.toFixed(1)}%），区别于其他来源的表达偏好。` });
          } else if (dimKey === 'visualStyle') {
            result.push({ groupId: group.id as ComparisonGroupId, groupLabel: label, topLabel: top.label, topPercentage: top.percentage, summary: `在视觉风格上，${label}更偏向「${top.label}」（占比 ${top.percentage.toFixed(1)}%），与其他来源的审美倾向存在差异。` });
          } else if (dimKey === 'functionalPurpose') {
            result.push({ groupId: group.id as ComparisonGroupId, groupLabel: label, topLabel: top.label, topPercentage: top.percentage, summary: `在功能用途上，${label}更偏向「${top.label}」（占比 ${top.percentage.toFixed(1)}%），反映出不同的功能定位策略。` });
          } else {
            result.push({ groupId: group.id as ComparisonGroupId, groupLabel: label, topLabel: top.label, topPercentage: top.percentage, summary: `在${dimLabel}维度上，${label}更偏向「${top.label}」（占比 ${top.percentage.toFixed(1)}%），表现出与其他来源的显著差异。` });
          }
        }
      }
      return result;
    })();

    const enterpriseCommercialSignals = makeEnterpriseCommercialSignals(
      cases.filter((c: any) => String(c.userHint || '').includes('/ enterprise') || COMPARISON_GROUPS.enterprise.domains.includes(c.sourceDomain)),
    );

    res.json({
      success: true,
      data: {
        discipline: effectiveDiscipline,
        school: school || undefined,
        dimension: dimKey,
        dimensionLabel: dimLabel,
        groups,
        findings,
        subtypeCross: subtypeCross.rows.length > 0 ? subtypeCross : null,
        enterpriseCommercialSignals,
        schools: SJTU_SCHOOLS.map(s => ({ id: s.id, label: s.label, discipline: s.discipline })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── Three-axis spectrum analysis ─────────────────────────────────────

type SpectrumDimKey = 'functionalPurpose' | 'mediaType' | 'discipline' | 'distributionMedium' | 'visualStyle' | 'contentType';
const SPECTRUM_DIMS: SpectrumDimKey[] = ['functionalPurpose', 'mediaType', 'discipline', 'distributionMedium', 'visualStyle', 'contentType'];

insightsRouter.get('/insights/three-axis-spectrum', async (req: Request, res: Response) => {
  try {
    const xDim = toTrimmedString(req.query.x as string, 100) || 'functionalPurpose';
    const yDim = toTrimmedString(req.query.y as string, 100) || 'mediaType';
    const zDim = toTrimmedString(req.query.z as string, 100) || 'discipline';

    const dims: SpectrumDimKey[] = [xDim, yDim, zDim].map(d =>
      SPECTRUM_DIMS.includes(d as SpectrumDimKey) ? (d as SpectrumDimKey) : 'functionalPurpose'
    ) as SpectrumDimKey[];

    const cases = await prisma.visualCase.findMany({
      where: { reviewStatus: 'approved' },
      select: {
        functionalPurpose: true,
        distributionMedium: true,
        mediaType: true,
        discipline: true,
        visualStyle: true,
        contentType: true,
        imageUrl: true,
        thumbnailPath: true,
      },
    });

    const useful = cases.filter(c => {
      const xv = normalizeLabel(String(c[dims[0]] ?? ''));
      const yv = normalizeLabel(String(c[dims[1]] ?? ''));
      const zv = normalizeLabel(String(c[dims[2]] ?? ''));
      return isUsefulLabel(xv) && isUsefulLabel(yv) && isUsefulLabel(zv);
    });

    const cellMap = new Map<string, number>();
    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const zSet = new Set<string>();

    for (const c of useful) {
      const xv = normalizeLabel(String(c[dims[0]] ?? ''));
      const yv = normalizeLabel(String(c[dims[1]] ?? ''));
      const zv = normalizeLabel(String(c[dims[2]] ?? ''));
      xSet.add(xv); ySet.add(yv); zSet.add(zv);
      const key = `${xv}||${yv}||${zv}`;
      cellMap.set(key, (cellMap.get(key) || 0) + 1);
    }

    const total = useful.length;

    const cells = [...cellMap.entries()].map(([key, count]) => {
      const [x, y, z] = key.split('||');
      return { x, y, z, count, percentage: roundPercent(count, total) };
    });

    const dimensionLabels: Record<string, string> = {
      functionalPurpose: '功能用途',
      distributionMedium: '传播媒介',
      mediaType: '呈现方式',
      discipline: '学科',
      visualStyle: '视觉风格',
      contentType: '内容类型',
    };

    const sortByTotal = (vals: string[], axis: 'x' | 'y' | 'z') =>
      [...vals].sort((a, b) => {
        const ca = cells.filter(ce => ce[axis] === a).reduce((s, ce) => s + ce.count, 0);
        const cb = cells.filter(ce => ce[axis] === b).reduce((s, ce) => s + ce.count, 0);
        return cb - ca;
      });

    const dmDist = new Map<string, number>();
    for (const c of useful) {
      const v = normalizeLabel(String(c.distributionMedium ?? ''));
      dmDist.set(v, (dmDist.get(v) || 0) + 1);
    }
    const staticCount = dmDist.get('静图') || 0;
    const dynamicCount = total - staticCount;

    const note = dynamicCount < 5
      ? `当前数据库${total}条有效案例中，${staticCount}条（${roundPercent(staticCount, total)}%）传播媒介为"静图"，视频/动图/交互类案例仅${dynamicCount}条。三轴频谱主要反映静态图像的分布格局，建议通过公众号/视频平台采集补充多媒体案例后再做完整对比。`
      : '';

    res.json({
      success: true,
      data: {
        dimensions: [
          { axis: dims[0], label: dimensionLabels[dims[0]] || dims[0], values: sortByTotal([...xSet], 'x') },
          { axis: dims[1], label: dimensionLabels[dims[1]] || dims[1], values: sortByTotal([...ySet], 'y') },
          { axis: dims[2], label: dimensionLabels[dims[2]] || dims[2], values: sortByTotal([...zSet], 'z') },
        ],
        cells,
        total,
        note,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
