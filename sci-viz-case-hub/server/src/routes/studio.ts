import { Router, type Request, type Response } from 'express';
import { prisma } from '../prisma.js';
import { remapImagePath } from '../services/oss.js';
import { findStudioRecommendationCandidates, STUDIO_RECOMMENDATION_CONTRACT_VERSION } from '../services/studioRecommendations.js';
import { isValidStudioServiceKey } from '../services/studioAuth.js';

export const studioRouter = Router();

const goalPurpose: Record<string, string[]> = {
  ACADEMIC_COMMUNICATION: ['解释', '数据'],
  PUBLIC_COMMUNICATION: ['传播', '解释'],
  RECRUITING_BRAND: ['展示', '传播'],
  INDUSTRY_COLLABORATION: ['展示', '解释'],
};

function text(value: unknown, max = 120) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function list(value: unknown, max = 8) { return Array.isArray(value) ? value.map((item) => text(item, 60)).filter(Boolean).slice(0, max) : []; }
function borrowable(value: string) {
  if (!value || value === '[]') return '';
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map((item) => text(item, 80)).filter(Boolean).slice(0, 3).join('、') : text(value, 240); }
  catch { return text(value, 240); }
}

studioRouter.use((req, res, next) => {
  const configured = process.env.STUDIO_SERVICE_KEY;
  if (!configured) return res.status(503).json({ success: false, error: { code: 'STUDIO_API_DISABLED', message: 'Studio integration is not configured.' } });
  if (!isValidStudioServiceKey(req.header('x-studio-key'), configured)) return res.status(401).json({ success: false, error: { code: 'STUDIO_API_UNAUTHORIZED', message: 'Invalid service credential.' } });
  const requestedVersion = req.header('x-studio-contract-version');
  if (requestedVersion && requestedVersion !== String(STUDIO_RECOMMENDATION_CONTRACT_VERSION)) {
    return res.status(406).json({ success: false, error: { code: 'STUDIO_CONTRACT_UNSUPPORTED', message: 'Unsupported Studio contract version.' } });
  }
  res.setHeader('x-studio-contract-version', String(STUDIO_RECOMMENDATION_CONTRACT_VERSION));
  next();
});

studioRouter.post('/recommendations', async (req: Request, res: Response) => {
  try {
    const discipline = text(req.body?.discipline);
    const teamType = text(req.body?.teamType);
    const goals = list(req.body?.goals);
    const desiredTechnicalMethods = list(req.body?.technicalMethods);
    const limit = Math.min(12, Math.max(3, Number(req.body?.limit) || 6));
    const purposes = [...new Set(goals.flatMap((goal) => goalPurpose[goal] ?? []))];
    const candidates = await findStudioRecommendationCandidates(prisma, {
      discipline,
      purposes,
      technicalMethods: desiredTechnicalMethods,
    });
    const scored = candidates.map((entry) => {
      const disciplineMatch = Boolean(discipline && entry.discipline === discipline);
      const purposeMatch = Boolean(purposes.length && purposes.includes(entry.functionalPurpose));
      const technicalMatch = Boolean(desiredTechnicalMethods.length && desiredTechnicalMethods.includes(entry.technicalMethod));
      const searchable = [entry.caseTitle, entry.pageTitle, entry.contextText, entry.aiSummary, entry.contentType].join(' ').toLowerCase();
      const teamMatch = Boolean(teamType && searchable.includes(teamType.toLowerCase()));
      const score = (disciplineMatch ? 35 : 0) + (purposeMatch ? 28 : 0) + (technicalMatch ? 16 : 0) + (teamMatch ? 8 : 0) + Math.min(10, entry.rating * 2) + Math.min(3, Math.round(entry.confidence * 3));
      const matchLevel = disciplineMatch && purposeMatch ? 'EXACT' : disciplineMatch || purposeMatch || technicalMatch ? 'RELATED' : 'CROSS_DOMAIN';
      const reasons = [disciplineMatch ? `同学科：${entry.discipline}` : '', purposeMatch ? `同传播目标：${entry.functionalPurpose}` : '', technicalMatch ? `同技术方法：${entry.technicalMethod}` : '', teamMatch ? '团队语境相近' : '', borrowable(entry.borrowablePoints)].filter(Boolean);
      return { entry, score, matchLevel, reasons };
    }).sort((a, b) => b.score - a.score || b.entry.rating - a.entry.rating).slice(0, limit);
    const exactCount = scored.filter((item) => item.matchLevel === 'EXACT').length;
    const fallbackMessage = exactCount >= 3 ? '' : exactCount > 0 ? `精确匹配仅 ${exactCount} 个，已补充同学科、同目标或同技术方法的相关案例。` : '暂无足够的精确匹配，已提供跨学科的优秀静图参考。';
    res.json({ success: true, data: {
      contractVersion: STUDIO_RECOMMENDATION_CONTRACT_VERSION,
      items: scored.map(({ entry, score, matchLevel, reasons }) => ({
        id: entry.id,
        title: entry.caseTitle || entry.title || entry.pageTitle || '未命名案例',
        thumbnailUrl: remapImagePath(entry.thumbnailPath || entry.imagePath || entry.imageUrl),
        sourceUrl: entry.sourceUrl,
        sourceDomain: entry.sourceDomain,
        discipline: entry.discipline,
        functionalPurpose: entry.functionalPurpose,
        distributionMedium: entry.distributionMedium || '静图',
        technicalMethod: entry.technicalMethod,
        contentType: entry.contentType,
        matchScore: score,
        matchLevel,
        recommendationReason: reasons.slice(0, 3).join('；') || '案例质量较高，可作为跨学科视觉参考。',
        borrowablePoints: borrowable(entry.borrowablePoints),
      })),
      fallbackMessage,
      appliedFilters: { discipline, teamType, goals, technicalMethods: desiredTechnicalMethods, medium: '静图' },
    } });
  } catch (error) {
    console.error('[studio] recommendation failed', error instanceof Error ? error.message : 'unknown error');
    res.status(500).json({ success: false, error: { code: 'STUDIO_RECOMMENDATION_FAILED', message: 'Recommendation service failed.' } });
  }
});
