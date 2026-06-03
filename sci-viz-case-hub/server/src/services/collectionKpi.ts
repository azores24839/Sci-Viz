import { prisma } from '../prisma.js';
import { getDefaultKpis, isKpiDimension, normalizeTaxonomyValue, type KpiDimension } from './taxonomy.js';

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

export async function getCollectionKpiProgress(): Promise<KpiProgressItem[]> {
  await ensureDefaultCollectionKpis();

  const [kpis, cases] = await Promise.all([
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
        visualStyle: true,
        functionalPurpose: true,
        distributionMedium: true,
        reviewStatus: true,
        rating: true,
      },
    }),
  ]);

  const counts = new Map<string, { current: number; approved: number; highValue: number }>();
  for (const caseEntry of cases) {
    for (const dimension of ['mediaType', 'contentType', 'discipline', 'visualStyle', 'functionalPurpose', 'distributionMedium'] as KpiDimension[]) {
      const category = normalizeTaxonomyValue(dimension, caseEntry[dimension] || '');
      const key = `${dimension}:${category}`;
      const current = counts.get(key) || { current: 0, approved: 0, highValue: 0 };
      current.current++;
      if (caseEntry.reviewStatus === 'approved') current.approved++;
      if (caseEntry.rating >= 4) current.highValue++;
      counts.set(key, current);
    }
  }

  return kpis
    .filter(kpi => isKpiDimension(kpi.dimension))
    .map(kpi => {
      const dimension = kpi.dimension as KpiDimension;
      const key = `${dimension}:${kpi.category}`;
      const count = counts.get(key) || { current: 0, approved: 0, highValue: 0 };
      const remainingCount = Math.max(kpi.targetCount - count.current, 0);
      return {
        id: kpi.id,
        dimension,
        category: kpi.category,
        targetCount: kpi.targetCount,
        currentCount: count.current,
        approvedCount: count.approved,
        highValueCount: count.highValue,
        remainingCount,
        progress: kpi.targetCount > 0 ? Math.min(count.current / kpi.targetCount, 1) : 1,
        isReached: count.current >= kpi.targetCount,
        priority: kpi.priority,
        enabled: kpi.enabled,
        notes: kpi.notes,
      };
    });
}

export async function getMostNeededKpis(limit = 10): Promise<KpiProgressItem[]> {
  const progress = await getCollectionKpiProgress();
  return progress
    .filter(item => !item.isReached && item.category !== '不确定')
    .sort((a, b) => {
      const scoreA = a.remainingCount * a.priority;
      const scoreB = b.remainingCount * b.priority;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}
