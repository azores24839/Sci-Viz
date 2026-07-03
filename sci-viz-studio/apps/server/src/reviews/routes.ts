import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateReviewLinkRequestSchema, SubmitReviewResponseRequestSchema,
  type PlanReadiness, type PublicReviewSnapshot, type ReviewLink, type ReviewResponse,
} from '@studio/contracts';
import type { PlanRepository } from '../plans/repository.js';
import type { WorkspaceRepository } from '../workspace/repository.js';
import type { ReviewRepository, StoredReviewLink } from './repository.js';

function tokenHash(token: string, secret: string) { return createHmac('sha256', secret).update(token).digest('hex'); }
function publicLink(link: StoredReviewLink): ReviewLink { const { ownerUserId: _owner, tokenHash: _hash, ...safe } = link; return safe; }

export function reviewTokenSecret(env: NodeJS.ProcessEnv) {
  const secret = env.REVIEW_TOKEN_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === 'production') throw new Error('REVIEW_TOKEN_SECRET is required in production.');
  return 'local-review-secret-change-before-production';
}

async function owns(workspace: WorkspaceRepository, request: FastifyRequest, projectId: string) { return (await workspace.getProject(projectId))?.ownerUserId === request.authUserId; }
const missingProject = (reply: FastifyReply) => reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });

export async function registerReviewRoutes(app: FastifyInstance, deps: { reviews: ReviewRepository; plans: PlanRepository; workspace: WorkspaceRepository; env: NodeJS.ProcessEnv }) {
  const secret = reviewTokenSecret(deps.env);
  const resolve = async (token: string, reply: FastifyReply) => {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) { reply.code(404).send({ success: false, error: { code: 'REVIEW_LINK_INVALID', message: '审核链接无效。' } }); return undefined; }
    const link = await deps.reviews.findLinkByHash(tokenHash(token, secret));
    if (!link) { reply.code(404).send({ success: false, error: { code: 'REVIEW_LINK_INVALID', message: '审核链接无效。' } }); return undefined; }
    if (link.revokedAt) { reply.code(410).send({ success: false, error: { code: 'REVIEW_LINK_REVOKED', message: '审核链接已撤销。' } }); return undefined; }
    if (Date.parse(link.expiresAt) <= Date.now()) { reply.code(410).send({ success: false, error: { code: 'REVIEW_LINK_EXPIRED', message: '审核链接已过期。' } }); return undefined; }
    return link;
  };

  app.post('/api/v1/projects/:id/review-links', async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    if (!await owns(deps.workspace, request, projectId)) return missingProject(reply);
    const parsed = CreateReviewLinkRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_REVIEW_LINK', message: '审核链接参数无效。' } });
    const token = randomBytes(32).toString('base64url'); const createdAt = new Date().toISOString();
    const link: StoredReviewLink = { id: randomUUID(), projectId, ownerUserId: request.authUserId, tokenHash: tokenHash(token, secret), label: parsed.data.label, createdAt, expiresAt: new Date(Date.now() + parsed.data.expiresInHours * 3_600_000).toISOString() };
    await deps.reviews.saveLink(link); await deps.reviews.addAudit({ id: randomUUID(), reviewLinkId: link.id, projectId, action: 'CREATED', createdAt });
    const base = (deps.env.PUBLIC_WEB_URL ?? '').replace(/\/$/, '');
    return reply.code(201).send({ success: true, data: { ...publicLink(link), token, reviewUrl: `${base}/review/${token}` } });
  });

  app.get('/api/v1/projects/:id/review-links', async (request, reply) => {
    const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missingProject(reply);
    return { success: true, data: (await deps.reviews.listLinks(projectId)).map(publicLink) };
  });

  app.delete('/api/v1/projects/:id/review-links/:linkId', async (request, reply) => {
    const { id: projectId, linkId } = request.params as { id: string; linkId: string }; if (!await owns(deps.workspace, request, projectId)) return missingProject(reply);
    const stamp = new Date().toISOString(); const revoked = await deps.reviews.revokeLink(linkId, request.authUserId, stamp);
    if (!revoked) return reply.code(404).send({ success: false, error: { code: 'REVIEW_LINK_NOT_FOUND', message: '审核链接不存在。' } });
    await deps.reviews.addAudit({ id: randomUUID(), reviewLinkId: linkId, projectId, action: 'REVOKED', createdAt: stamp }); return reply.code(204).send();
  });

  app.get('/api/v1/projects/:id/review-responses', async (request, reply) => {
    const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missingProject(reply);
    return { success: true, data: { responses: await deps.reviews.listResponses(projectId), audit: await deps.reviews.listAudit(projectId) } };
  });

  app.get('/api/v1/review/:token', async (request, reply) => {
    const token = (request.params as { token: string }).token; const link = await resolve(token, reply); if (!link) return;
    const [project, plan, cards, responses] = await Promise.all([deps.workspace.getProject(link.projectId), deps.plans.getPlan(link.projectId), deps.plans.listShotCards(link.projectId), deps.reviews.listResponses(link.projectId)]);
    if (!project || !plan) return reply.code(404).send({ success: false, error: { code: 'REVIEW_CONTENT_NOT_FOUND', message: '审核内容尚未准备好。' } });
    const allRisks = [...plan.content.risks, ...cards.flatMap((card) => card.risks)]; const mustShotCount = cards.filter((card) => card.priority === 'MUST').length; const unresolvedBlockerCount = allRisks.filter((risk) => risk.severity === 'BLOCKER' && !risk.resolved).length;
    const ready: PlanReadiness = { executable: mustShotCount > 0 && unresolvedBlockerCount === 0, mustShotCount, unresolvedBlockerCount, reasons: [mustShotCount === 0 ? '至少需要一张必拍画面卡。' : '', unresolvedBlockerCount ? `仍有 ${unresolvedBlockerCount} 个阻断级风险未解决。` : ''].filter(Boolean) };
    const stripRisk = ({ sourceIds: _sourceIds, ...risk }: (typeof allRisks)[number]) => risk;
    const snapshot: PublicReviewSnapshot = {
      reviewLinkId: link.id, project: { name: project.name, teamType: project.teamType, researchDirection: project.researchDirection, primaryAudience: project.primaryAudience },
      plan: { title: plan.title, version: plan.currentVersion, executiveSummary: plan.content.executiveSummary, goals: plan.content.goals, visualDiagnosis: plan.content.visualDiagnosis, benchmarkSummary: plan.content.benchmarkSummary, curationStrategy: plan.content.curationStrategy, shootingApproach: plan.content.shootingApproach },
      risks: plan.content.risks.map(stripRisk), shotCards: cards.map((card) => ({ id: card.id, title: card.title, purpose: card.purpose, subject: card.subject, scene: card.scene, peopleEquipmentMaterials: card.peopleEquipmentMaterials, shotSize: card.shotSize, cameraAngle: card.cameraAngle, composition: card.composition, lighting: card.lighting, colorTone: card.colorTone, action: card.action, scienceInfo: card.scienceInfo, priority: card.priority, risks: card.risks.map(stripRisk), sortOrder: card.sortOrder })),
      readiness: ready, expiresAt: link.expiresAt, submitted: responses.some((item) => item.reviewLinkId === link.id),
    };
    const stamp = new Date().toISOString(); await deps.reviews.touchLink(link.id, stamp); await deps.reviews.addAudit({ id: randomUUID(), reviewLinkId: link.id, projectId: link.projectId, action: 'ACCESSED', createdAt: stamp });
    return { success: true, data: snapshot };
  });

  app.post('/api/v1/review/:token/responses', async (request, reply) => {
    const token = (request.params as { token: string }).token; const link = await resolve(token, reply); if (!link) return;
    const parsed = SubmitReviewResponseRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_REVIEW_RESPONSE', message: '请填写审核人和有效的审核意见。' } });
    const response: ReviewResponse = { id: randomUUID(), reviewLinkId: link.id, projectId: link.projectId, ...parsed.data, status: 'PENDING', submittedAt: new Date().toISOString() };
    if (!await deps.reviews.saveResponse(response)) return reply.code(409).send({ success: false, error: { code: 'REVIEW_ALREADY_SUBMITTED', message: '该审核链接已经提交过。' } });
    await deps.reviews.addAudit({ id: randomUUID(), reviewLinkId: link.id, projectId: link.projectId, action: 'SUBMITTED', createdAt: response.submittedAt });
    return reply.code(201).send({ success: true, data: response });
  });
}
