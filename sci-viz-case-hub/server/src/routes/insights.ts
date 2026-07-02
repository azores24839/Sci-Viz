import { Router, Request, Response } from 'express';
import type { Prisma, VisualCase } from '@prisma/client';
import { prisma } from '../prisma.js';
import { toTrimmedString } from '../utils/httpSafety.js';
import {
  getDisciplineConfig,
  getAllDisciplineConfigs,
  DISCIPLINES,
} from '../services/disciplineConfig.js';
import type { DisciplineConfig } from '../services/disciplineConfig.js';
import { classifyEnterpriseCase, makeEnterpriseCompanyWhere } from '../services/enterpriseTaxonomy.js';

export const insightsRouter = Router();

type CaseInsightFields = Pick<
  VisualCase,
  'sourceDomain' | 'mediaType' | 'contentType' | 'discipline' | 'technicalMethod' | 'composition' | 'colorTone' | 'functionalPurpose' | 'distributionMedium' | 'rating' | 'reviewStatus'
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

type FilterKey = 'sourceDomain' | 'sourceName' | 'enterpriseCompany' | 'mediaType' | 'contentType' | 'discipline' | 'technicalMethod' | 'composition' | 'colorTone' | 'functionalPurpose' | 'distributionMedium' | 'reviewStatus';

type DimensionKey = 'mediaType' | 'contentType' | 'discipline' | 'technicalMethod' | 'composition' | 'colorTone' | 'functionalPurpose' | 'distributionMedium';
type ComparisonDimensionKey = 'functionalPurpose' | 'distributionMedium' | 'technicalMethod' | 'contentSubType' | 'mediaSubType' | 'contentType';
type ComparisonParentDimensionKey = 'functionalPurpose' | 'distributionMedium' | 'technicalMethod';
type ComparisonSampleMode = 'live' | 'balanced';

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  mediaType: '呈现方式',
  contentType: '内容类型',
  discipline: '学科',
  technicalMethod: '技术手段',
  composition: '构图',
  colorTone: '色调',
  functionalPurpose: '功能用途',
  distributionMedium: '传播媒介',
};

const COMPARISON_DIMENSION_LABELS: Record<ComparisonDimensionKey, string> = {
  functionalPurpose: '功能维度',
  distributionMedium: '媒介维度',
  technicalMethod: '技术维度',
  contentSubType: '功能细分',
  mediaSubType: '技术细分',
  contentType: '内容主题',
};

const DIMENSION_KEYS: DimensionKey[] = ['mediaType', 'contentType', 'discipline', 'technicalMethod', 'composition', 'colorTone', 'functionalPurpose', 'distributionMedium'];

const FIELD_QUERY_ALIASES: Record<Exclude<FilterKey, 'sourceName' | 'enterpriseCompany'>, string[]> = {
  sourceDomain: ['sourceDomain', 'source_domain'],
  mediaType: ['mediaType', 'media_type'],
  contentType: ['contentType', 'content_type'],
  discipline: ['discipline'],
  technicalMethod: ['technicalMethod', 'technical_method'],
  composition: ['composition'],
  colorTone: ['colorTone', 'color_tone'],
  functionalPurpose: ['functionalPurpose', 'functional_purpose'],
  distributionMedium: ['distributionMedium', 'distribution_medium'],
  reviewStatus: ['reviewStatus', 'review_status'],
};

const SOURCE_NAME_ALIASES = ['sourceName', 'source_name'];
const ENTERPRISE_COMPANY_ALIASES = ['enterpriseCompany', 'enterprise_company'];
const UNKNOWN_LABEL = '未标注';
const LOW_SAMPLE_THRESHOLD = 20;

const VALID_CROSS_DIMENSIONS: DimensionKey[] = ['mediaType', 'contentType', 'discipline', 'technicalMethod', 'composition', 'colorTone', 'functionalPurpose', 'distributionMedium'];

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

function sourceHintWhere(name: string): Prisma.VisualCaseWhereInput {
  return {
    OR: [
      { userHint: name },
      { userHint: { startsWith: `${name} /` } },
    ],
  };
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
  field: Exclude<FilterKey, 'sourceName' | 'enterpriseCompany'>,
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
  const domainCounts = new Map<string, number>();
  const enabledSources = await prisma.crawlSource.findMany({
    where: { enabled: true },
    select: { url: true },
  });
  for (const source of enabledSources) {
    const domain = sourceDomainFromUrl(source.url);
    if (!domain) continue;
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }

  const clauses: Prisma.VisualCaseWhereInput[] = [];
  for (const name of sourceNames) {
    const source = sourceByName.get(name);
    const domain = source ? sourceDomainFromUrl(source.url) : '';
    const hintWhere = sourceHintWhere(name);
    const userHintCount = await prisma.visualCase.count({ where: hintWhere });
    if (userHintCount > 0) {
      clauses.push(hintWhere);
      continue;
    }

    if (source?.url) {
      const urlWhere: Prisma.VisualCaseWhereInput = { sourceUrl: { startsWith: source.url } };
      const urlCount = await prisma.visualCase.count({ where: urlWhere });
      if (urlCount > 0) {
        clauses.push(urlWhere);
        continue;
      }
    }

    const titleWhere: Prisma.VisualCaseWhereInput = {
      OR: [
        { caseTitle: name },
        { caseTitle: { startsWith: `${name} /` } },
      ],
    };
    const titleCount = await prisma.visualCase.count({ where: titleWhere });
    if (titleCount > 0) {
      clauses.push(titleWhere);
    } else if (domain && (domainCounts.get(domain) || 0) === 1) {
      clauses.push({ sourceDomain: domain });
    }
  }

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

async function buildWhere(query: Record<string, unknown>): Promise<Prisma.VisualCaseWhereInput> {
  const where: Prisma.VisualCaseWhereInput = {};
  const andClauses: Prisma.VisualCaseWhereInput[] = [];

  for (const [field, aliases] of Object.entries(FIELD_QUERY_ALIASES) as Array<[Exclude<FilterKey, 'sourceName' | 'enterpriseCompany'>, string[]]>) {
    addExactFilter(where, field, readQueryValue(query, aliases));
  }

  const sourceNameValue = readQueryValue(query, SOURCE_NAME_ALIASES);
  const sourceNames = splitValues(sourceNameValue);
  const sourceNameWhere = await makeSourceNameWhere(sourceNames);
  if (sourceNameWhere) andClauses.push(sourceNameWhere);

  const enterpriseCompanyValue = readQueryValue(query, ENTERPRISE_COMPANY_ALIASES);
  const enterpriseCompanies = splitValues(enterpriseCompanyValue);
  const enterpriseCompanyWhere = makeEnterpriseCompanyWhere(enterpriseCompanies);
  if (enterpriseCompanyWhere) andClauses.push(enterpriseCompanyWhere);

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

  const pairs = await Promise.all(
    uniqueSources.map(async (source) => {
      const sourceWhere = await makeSourceNameWhere([source.name]);
      const count = sourceWhere ? await prisma.visualCase.count({ where: sourceWhere }) : 0;
      return {
        label: source.name,
        count,
      };
    }),
  );
  const filtered = pairs.filter(item => item.count > 0);
  const total = filtered.reduce((sum, item) => sum + item.count, 0);
  return filtered
    .map(item => ({ ...item, percentage: roundPercent(item.count, total) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
}

function makeEnterpriseCompanyOptions(cases: Array<Pick<VisualCase, 'sourceDomain' | 'sourceUrl' | 'userHint' | 'pageTitle' | 'caseTitle' | 'contextText'>>): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const c of cases) {
    const taxonomy = classifyEnterpriseCase(c);
    if (!taxonomy) continue;
    counts.set(taxonomy.companyName, (counts.get(taxonomy.companyName) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: roundPercent(count, total) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'));
}

function makeEnterprisePageTypeOptions(cases: Array<Pick<VisualCase, 'sourceDomain' | 'sourceUrl' | 'userHint' | 'pageTitle' | 'caseTitle' | 'contextText'>>): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const c of cases) {
    const taxonomy = classifyEnterpriseCase(c);
    if (!taxonomy) continue;
    counts.set(taxonomy.sourcePageType, (counts.get(taxonomy.sourcePageType) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: roundPercent(count, total) }))
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
  else if (filters.enterpriseCompany) parts.push(`${splitValues(filters.enterpriseCompany).join('、')} 企业`);
  else if (filters.sourceDomain) parts.push(`${splitValues(filters.sourceDomain).join('、')} 来源`);
  if (filters.discipline) parts.push(`${splitValues(filters.discipline).join('、')} 学科`);
  if (filters.mediaType) parts.push(`${splitValues(filters.mediaType).join('、')} 呈现方式`);
  if (filters.technicalMethod) parts.push(`${splitValues(filters.technicalMethod).join('、')} 技术手段`);
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
  technicalMethod: DistributionItem[];
  contentType: DistributionItem[];
  composition: DistributionItem[];
  colorTone: DistributionItem[];
  functionalPurpose: DistributionItem[];
  distributionMedium: DistributionItem[];
  rating: DistributionItem[];
}): string[] {
  const { totalCases, sourceCount, filters, media, discipline, technicalMethod, contentType, composition, colorTone, functionalPurpose, distributionMedium, rating } = args;
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

  const topStyle = topUseful(technicalMethod);
  if (topStyle) {
    insights.push(`基于当前样本库，${scope}的技术手段以"${topStyle.label}"为主，占比 ${topStyle.percentage.toFixed(1)}%。`);
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
        technicalMethod: true,
        composition: true,
        colorTone: true,
        functionalPurpose: true,
        distributionMedium: true,
        reviewStatus: true,
        sourceUrl: true,
        userHint: true,
        pageTitle: true,
        caseTitle: true,
        contextText: true,
      },
    }),
    prisma.crawlSource.findMany({ where: { enabled: true }, select: { name: true, url: true } }),
  ]);

  return {
    sourceDomain: makeFilterOption(cases.map(item => item.sourceDomain)),
    sourceName: await makeSourceNameOptions(crawlSources),
    enterpriseCompany: makeEnterpriseCompanyOptions(cases),
    enterprisePageType: makeEnterprisePageTypeOptions(cases),
    mediaType: makeFilterOption(cases.map(item => item.mediaType)),
    contentType: makeFilterOption(cases.map(item => item.contentType)),
    discipline: makeFilterOption(cases.map(item => item.discipline)),
    technicalMethod: makeFilterOption(cases.map(item => item.technicalMethod)),
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
      enterpriseCompany: readQueryValue(query, ENTERPRISE_COMPANY_ALIASES),
      mediaType: readQueryValue(query, FIELD_QUERY_ALIASES.mediaType),
      contentType: readQueryValue(query, FIELD_QUERY_ALIASES.contentType),
      discipline: readQueryValue(query, FIELD_QUERY_ALIASES.discipline),
      technicalMethod: readQueryValue(query, FIELD_QUERY_ALIASES.technicalMethod),
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
          technicalMethod: true,
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

    const selectedCompanyCount = splitValues(filters.enterpriseCompany).length;
    const selectedSourceCount = splitValues(filters.sourceName).length;
    const sourceCount = selectedSourceCount > 0
      ? selectedSourceCount
      : selectedCompanyCount > 0
      ? selectedCompanyCount
      : new Set(cases.map(item => item.sourceDomain).filter(Boolean)).size;

    const distributions = {
      mediaType: makeDistribution(cases, 'mediaType'),
      discipline: makeDistribution(cases, 'discipline'),
      technicalMethod: makeDistribution(cases, 'technicalMethod'),
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
    const leadingTechnicalMethod = topUseful(distributions.technicalMethod)?.label || '';

    res.json({
      success: true,
      data: {
        filters,
        filterOptions,
        totalCases: cases.length,
        sourceCount,
        leadingMediaType,
        leadingDiscipline,
        leadingTechnicalMethod,
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
          technicalMethod: distributions.technicalMethod,
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
  ime: {
    id: 'ime',
    label: '长兴海洋实验室',
    domains: ['ime.sjtu.edu.cn'],
  },
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
  overseasUniversity: {
    id: 'overseasUniversity',
    label: '国外高校',
    domains: [
      'news.mit.edu',
      'news.harvard.edu', 'www.harvard.edu', 'harvard.edu',
      'news.stanford.edu', 'engineering.stanford.edu',
    ],
  },
  international: {
    id: 'international',
    label: '国际研究',
    domains: [
      'www.nature.com', 'nature.com',
      'newscenter.lbl.gov', 'www.mpg.de', 'images.nasa.gov',
      'public.tableau.com',
    ],
  },
  enterprise: {
    id: 'enterprise',
    label: '头部企业',
    domains: [
      'www.kongsberg.com', 'www.arup.com', 'www.autodesk.com',
      'www.siemens-energy.com', 'www.rolls-royce.com', 'www.cat.com',
      'www.huawei.com', 'www.qualcomm.com', 'developer.nvidia.com', 'www.nvidia.com',
      'www.nvidia.cn', 'nvidia.cn',
      'new.abb.com', 'www.se.com', 'www.eaton.com',
      'bostondynamics.com', 'www.fanucamerica.com',
      'research.google', 'www.microsoft.com', 'aiotlabs.microsoft.com',
      'azure.microsoft.com', 'news.xbox.com',
      'www.asml.com', 'pr.tsmc.com', 'newsroom.arm.com', 'www.arm.com',
      'www.basf.com', 'www.corning.com', 'corporate.dow.com',
      'www.xylem.com', 'www.veolia.com', 'orsted.com',
      'www.siemens-healthineers.com', 'www.gehealthcare.com', 'news.bostonscientific.com',
      'www.bostonscientific.com',
      'www.airbus.com', 'boeing.mediaroom.com',
      'www.zeiss.com',
      'physicsworld.com', 'optics.org', 'semiengineering.com',
      'www.medicaldesignandoutsourcing.com',
      'www.waterworld.com', 'www.watertechonline.com',
      'www.tesla.com', 'www.spacex.com', 'www.starlink.com',
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

type ComparisonGroupId = 'ime' | 'sjtu' | 'domestic' | 'overseasUniversity' | 'international' | 'enterprise';

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function usefulComparisonValue(value: string): string {
  const v = normalizeLabel(value);
  return isUsefulLabel(v) ? v : '';
}

function comparisonText(c: Pick<VisualCase, 'sourceUrl' | 'pageTitle' | 'caseTitle' | 'contextText' | 'mediaType' | 'contentType' | 'technicalMethod' | 'functionalPurpose' | 'distributionMedium'>): string {
  return [
    c.sourceUrl,
    c.pageTitle,
    c.caseTitle,
    c.contextText,
    c.mediaType,
    c.contentType,
    c.technicalMethod,
    c.functionalPurpose,
    c.distributionMedium,
  ].filter(Boolean).join(' ');
}

function normalizeFunctionalDimension(c: Pick<VisualCase, 'mediaType' | 'contentType' | 'technicalMethod' | 'functionalPurpose' | 'contextText' | 'caseTitle' | 'pageTitle' | 'sourceUrl' | 'distributionMedium'>): string {
  const current = usefulComparisonValue(c.functionalPurpose || '');
  if (['记录', '解释', '数据', '展示', '传播', '交互'].includes(current)) return current;
  if (/证明|验证|结果|统计|图表|趋势|分布/.test(current)) return '数据';
  if (/转译|产品|方案|应用|成果|空间|项目/.test(current)) return '展示';

  const text = comparisonText(c);
  if (/交互|互动|仪表盘|dashboard|筛选|浏览|缩放|explore/i.test(text)) return '交互';
  if (/数据|图表|曲线|趋势|统计|模型|结果|地图|网络|可视化/i.test(text)) return '数据';
  if (/解释|机制|结构|流程|原理|说明|图解|示意/i.test(text)) return '解释';
  if (/品牌|科普|公众|宣传|传播|新闻|封面|展览/i.test(text)) return '传播';
  if (/成果|产品|空间|项目|方案|应用|展示|样机|平台/i.test(text)) return '展示';
  if (/记录|现场|人物|团队|实验|设备|样本|观测|采集|摄影|照片/i.test(text)) return '记录';
  return '未标注';
}

function normalizeMediumDimension(c: Pick<VisualCase, 'mediaType' | 'distributionMedium' | 'captureType' | 'contextText' | 'caseTitle' | 'pageTitle' | 'sourceUrl' | 'contentType' | 'technicalMethod' | 'functionalPurpose'>): string {
  const current = usefulComparisonValue(c.distributionMedium || '');
  if (['静图', '动图', '视频', '图组', '交互', '实体'].includes(current)) return current;

  const text = comparisonText(c);
  if (/交互|互动|dashboard|仪表盘|地图|缩放|筛选|explore/i.test(text)) return '交互';
  if (/gif|动图|循环|动效/i.test(text)) return '动图';
  if (/video|视频|animation|动画|影片|纪录|讲解/i.test(text) || c.captureType === 'video') return '视频';
  if (/图组|组图|长图|步骤|多图|gallery|slideshow/i.test(text)) return '图组';
  if (/印刷|海报|展板|包装|实体|展陈|poster|print/i.test(text)) return '实体';
  return '静图';
}

function inferTechnicalMethod(c: Pick<VisualCase, 'mediaType' | 'contentType' | 'technicalMethod' | 'contextText' | 'caseTitle' | 'pageTitle' | 'sourceUrl' | 'functionalPurpose' | 'distributionMedium'>): string {
  const current = usefulComparisonValue(c.technicalMethod || '');
  if (['拍摄', '成像', '绘设', '数据', '渲染', '生成'].includes(current)) return current;

  const mediaType = normalizeLabel(c.mediaType || '');
  if (/摄影|照片/.test(mediaType)) return '拍摄';
  if (/显微|电镜|医学影像|遥感|热成像|成像/.test(mediaType)) return '成像';
  if (/3D|三维|渲染|仿真|建模/.test(mediaType)) return '渲染';
  if (/数据可视化|数据图表|图表/.test(mediaType)) return '数据';
  if (/手绘|信息图|插画|图解|示意/.test(mediaType)) return '绘设';

  const text = comparisonText(c);
  if (/\bAI\b|人工智能|AIGC|算法生成|模型生成|图像生成|风格迁移|diffusion|generative/i.test(text)) return '生成';
  if (/3D|三维|渲染|建模|仿真|simulation|render|CAD|工程软件/i.test(text)) return '渲染';
  if (/显微|电镜|SEM|TEM|医学影像|MRI|CT|遥感|热成像|传感|成像|microscopy|microscope|imaging/i.test(text)) return '成像';
  if (/数据|图表|地图|网络|可视化|统计|曲线|模型|dashboard|visualization/i.test(text)) return '数据';
  if (/插画|手绘|绘制|图标|信息图|设计|排版|示意|diagram|illustration|infographic/i.test(text)) return '绘设';
  if (/摄影|摄像|航拍|无人机|照片|现场|设备|人物|团队|实验过程|拍摄|photo|camera|drone/i.test(text)) return '拍摄';
  return '未标注';
}

const TECHNICAL_SUBTYPE_BY_METHOD: Record<string, string[]> = {
  拍摄: ['纪实摄影', '个人肖像', '群体肖像', '过程摄影', '航拍', '设备/现场摄影', '未细分拍摄'],
  成像: ['光学显微', '电子显微', '医学影像', '遥感成像', '热成像', '未细分成像'],
  绘设: ['科学插画', '图标设计', '版面设计/信息图', '机制示意', '未细分绘设'],
  数据: ['统计图表', '地图', '网络图', '科学数据可视化', '未细分数据'],
  渲染: ['3D产品渲染', '3D机制图', '3D场景渲染', '3D数据可视化', '未细分渲染'],
  生成: ['AI生成图像', '算法增强', '风格迁移', '未细分生成'],
};

function normalizeTechnicalSubType(c: Pick<VisualCase, 'mediaType' | 'mediaSubType' | 'contentType' | 'technicalMethod' | 'contextText' | 'caseTitle' | 'pageTitle' | 'sourceUrl' | 'functionalPurpose' | 'distributionMedium'>): string {
  const method = inferTechnicalMethod(c);
  const allowed = TECHNICAL_SUBTYPE_BY_METHOD[method] || [];
  const current = usefulComparisonValue(c.mediaSubType || '');
  if (current && allowed.includes(current)) return current;

  const text = comparisonText(c);

  if (method === '拍摄') {
    if (/航拍|无人机|drone|aerial/i.test(text)) return '航拍';
    if (/实验过程|操作过程|流程记录|过程|procedure|process/i.test(text)) return '过程摄影';
    if (/群体|团队|合影|多人|group|team/i.test(text)) return '群体肖像';
    if (/人物|研究人员|科学家|肖像|portrait|profile|headshot|researcher|scientist/i.test(text)) return '个人肖像';
    if (/设备|仪器|装置|实验室|现场|空间|facility|lab|equipment|site/i.test(text)) return '设备/现场摄影';
    if (/纪实|记录|新闻|documentary|news photo/i.test(text)) return '纪实摄影';
    return '未细分拍摄';
  }

  if (method === '成像') {
    if (/SEM|TEM|电镜|电子显微|electron microscopy/i.test(text)) return '电子显微';
    if (/显微|光学显微|microscopy|microscope/i.test(text)) return '光学显微';
    if (/医学影像|MRI|CT|X光|超声|medical imaging|radiology/i.test(text)) return '医学影像';
    if (/遥感|卫星|remote sensing|satellite/i.test(text)) return '遥感成像';
    if (/热成像|thermal|infrared/i.test(text)) return '热成像';
    return '未细分成像';
  }

  if (method === '绘设') {
    if (/图标|icon/i.test(text)) return '图标设计';
    if (/信息图|版面|排版|infographic|layout/i.test(text)) return '版面设计/信息图';
    if (/机制|结构|流程|示意|diagram|schematic/i.test(text)) return '机制示意';
    if (/插画|illustration|手绘|绘制/i.test(text)) return '科学插画';
    return '未细分绘设';
  }

  if (method === '数据') {
    if (/地图|map|geospatial|GIS/i.test(text)) return '地图';
    if (/网络|关系|network|graph/i.test(text)) return '网络图';
    if (/统计|图表|曲线|柱状|折线|chart|plot|trend/i.test(text)) return '统计图表';
    if (/数据|可视化|visualization|model|模型/i.test(text)) return '科学数据可视化';
    return '未细分数据';
  }

  if (method === '渲染') {
    if (/产品|样机|product|device|prototype/i.test(text)) return '3D产品渲染';
    if (/数据|可视化|visualization/i.test(text)) return '3D数据可视化';
    if (/场景|空间|environment|scene/i.test(text)) return '3D场景渲染';
    if (/机制|结构|剖面|模型|simulation|仿真/i.test(text)) return '3D机制图';
    return '未细分渲染';
  }

  if (method === '生成') {
    if (/风格迁移|style transfer/i.test(text)) return '风格迁移';
    if (/增强|upscale|denoise|enhance/i.test(text)) return '算法增强';
    if (/\bAI\b|AIGC|生成|diffusion|generative/i.test(text)) return 'AI生成图像';
    return '未细分生成';
  }

  return '未标注';
}

function comparisonDimensionValue(c: VisualCase, dimension: ComparisonDimensionKey): string {
  if (dimension === 'functionalPurpose') return normalizeFunctionalDimension(c);
  if (dimension === 'distributionMedium') return normalizeMediumDimension(c);
  if (dimension === 'contentSubType') {
    return usefulComparisonValue(c.contentSubType || '') || usefulComparisonValue(c.contentType || '') || '未标注';
  }
  if (dimension === 'mediaSubType') {
    return normalizeTechnicalSubType(c);
  }
  if (dimension === 'contentType') {
    return usefulComparisonValue(c.contentType || '') || '未标注';
  }
  return inferTechnicalMethod(c);
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
      c.technicalMethod, c.functionalPurpose, c.distributionMedium, c.mediaSubType, c.contentSubType,
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

  const companyBreakdown = makeEnterpriseCompanyOptions(cases).slice(0, 16);
  const pageTypeBreakdown = makeEnterprisePageTypeOptions(cases);

  return {
    total,
    signals: enriched,
    companyBreakdown,
    pageTypeBreakdown,
    sourceBreakdown: companyBreakdown,
    summary: total === 0
      ? '企业商业化样本仍待采集。'
      : `企业组当前有 ${total} 条 approved 样本，商业化信号最高的是「${enriched[0]?.label || '待判断'}」，适合作为科研成果转译成行业场景、产品方案和客户价值表达的参照。`,
  };
}

function scoreEnterpriseSample(c: any): number {
  const text = [
    c.sourceUrl, c.pageTitle, c.caseTitle, c.contextText, c.mediaType, c.contentType,
    c.technicalMethod, c.functionalPurpose, c.distributionMedium,
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

function pickStratifiedCases(cases: any[], limit: number, dimension: ComparisonDimensionKey): any[] {
  if (limit <= 0 || cases.length <= limit) return cases;

  const buckets = new Map<string, any[]>();
  for (const c of cases) {
    const key = comparisonDimensionValue(c as VisualCase, dimension);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const bucketOrder = [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([key]) => key);

  const result: any[] = [];
  while (result.length < limit) {
    let added = false;
    for (const key of bucketOrder) {
      const bucket = buckets.get(key);
      if (!bucket || bucket.length === 0) continue;
      result.push(bucket.shift()!);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
  }

  return result;
}

insightsRouter.get('/insights/comparison', async (req: Request, res: Response) => {
  try {
    const school = toTrimmedString(req.query.school as string, 100) || '';
    const discipline = toTrimmedString(req.query.discipline as string, 200) || '';
    const dimension = toTrimmedString(req.query.dimension as string, 200) || 'functionalPurpose';
    const parentDimension = toTrimmedString(req.query.parentDimension as string, 200) || '';
    const parentValue = toTrimmedString(req.query.parentValue as string, 200) || '';
    const sampleModeParam = toTrimmedString(req.query.sampleMode as string, 40) || 'live';
    const focusGroupsParam = toTrimmedString(req.query.focusGroups as string, 200) || '';
    const sampleMode: ComparisonSampleMode = sampleModeParam === 'balanced' ? 'balanced' : 'live';

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

    const validDimensions: ComparisonDimensionKey[] = ['functionalPurpose', 'distributionMedium', 'technicalMethod', 'contentSubType', 'mediaSubType', 'contentType'];
    const dimKey: ComparisonDimensionKey = validDimensions.includes(dimension as ComparisonDimensionKey) ? (dimension as ComparisonDimensionKey) : 'functionalPurpose';
    const dimLabel = COMPARISON_DIMENSION_LABELS[dimKey] || dimension;
    const validParentDimensions: ComparisonParentDimensionKey[] = ['functionalPurpose', 'distributionMedium', 'technicalMethod'];
    const parentDimKey = validParentDimensions.includes(parentDimension as ComparisonParentDimensionKey)
      ? parentDimension as ComparisonParentDimensionKey
      : '';

    const where: Prisma.VisualCaseWhereInput = effectiveDiscipline
      ? { discipline: effectiveDiscipline, reviewStatus: 'approved' }
      : { reviewStatus: 'approved' };

    const rawCases = await prisma.visualCase.findMany({
      where,
      select: { id: true, sourceDomain: true, sourceUrl: true, pageTitle: true, caseTitle: true, contextText: true, captureType: true, userHint: true, mediaType: true, contentType: true, technicalMethod: true, discipline: true, functionalPurpose: true, distributionMedium: true, mediaSubType: true, contentSubType: true, thumbnailPath: true, imagePath: true, imageUrl: true, rating: true },
    });
    const cases = parentDimKey && parentValue
      ? rawCases.filter((c: any) => comparisonDimensionValue(c as VisualCase, parentDimKey) === parentValue)
      : rawCases;

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

    const SAMPLES_PER_GROUP = 18;
    const groupedCases = Object.values(COMPARISON_GROUPS).map((group) => {
      const domainSet = group.id === 'sjtu' ? SJTU_DOMAINS : new Set(group.domains);
      const groupCases = cases
        .filter((c: any) => group.id === 'enterprise'
          ? String(c.userHint || '').includes('/ enterprise') || domainSet.has(c.sourceDomain)
          : domainSet.has(c.sourceDomain))
        .sort((a: any, b: any) => group.id === 'enterprise' ? scoreEnterpriseSample(b) - scoreEnterpriseSample(a) : (b.rating || 0) - (a.rating || 0));
      return { group, groupCases };
    });

    const focusGroupIds = new Set(
      focusGroupsParam
        .split(',')
        .map(id => id.trim())
        .filter(id => Boolean(id) && Object.prototype.hasOwnProperty.call(COMPARISON_GROUPS, id)),
    );
    const sampleBaseGroups = focusGroupIds.size > 0
      ? groupedCases.filter(item => focusGroupIds.has(item.group.id))
      : groupedCases;
    const nonzeroGroupTotals = sampleBaseGroups.map(item => item.groupCases.length).filter(total => total > 0);
    const balancedSampleSize = sampleMode === 'balanced' && nonzeroGroupTotals.length > 1
      ? Math.min(...nonzeroGroupTotals)
      : 0;
    const effectiveSampleMode: ComparisonSampleMode = sampleMode === 'balanced' && balancedSampleSize > 0 ? 'balanced' : 'live';

    const groups = groupedCases.map(({ group, groupCases }) => {
      const rawTotal = groupCases.length;
      const analysisCases = effectiveSampleMode === 'balanced'
        ? pickStratifiedCases(groupCases, balancedSampleSize, dimKey)
        : groupCases;
      const total = analysisCases.length;

      const countMap = new Map<string, number>();
      for (const c of analysisCases) {
        const val = comparisonDimensionValue(c as VisualCase, dimKey);
        countMap.set(val, (countMap.get(val) || 0) + 1);
      }

      const distribution = [...countMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({
          label,
          count,
          percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        }));

      const sampled = group.id === 'enterprise' && effectiveSampleMode === 'live'
        ? pickEnterpriseSamples(analysisCases, SAMPLES_PER_GROUP)
        : pickStratifiedCases(analysisCases, SAMPLES_PER_GROUP, dimKey);

      const samples = sampled.map((c: any) => ({
        id: c.id,
        title: c.caseTitle || c.mediaType,
        thumbnail: c.thumbnailPath || c.imagePath || c.imageUrl || '',
        sourceUrl: c.sourceUrl,
        sourceDomain: c.sourceDomain,
        mediaType: c.mediaType,
        contentType: c.contentType,
        discipline: c.discipline,
        functionalPurpose: normalizeFunctionalDimension(c),
        distributionMedium: normalizeMediumDimension(c),
        technicalMethod: inferTechnicalMethod(c),
        rating: c.rating || 0,
      }));

      const label = group.id === 'sjtu' && schoolLabel ? schoolLabel : group.label;

      return {
        id: group.id as ComparisonGroupId,
        label,
        sourceDomains: group.id === 'enterprise'
          ? [...new Set(groupCases.map((c: any) => c.sourceDomain).filter(Boolean))]
          : group.id === 'sjtu' ? [...SJTU_DOMAINS] : group.domains,
        rawTotal,
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
          result.push({ groupId: group.id as ComparisonGroupId, groupLabel: label, topLabel: top.label, topPercentage: top.percentage, summary: `在${dimLabel}上，${label}更偏向「${top.label}」（占比 ${top.percentage.toFixed(1)}%），表现出与其他来源不同的视觉表达策略。` });
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
        parentDimension: parentDimKey || undefined,
        parentValue: parentDimKey ? parentValue : undefined,
        sampleMode: effectiveSampleMode,
        balancedSampleSize: effectiveSampleMode === 'balanced' ? balancedSampleSize : undefined,
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

type SpectrumDimKey = 'functionalPurpose' | 'mediaType' | 'discipline' | 'distributionMedium' | 'technicalMethod' | 'contentType';
// The canonical three-axis view is functionalPurpose x technicalMethod x distributionMedium.
// mediaType/contentType/discipline remain available as auxiliary or legacy drill-down dimensions.
const SPECTRUM_DIMS: SpectrumDimKey[] = ['functionalPurpose', 'mediaType', 'discipline', 'distributionMedium', 'technicalMethod', 'contentType'];

insightsRouter.get('/insights/three-axis-spectrum', async (req: Request, res: Response) => {
  try {
    const xDim = toTrimmedString(req.query.x as string, 100) || 'functionalPurpose';
    const yDim = toTrimmedString(req.query.y as string, 100) || 'technicalMethod';
    const zDim = toTrimmedString(req.query.z as string, 100) || 'distributionMedium';

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
        technicalMethod: true,
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
      technicalMethod: '技术手段',
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

insightsRouter.get('/discipline-configs', async (_req: Request, res: Response) => {
  try {
    const configs = await getAllDisciplineConfigs();
    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

insightsRouter.get('/discipline-config/:discipline', async (req: Request, res: Response) => {
  try {
    const discipline = req.params.discipline;
    if (!DISCIPLINES.includes(discipline as any)) {
      res.status(400).json({
        success: false,
        error: `Invalid discipline. Must be one of: ${DISCIPLINES.join(', ')}`,
      });
      return;
    }
    const config = await getDisciplineConfig(discipline);
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
