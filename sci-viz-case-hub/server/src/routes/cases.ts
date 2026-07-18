import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { clampInt, normalizeHttpUrl, toTrimmedString } from '../utils/httpSafety.js';
import { remapImagePath } from '../services/oss.js';
import { deleteSavedImage } from '../services/image.js';
import { classifyEnterpriseCase, makeEnterpriseCompanyWhere } from '../services/enterpriseTaxonomy.js';
import { toPublicCaseDto } from '../services/publicCase.js';
import { sendInternalError } from '../middleware/requestContext.js';
import { inferSourceOwner } from '../services/sourceOwner.js';

function remapCase(c: Record<string, any>) {
  return {
    ...c,
    imagePath: remapImagePath(c.imagePath),
    thumbnailPath: remapImagePath(c.thumbnailPath),
  };
}

export const casesRouter = Router();

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

async function makeSourceNameWhere(names: string[]): Promise<Prisma.VisualCaseWhereInput | null> {
  if (names.length === 0) return null;

  const sources = await prisma.crawlSource.findMany({
    where: { name: { in: names } },
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

  for (const name of names) {
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
      continue;
    }

    if (domain && (domainCounts.get(domain) || 0) === 1) clauses.push({ sourceDomain: domain });
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
  if (!exclude.includes('functional_purpose') && query.functional_purpose) where.functionalPurpose = query.functional_purpose;
  if (query.review_status) {
    const statuses = String(query.review_status).split(',').map(value => value.trim()).filter(Boolean);
    where.reviewStatus = statuses.length === 1 ? statuses[0] : { in: statuses };
  }
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

async function buildVisibleWhere(query: Record<string, unknown>, exclude: string[], publicRequest: boolean) {
  const where = await buildWhere(query, exclude);
  if (publicRequest) where.reviewStatus = 'approved';
  return where;
}

casesRouter.get('/cases', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const createdAtOrder = req.query.sort === 'oldest' ? 'asc' : 'desc';

    const publicRequest = !req.user;
    const where = await buildVisibleWhere(req.query as Record<string, unknown>, [], publicRequest);

    const currentPage = clampInt(page, 1, 1, 10000);
    const take = clampInt(limit, 20, 1, 100);
    const skip = (currentPage - 1) * take;

    const [cases, total] = await Promise.all([
      prisma.visualCase.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: createdAtOrder },
      }),
      prisma.visualCase.count({ where }),
    ]);

    res.json({
      success: true,
      data: cases.map(remapCase).map(entry => publicRequest ? toPublicCaseDto(entry) : entry),
      pagination: {
        total,
        page: currentPage,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    sendInternalError(req, res, 'cases route', error);
  }
});

casesRouter.get('/cases/facet-counts', async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, unknown>;
    const publicRequest = !req.user;

    const [mediaTypeCounts, disciplineCounts, technicalMethodCounts, distributionMediumCounts, functionalPurposeCounts, contentTypeCounts, captureTypeCounts, sourceDomainCounts] = await Promise.all([
      prisma.visualCase.groupBy({ by: ['mediaType'], where: await buildVisibleWhere(q, ['media_type'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['discipline'], where: await buildVisibleWhere(q, ['discipline'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['technicalMethod'], where: await buildVisibleWhere(q, ['technical_method'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['distributionMedium'], where: await buildVisibleWhere(q, ['distribution_medium'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['functionalPurpose'], where: await buildVisibleWhere(q, ['functional_purpose'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['contentType'], where: await buildVisibleWhere(q, ['content_type'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['captureType'], where: await buildVisibleWhere(q, ['capture_type'], publicRequest), _count: { _all: true } }),
      prisma.visualCase.groupBy({ by: ['sourceDomain'], where: await buildVisibleWhere(q, ['source_domain'], publicRequest), _count: { _all: true } }),
    ]);

    const baseWhere = await buildVisibleWhere(q, ['source_name'], publicRequest);
    const allSources = await prisma.crawlSource.findMany({
      where: { enabled: true },
      select: { name: true, url: true, category: true, sourceType: true },
    });
    const sourceOwnerNames = new Map<string, string[]>();
    for (const source of allSources) {
      const owner = inferSourceOwner(source);
      const names = sourceOwnerNames.get(owner.ownerKey) || [];
      names.push(source.name);
      sourceOwnerNames.set(owner.ownerKey, names);
    }
    const sourceOwnerCounts: Record<string, number> = {};
    for (const [ownerKey, names] of sourceOwnerNames) {
      const ownerWhere = await makeSourceNameWhere(names);
      if (!ownerWhere) continue;
      const count = await prisma.visualCase.count({ where: { AND: [baseWhere, ownerWhere] } });
      if (count > 0) sourceOwnerCounts[ownerKey] = count;
    }

    const enterpriseCompanyBaseWhere = await buildVisibleWhere(q, ['enterprise_company'], publicRequest);
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
        functionalPurpose: toMap(functionalPurposeCounts, 'functionalPurpose'),
        contentType: contentTypeMap,
        captureType: toMap(captureTypeCounts, 'captureType'),
        sourceDomain: toMap(sourceDomainCounts, 'sourceDomain'),
        sourceName: {},
        sourceOwner: sourceOwnerCounts,
        enterpriseCompany: enterpriseCompanyCounts,
        enterprisePageType: enterprisePageTypeCounts,
      },
    });
  } catch (error) {
    sendInternalError(req, res, 'cases route', error);
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
    sendInternalError(req, res, 'cases route', error);
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
    sendInternalError(req, res, 'cases route', error);
  }
});

casesRouter.get('/cases/:id', async (req: Request, res: Response) => {
  try {
    const publicRequest = !req.user;
    const caseEntry = await prisma.visualCase.findFirst({
      where: {
        id: req.params.id,
        ...(publicRequest ? { reviewStatus: 'approved' } : {}),
      },
    });
    if (!caseEntry) {
      res.status(404).json({ success: false, error: 'Case not found' });
      return;
    }
    const remapped = remapCase(caseEntry);
    res.json({ success: true, data: publicRequest ? toPublicCaseDto(remapped) : remapped });
  } catch (error) {
    sendInternalError(req, res, 'cases route', error);
  }
});

casesRouter.patch('/cases/:id', async (req: Request, res: Response) => {
  try {
    const allowedFields = [
      'title', 'mediaType', 'contentType', 'discipline', 'technicalMethod', 'distributionMedium',
      'functionalPurpose',
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

    if (req.body.sourceUrl !== undefined) {
      const rawSourceUrl = toTrimmedString(req.body.sourceUrl, 2048);
      if (!rawSourceUrl) {
        updateData.sourceUrl = '';
        updateData.sourceDomain = '';
      } else {
        const normalizedSourceUrl = normalizeHttpUrl(rawSourceUrl);
        if (!normalizedSourceUrl) {
          return res.status(400).json({ success: false, error: '来源网址必须是有效的 HTTP 或 HTTPS 地址' });
        }
        updateData.sourceUrl = normalizedSourceUrl;
        updateData.sourceDomain = sourceDomainFromUrl(normalizedSourceUrl);
      }
    }

    const caseEntry = await prisma.visualCase.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ success: true, data: caseEntry });
  } catch (error) {
    sendInternalError(req, res, 'cases route', error);
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
    sendInternalError(req, res, 'cases route', error);
  }
});
