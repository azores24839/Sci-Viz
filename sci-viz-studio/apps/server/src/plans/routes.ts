import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateShotCardRequestSchema, ReorderShotCardsRequestSchema, RestorePlanVersionRequestSchema,
  SavePlanRequestSchema, UpdateCaptureItemRequestSchema, UpdateShotCardRequestSchema,
  type CaptureItem, type PlanDocument, type PlanReadiness, type PlanVersion, type ShotCard,
} from '@studio/contracts';
import type { WorkspaceRepository } from '../workspace/repository.js';
import { PlanConflictError, type PlanRepository } from './repository.js';

const missing = (reply: FastifyReply) => reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
const conflict = (reply: FastifyReply) => reply.code(409).send({ success: false, error: { code: 'VERSION_CONFLICT', message: '内容已在其他页面更新，请同步最新版本后重试。' } });
async function owns(workspace: WorkspaceRepository, request: FastifyRequest, projectId: string) { return (await workspace.getProject(projectId))?.ownerUserId === request.authUserId; }

function readiness(plan: PlanDocument | undefined, cards: ShotCard[]): PlanReadiness {
  const risks = [...(plan?.content.risks ?? []), ...cards.flatMap((card) => card.risks)];
  const mustShotCount = cards.filter((card) => card.priority === 'MUST').length;
  const unresolvedBlockerCount = risks.filter((risk) => risk.severity === 'BLOCKER' && !risk.resolved).length;
  const reasons = [mustShotCount === 0 ? '至少需要一张必拍画面卡。' : '', unresolvedBlockerCount > 0 ? `仍有 ${unresolvedBlockerCount} 个阻断级风险未解决。` : ''].filter(Boolean);
  return { executable: reasons.length === 0, mustShotCount, unresolvedBlockerCount, reasons };
}

export async function registerPlanRoutes(app: FastifyInstance, deps: { plans: PlanRepository; workspace: WorkspaceRepository }) {
  app.get('/api/v1/projects/:id/plan', async (request, reply) => { const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); return { success: true, data: await deps.plans.getPlan(projectId) ?? null }; });

  app.put('/api/v1/projects/:id/plan', async (request, reply) => {
    const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply);
    const parsed = SavePlanRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_PLAN', message: '方案内容不完整。' } });
    const current = await deps.plans.getPlan(projectId); const stamp = new Date().toISOString(); const nextVersion = (current?.currentVersion ?? 0) + 1;
    const plan: PlanDocument = { projectId, title: parsed.data.title, currentVersion: nextVersion, content: parsed.data.content, createdAt: current?.createdAt ?? stamp, updatedAt: stamp };
    const version: PlanVersion = { id: randomUUID(), projectId, version: nextVersion, content: parsed.data.content, createdBy: parsed.data.createdBy, changeSummary: parsed.data.changeSummary, createdAt: stamp };
    try { await deps.plans.savePlan(request.authUserId, plan, version, parsed.data.expectedVersion); return { success: true, data: plan }; } catch (error) { if (error instanceof PlanConflictError) return conflict(reply); throw error; }
  });

  app.get('/api/v1/projects/:id/plan/versions', async (request, reply) => { const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); return { success: true, data: await deps.plans.listVersions(projectId) }; });

  app.post('/api/v1/projects/:id/plan/versions/:version/restore', async (request, reply) => {
    const { id: projectId, version: raw } = request.params as { id: string; version: string }; if (!await owns(deps.workspace, request, projectId)) return missing(reply);
    const parsed = RestorePlanVersionRequestSchema.safeParse(request.body); const targetNumber = Number(raw); if (!parsed.success || !Number.isInteger(targetNumber)) return reply.code(400).send({ success: false, error: { code: 'INVALID_PLAN_VERSION', message: '版本参数无效。' } });
    const [current, target] = await Promise.all([deps.plans.getPlan(projectId), deps.plans.getVersion(projectId, targetNumber)]); if (!current || !target) return reply.code(404).send({ success: false, error: { code: 'PLAN_VERSION_NOT_FOUND', message: '没有找到该历史版本。' } });
    const stamp = new Date().toISOString(); const next = current.currentVersion + 1; const plan: PlanDocument = { ...current, currentVersion: next, content: target.content, updatedAt: stamp }; const version: PlanVersion = { id: randomUUID(), projectId, version: next, content: target.content, createdBy: 'USER', changeSummary: `恢复自 v${targetNumber}`, createdAt: stamp };
    try { await deps.plans.savePlan(request.authUserId, plan, version, parsed.data.expectedVersion); return { success: true, data: plan }; } catch (error) { if (error instanceof PlanConflictError) return conflict(reply); throw error; }
  });

  app.get('/api/v1/projects/:id/shot-cards', async (request, reply) => { const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); return { success: true, data: await deps.plans.listShotCards(projectId) }; });

  app.post('/api/v1/projects/:id/shot-cards', async (request, reply) => {
    const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); const parsed = CreateShotCardRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_SHOT_CARD', message: '画面卡必须说明拍什么、为什么拍和怎么拍。' } });
    const stamp = new Date().toISOString(); const card: ShotCard = { id: randomUUID(), projectId, ...parsed.data, revision: 1, createdAt: stamp, updatedAt: stamp }; await deps.plans.saveShotCard(request.authUserId, card); return reply.code(201).send({ success: true, data: card });
  });

  app.patch('/api/v1/projects/:id/shot-cards/:cardId', async (request, reply) => {
    const { id: projectId, cardId } = request.params as { id: string; cardId: string }; if (!await owns(deps.workspace, request, projectId)) return missing(reply); const current = await deps.plans.getShotCard(cardId); if (!current || current.projectId !== projectId) return reply.code(404).send({ success: false, error: { code: 'SHOT_CARD_NOT_FOUND', message: '画面卡不存在。' } }); const parsed = UpdateShotCardRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_SHOT_CARD', message: '画面卡内容无效。' } });
    const { expectedRevision, ...changes } = parsed.data; const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Partial<ShotCard>; const updated: ShotCard = { ...current, ...defined, revision: current.revision + 1, updatedAt: new Date().toISOString() }; try { await deps.plans.saveShotCard(request.authUserId, updated, expectedRevision); return { success: true, data: updated }; } catch (error) { if (error instanceof PlanConflictError) return conflict(reply); throw error; }
  });

  app.delete('/api/v1/projects/:id/shot-cards/:cardId', async (request, reply) => { const { id: projectId, cardId } = request.params as { id: string; cardId: string }; if (!await owns(deps.workspace, request, projectId)) return missing(reply); const expected = Number((request.query as { expectedRevision?: string }).expectedRevision); const card = await deps.plans.getShotCard(cardId); if (!card || card.projectId !== projectId) return reply.code(404).send({ success: false, error: { code: 'SHOT_CARD_NOT_FOUND', message: '画面卡不存在。' } }); try { await deps.plans.removeShotCard(request.authUserId, cardId, expected); return reply.code(204).send(); } catch (error) { if (error instanceof PlanConflictError) return conflict(reply); throw error; } });

  app.put('/api/v1/projects/:id/shot-cards/order', async (request, reply) => { const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); const parsed = ReorderShotCardsRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_SHOT_ORDER', message: '画面卡顺序无效。' } }); try { await deps.plans.reorderShotCards(request.authUserId, projectId, parsed.data.orderedIds); return { success: true, data: await deps.plans.listShotCards(projectId) }; } catch (error) { if (error instanceof PlanConflictError) return conflict(reply); throw error; } });

  app.get('/api/v1/projects/:id/capture-items', async (request, reply) => { const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); return { success: true, data: await deps.plans.listCaptureItems(projectId) }; });

  app.patch('/api/v1/projects/:id/capture-items/:shotCardId', async (request, reply) => { const { id: projectId, shotCardId } = request.params as { id: string; shotCardId: string }; if (!await owns(deps.workspace, request, projectId)) return missing(reply); const current = (await deps.plans.listCaptureItems(projectId)).find((item) => item.shotCardId === shotCardId); if (!current) return reply.code(404).send({ success: false, error: { code: 'CAPTURE_ITEM_NOT_FOUND', message: '执行项不存在。' } }); const parsed = UpdateCaptureItemRequestSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_CAPTURE_ITEM', message: '执行项内容无效。' } }); const { expectedRevision, ...changes } = parsed.data; const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Partial<CaptureItem>; const updated: CaptureItem = { ...current, ...defined, revision: current.revision + 1, updatedAt: new Date().toISOString() }; try { await deps.plans.saveCaptureItem(request.authUserId, updated, expectedRevision); return { success: true, data: updated }; } catch (error) { if (error instanceof PlanConflictError) return conflict(reply); throw error; } });

  app.get('/api/v1/projects/:id/plan/readiness', async (request, reply) => { const projectId = (request.params as { id: string }).id; if (!await owns(deps.workspace, request, projectId)) return missing(reply); const [plan, cards] = await Promise.all([deps.plans.getPlan(projectId), deps.plans.listShotCards(projectId)]); return { success: true, data: readiness(plan, cards) }; });
}
