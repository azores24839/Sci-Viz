import { prisma } from '../prisma.js';
import { getDefaultKpis, isKpiDimension, normalizeTaxonomyValue, type KpiDimension } from './taxonomy.js';

export const CORE_COVERAGE_DIMENSIONS = [
  'discipline',
  'functionalPurpose',
  'distributionMedium',
  'technicalMethod',
] as const satisfies readonly KpiDimension[];

type KpiConfig = {
  id: number;
  dimension: string;
  category: string;
  targetCount: number;
  priority: number;
  enabled: boolean;
  notes: string;
};

type CoverageCase = Record<KpiDimension, string> & {
  reviewStatus: string;
  rating: number;
};

export interface KpiProgressItem {
  id: number;
  dimension: KpiDimension;
  category: string;
  targetCount: number;
  currentCount: number;
  approvedCount: number;
  highValueCount: number;
  remainingCount: number;
  progress: number;
  isReached: boolean;
  priority: number;
  enabled: boolean;
  notes: string;
}

export async function ensureDefaultCollectionKpis() {
  const defaults = getDefaultKpis();
  for (const item of defaults) {
    await prisma.collectionKpi.upsert({
      where: {
        dimension_category: {
          dimension: item.dimension,
          category: item.category,
        },
      },
      update: {},
      create: item,
    });
  }
}

function mergeStoredKpisWithDefaults(storedKpis: KpiConfig[]): KpiConfig[] {
  const storedByKey = new Map(
    storedKpis.map((kpi) => [`${kpi.dimension}:${kpi.category}`, kpi]),
  );
  const defaultKeys = new Set<string>();
  const defaults = getDefaultKpis().map((item, index) => {
    const key = `${item.dimension}:${item.category}`;
    defaultKeys.add(key);
    return storedByKey.get(key) ?? {
      id: -(index + 1),
      ...item,
      enabled: true,
      notes: '',
    };
  });

  return [
    ...defaults,
    ...storedKpis.filter((kpi) => !defaultKeys.has(`${kpi.dimension}:${kpi.category}`)),
  ];
}

export function calculateCollectionKpiProgress(
  kpis: KpiConfig[],
  cases: CoverageCase[],
): KpiProgressItem[] {
  const counts = new Map<string, { current: number; approved: number; highValue: number }>();
  for (const caseEntry of cases) {
    for (const dimension of Object.keys(caseEntry).filter(isKpiDimension)) {
      const category = normalizeTaxonomyValue(dimension, caseEntry[dimension] || '');
      const key = `${dimension}:${category}`;
      const current = counts.get(key) || { current: 0, approved: 0, highValue: 0 };
      current.current++;
      if (caseEntry.reviewStatus === 'approved') {
        current.approved++;
        if (caseEntry.rating >= 4) current.highValue++;
      }
      counts.set(key, current);
    }
  }

  return kpis
    .filter((kpi) => kpi.enabled && isKpiDimension(kpi.dimension))
    .map((kpi) => {
      const dimension = kpi.dimension as KpiDimension;
      const key = `${dimension}:${kpi.category}`;
      const count = counts.get(key) || { current: 0, approved: 0, highValue: 0 };
      const remainingCount = Math.max(kpi.targetCount - count.approved, 0);
      return {
        id: kpi.id,
        dimension,
        category: kpi.category,
        targetCount: kpi.targetCount,
        currentCount: count.current,
        approvedCount: count.approved,
        highValueCount: count.highValue,
        remainingCount,
        progress: kpi.targetCount > 0 ? Math.min(count.approved / kpi.targetCount, 1) : 1,
        isReached: count.approved >= kpi.targetCount,
        priority: kpi.priority,
        enabled: kpi.enabled,
        notes: kpi.notes,
      };
    });
}

export async function getCollectionKpiProgress(): Promise<KpiProgressItem[]> {
  const [storedKpis, cases] = await Promise.all([
    prisma.collectionKpi.findMany({
      where: { enabled: true },
      orderBy: [{ dimension: 'asc' }, { priority: 'desc' }, { category: 'asc' }],
    }),
    prisma.visualCase.findMany({
      where: { reviewStatus: { not: 'rejected' } },
      select: {
        mediaType: true,
        contentType: true,
        discipline: true,
        technicalMethod: true,
        functionalPurpose: true,
        distributionMedium: true,
        reviewStatus: true,
        rating: true,
      },
    }),
  ]);

  return calculateCollectionKpiProgress(mergeStoredKpisWithDefaults(storedKpis), cases);
}

export async function getMostNeededKpis(limit = 10): Promise<KpiProgressItem[]> {
  const progress = await getCollectionKpiProgress();
  return progress
    .filter(item => CORE_COVERAGE_DIMENSIONS.includes(item.dimension as typeof CORE_COVERAGE_DIMENSIONS[number]))
    .filter(item => !item.isReached && item.category !== '不确定')
    .sort((a, b) => {
      const scoreA = a.remainingCount * a.priority;
      const scoreB = b.remainingCount * b.priority;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}
