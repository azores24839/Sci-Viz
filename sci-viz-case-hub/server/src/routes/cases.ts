import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { clampInt, toTrimmedString } from '../utils/httpSafety.js';
import { remapImagePath } from '../services/oss.js';
import { deleteSavedImage } from '../services/image.js';
import { classifyEnterpriseCase, makeEnterpriseCompanyWhere } from '../services/enterpriseTaxonomy.js';

function remapCase(c: Record<string, any>) {
  c.imagePath = remapImagePath(c.imagePath);
  c.thumbnailPath = remapImagePath(c.thumbnailPath);
  return c;
}

export const casesRouter = Router();

function sourceDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

async function makeSourceNameWhere(names: string[]): Promise<Prisma.VisualCaseWhereInput | null> {
  if (names.length === 0) return null;

  const sources = await prisma.crawlSource.findMany({
    where: { name: { in: names } },
    select: { name: true, url: true },
  });
  const sourceByName = new Map(sources.map(source => [source.name, source]));

  const clauses: Prisma.VisualCaseWhereInput[] = [];

  for (const name of names) {
    const source = sourceByName.get(name);
    const domain = source ? sourceDomainFromUrl(source.url) : '';
    const userHintCount = await prisma.visualCase.count({ where: { userHint: { contains: name } } });
    if (userHintCount > 0) {
      clauses.push({ userHint: { contains: name } });
      continue;
    }

    const titleCount = await prisma.visualCase.count({ where: { caseTitle: { contains: name } } });
    if (titleCount > 0) {
      clauses.push({ caseTitle: { contains: name } });
      continue;
    }

    if (domain) clauses.push({ sourceDomain: domain });
  }

  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0];
  return { OR: clauses };
}

async function buildWhere(query: Record<string, unknown>, exclude: string[] = []): Promise<Prisma.VisualCaseWhereInput> {
  const where: Prisma.VisualCaseWhereInput = {};
  const andClauses: Prisma.VisualCaseWhereInput[] = [];

  if (!exclude.includes('media_type') && query.media_type) where.mediaType = query.media_type;
  if (!exclude.includes('content_type') && query.content_type) {
    where.contentType = query.content_type === '单人肖像'
      ? { in: ['单人肖像', '科研人员'] }
      : query.content_type;
  }
  if (!exclude.includes('discipline') && query.discipline) where.discipline = query.discipline;
  if (!exclude.includes('technical_method') && query.technical_method) where.technicalMethod = query.technical_method;
  if (!exclude.includes('distribution_medium') && query.distribution_medium) where.distributionMedium = query.distribution_medium;
  if (query.review_status) where.reviewStatus = query.review_status;
  if (query.rating) {
    const parsedRating = clampInt(query.rating, 0, 0, 5);
    if (parsedRating > 0) where.rating = parsedRating;
  }
  if (!exclude.includes('source_domain') && query.source_domain) {
    const domains = (query.source_domain as string).split(',').filter(Boolean);
    where.sourceDomain = domains.length === 1 ? domains[0] : { in: domains };
  }
  if (!exclude.includes('source_name') && query.source_name) {
    const names = (query.source_name as string).split(',').filter(Boolean);
    const sourceNameWhere = await makeSourceNameWhere(names);
    if (sourceNameWhere) andClauses.push(sourceNameWhere);
  }
  if (!exclude.includes('enterprise_company') && query.enterprise_company) {
    const companies = (query.enterprise_company as string).split(',').filter(Boolean);
    const enterpriseCompanyWhere = makeEnterpriseCompanyWhere(companies);
    if (enterpriseCompanyWhere) andClauses.push(enterpriseCompanyWhere);
  }
  if (query.capture_type) where.captureType = query.capture_type;
  if (query.ocr_status === 'has_text') where.ocrText = { not: '' };
  if (query.ocr_status === 'no_text') where.ocrText = '';
  if (query.ai_status === 'analyzed') where.confidence = { not: 0 };
  if (query.ai_status === 'unanalyzed') where.confidence = 0;
  const searchText = toTrimmedString(query.search, 100);
  if (searchText) {
    andClauses.push({ OR: [
      { title: { contains: searchText } },
      { pageTitle: { contains: searchText } },
      { aiSummary: { contains: searchText } },
      { caseTitle: { contains: searchText } },
      { contextText: { contains: searchText } },
    ] });
  }
  if (andClauses.length) where.AND = andClauses;
  return where;
}

casesRouter.get('/cases', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;

    const where = await buildWhere(req.query as Record<string, unknown>);

    const currentPage = clampInt(page, 1, 1, 10000);
    const take = clampInt(limit, 20, 1, 100);
    const skip = (currentPage - 1) * take;

    const [cases, total] = await Promise.all([
      prisma.visualCase.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.visualCase.count({ where }),
    ]);

    res.json({
      success: true,
      data: cases.map(remapCase),
      pagination: {
        total,
        page: currentPage,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

casesRouter.get('/cases/facet-counts', async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, unknown>;

    const [mediaTypeCounts, disciplineCounts, technicalMethodCounts, distributionMediumCounts, contentTypeCounts, captureTypeCounts, sourceDomainCounts] = await Promise.all([
      prisma.visualCase.groupBy({ by: ['mediaType'], where: await buildWhere(q, ['media_type']), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['discipline'], where: await buildWhere(q, ['discipline']), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['technicalMethod'], where: await buildWhere(q, ['technical_method']), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['distributionMedium'], where: await buildWhere(q, ['distribution_medium']), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['contentType'], where: await buildWhere(q, ['content_type']), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['captureType'], where: await buildWhere(q, ['capture_type']), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['sourceDomain'], where: await buildWhere(q, ['source_domain']), _count: { _all: true } }),
    ]);

    const baseWhere = await buildWhere(q, ['source_name']);
    const allSources = await prisma.crawlSource.findMany({ where: { enabled: true }, select: { name: true, url: true } });
    const sourceNameCounts: Record<string, number> = {};
    for (const src of allSources) {
      if (!src.name) continue;
      const sourceNameWhere = await makeSourceNameWhere([src.name]);
      if (!sourceNameWhere) continue;
      const cnt = await prisma.visualCase.count({
        where: { AND: [baseWhere, sourceNameWhere] },
      });
      if (cnt > 0) sourceNameCounts[src.name] = cnt;
    }

    const enterpriseCompanyBaseWhere = await buildWhere(q, ['enterprise_company']);
    const enterpriseCases = await prisma.visualCase.findMany({
      where: enterpriseCompanyBaseWhere,
      select: { sourceDomain: true, sourceUrl: true, userHint: true, pageTitle: true, caseTitle: true, contextText: true },
    });
    const enterpriseCompanyCounts: Record<string, number> = {};
    const enterprisePageTypeCounts: Record<string, number> = {};
    for (const c of enterpriseCases) {
      const taxonomy = classifyEnterpriseCase(c);
      if (!taxonomy) continue;
      enterpriseCompanyCounts[taxonomy.companyName] = (enterpriseCompanyCounts[taxonomy.companyName] || 0) + 1;
      enterprisePageTypeCounts[taxonomy.sourcePageType] = (enterprisePageTypeCounts[taxonomy.sourcePageType] || 0) + 1;
    }

    const toMap = (arr: Array<Record<string, any>>, key: string): Record<string, number> => {
      const map: Record<string, number> = {};
      for (const item of arr) {
        const val = String(item[key] || '');
        if (val) map[val] = (item._count?._all ?? 0) as number;
      }
      return map;
    };

    const contentTypeMap = toMap(contentTypeCounts, 'contentType');
    if (contentTypeMap['科研人员']) {
      contentTypeMap['单人肖像'] = (contentTypeMap['单人肖像'] || 0) + contentTypeMap['科研人员'];
      delete contentTypeMap['科研人员'];
    }

    res.json({
      success: true,
      data: {
        mediaType: toMap(mediaTypeCounts, 'mediaType'),
        discipline: toMap(disciplineCounts, 'discipline'),
        technicalMethod: toMap(technicalMethodCounts, 'technicalMethod'),
        distributionMedium: toMap(distributionMediumCounts, 'distributionMedium'),
        contentType: contentTypeMap,
        captureType: toMap(captureTypeCounts, 'captureType'),
        sourceDomain: toMap(sourceDomainCounts, 'sourceDomain'),
        sourceName: sourceNameCounts,
        enterpriseCompany: enterpriseCompanyCounts,
        enterprisePageType: enterprisePageTypeCounts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

casesRouter.post('/cases/batch/approve', async (req: Request, res: Response) => {
  try {
    const { statuses } = req.body;
    const where: Record<string, unknown> = {};
    if (Array.isArray(statuses) && statuses.length > 0) {
      where.reviewStatus = { in: statuses };
    } else {
      where.reviewStatus = { in: ['needs_review', 'low_confidence_review'] };
    }

    const result = await prisma.visualCase.updateMany({
      where,
      data: { reviewStatus: 'approved' },
    });

    res.json({ success: true, data: { approved: result.count } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

casesRouter.post('/cases/batch/delete', async (req: Request, res: Response) => {
  try {
    const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(
      rawIds
        .filter((id): id is string => typeof id === 'string')
        .map(id => id.trim())
        .filter(Boolean)
    )].slice(0, 200);

    if (ids.length === 0) {
      res.status(400).json({ success: false, error: 'No case ids provided' });
      return;
    }

    const existing = await prisma.visualCase.findMany({
      where: { id: { in: ids } },
      select: { id: true, imagePath: true, thumbnailPath: true },
    });

    if (existing.length === 0) {
      res.status(404).json({ success: false, error: 'Cases not found' });
      return;
    }

    const result = await prisma.visualCase.deleteMany({
      where: { id: { in: existing.map(item => item.id) } },
    });

    await Promise.all(
      existing.map(item => deleteSavedImage(item.imagePath || '', item.thumbnailPath || ''))
    );

    res.json({ success: true, data: { deleted: result.count, requested: ids.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

casesRouter.get('/cases/:id', async (req: Request, res: Response) => {
  try {
    const caseEntry = await prisma.visualCase.findUnique({
      where: { id: req.params.id },
    });
    if (!caseEntry) {
      res.status(404).json({ success: false, error: 'Case not found' });
      return;
    }
    res.json({ success: true, data: remapCase(caseEntry) });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

casesRouter.patch('/cases/:id', async (req: Request, res: Response) => {
  try {
    const allowedFields = [
      'title', 'mediaType', 'contentType', 'discipline', 'technicalMethod', 'distributionMedium',
      'composition', 'colorTone', 'useCase', 'aiSummary', 'caseTitle', 'borrowablePoints',
      'riskNotes', 'confidence', 'reviewStatus', 'rating', 'manualNotes',
      'videoUrl', 'videoPlatform', 'videoDuration',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = typeof req.body[field] === 'object'
          ? JSON.stringify(req.body[field])
          : req.body[field];
      }
    }

    const caseEntry = await prisma.visualCase.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, data: caseEntry });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

casesRouter.delete('/cases/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.visualCase.findUnique({
      where: { id: req.params.id },
      select: { imagePath: true, thumbnailPath: true },
    });

    if (!existing) {
      res.status(404).json({ success: false, error: 'Case not found' });
      return;
    }

    await prisma.visualCase.delete({
      where: { id: req.params.id },
    });

    if (existing.imagePath || existing.thumbnailPath) {
      await deleteSavedImage(existing.imagePath || '', existing.thumbnailPath || '');
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
