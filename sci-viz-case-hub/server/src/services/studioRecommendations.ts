import type { Prisma, VisualCase } from '@prisma/client';

export const STUDIO_RECOMMENDATION_CONTRACT_VERSION = 1 as const;

export type StudioCandidateFilters = {
  discipline?: string;
  purposes?: string[];
  technicalMethods?: string[];
};

type VisualCaseRepository = {
  findMany(args: Prisma.VisualCaseFindManyArgs): Promise<VisualCase[]>;
};

type StudioCaseDatabase = {
  visualCase: VisualCaseRepository;
};

const imageCaseFilter: Prisma.VisualCaseWhereInput = {
  OR: [
    { distributionMedium: '静图' },
    { distributionMedium: '' },
    { captureType: 'image' },
  ],
};

const qualityOrder: Prisma.VisualCaseOrderByWithRelationInput[] = [
  { rating: 'desc' },
  { confidence: 'desc' },
  { updatedAt: 'desc' },
];

function cleanValues(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function approvedImageCases(extra?: Prisma.VisualCaseWhereInput): Prisma.VisualCaseWhereInput {
  return {
    reviewStatus: 'approved',
    AND: extra ? [imageCaseFilter, extra] : [imageCaseFilter],
  };
}

export function buildStudioCandidateQueries(filters: StudioCandidateFilters): Prisma.VisualCaseFindManyArgs[] {
  const discipline = filters.discipline?.trim() ?? '';
  const purposes = cleanValues(filters.purposes);
  const technicalMethods = cleanValues(filters.technicalMethods);
  const queries: Prisma.VisualCaseFindManyArgs[] = [];

  if (discipline && purposes.length) {
    queries.push({
      where: approvedImageCases({
        discipline,
        functionalPurpose: { in: purposes },
      }),
      orderBy: qualityOrder,
      take: 200,
    });
  }

  const relatedConditions: Prisma.VisualCaseWhereInput[] = [];
  if (discipline) relatedConditions.push({ discipline });
  if (purposes.length) relatedConditions.push({ functionalPurpose: { in: purposes } });
  if (technicalMethods.length) relatedConditions.push({ technicalMethod: { in: technicalMethods } });

  if (relatedConditions.length) {
    queries.push({
      where: approvedImageCases({ OR: relatedConditions }),
      orderBy: qualityOrder,
      take: 300,
    });
  }

  queries.push({
    where: approvedImageCases(),
    orderBy: qualityOrder,
    take: 300,
  });

  return queries;
}

export async function findStudioRecommendationCandidates(
  database: StudioCaseDatabase,
  filters: StudioCandidateFilters,
) {
  const batches = await Promise.all(
    buildStudioCandidateQueries(filters).map((query) => database.visualCase.findMany(query)),
  );
  const uniqueCases = new Map<string, VisualCase>();

  for (const batch of batches) {
    for (const visualCase of batch) {
      if (!uniqueCases.has(visualCase.id)) uniqueCases.set(visualCase.id, visualCase);
    }
  }

  return [...uniqueCases.values()];
}
