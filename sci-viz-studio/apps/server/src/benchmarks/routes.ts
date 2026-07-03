import type { FastifyInstance } from 'fastify';
import { BenchmarkRecommendationRequestSchema, SaveBenchmarkSelectionRequestSchema, type ProjectWorkflow } from '@studio/contracts';
import type { WorkspaceRepository } from '../workspace/repository.js';
import { VersionConflictError } from '../workspace/repository.js';
import { CaseHubUnavailableError, fetchCaseHubRecommendations } from './client.js';

function inferDiscipline(value: string) {
  if (/(material|材料|纳米|高分子)/i.test(value)) return '材料';
  if (/(环境|生态|污染|气候)/i.test(value)) return '环境科学';
  if (/(医学|医疗|临床|生物|细胞|基因)/i.test(value)) return '医学';
  if (/(信息|计算机|人工智能|AI|电子|芯片)/i.test(value)) return '信息科学';
  if (/(工程|装备|机械|海洋|能源|制造|建筑)/i.test(value)) return '工程';
  return value;
}

export async function registerBenchmarkRoutes(app: FastifyInstance, deps: { workspace: WorkspaceRepository; env: NodeJS.ProcessEnv }) {
  const owned = async (userId: string, projectId: string) => (await deps.workspace.getProject(projectId))?.ownerUserId === userId;

  app.post('/api/v1/projects/:id/benchmarks/recommendations', async (request, reply) => {
    const projectId = (request.params as { id: string }).id; const project = await deps.workspace.getProject(projectId);
    if (!project || project.ownerUserId !== request.authUserId) return reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
    const requestInput = request.body as Record<string, unknown> | undefined;
    const parsed = BenchmarkRecommendationRequestSchema.safeParse({
      discipline: requestInput?.discipline ?? inferDiscipline(project.researchDirection),
      teamType: requestInput?.teamType ?? project.teamType,
      goals: requestInput?.goals ?? [project.primaryGoal, project.secondaryGoal].filter(Boolean),
      technicalMethods: requestInput?.technicalMethods ?? [], limit: requestInput?.limit ?? 6,
    });
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_BENCHMARK_REQUEST', message: '对标条件无效。' } });
    try { return { success: true, data: await fetchCaseHubRecommendations(deps.env, parsed.data) }; }
    catch (error) { request.log.error({ error, projectId }, 'Case Hub recommendations failed'); const unavailable = error instanceof CaseHubUnavailableError; return reply.code(unavailable ? 503 : 502).send({ success: false, error: { code: 'CASE_HUB_UNAVAILABLE', message: '案例库暂时无法访问，项目内容已保留，请稍后重试。', retryable: true } }); }
  });

  app.get('/api/v1/projects/:id/benchmarks/selection', async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    if (!await owned(request.authUserId, projectId)) return reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
    const workflow = await deps.workspace.getWorkflow(projectId);
    return { success: true, data: { selectedIds: workflow?.selectedBenchmarkIds ?? [], revision: workflow?.revision ?? 0 } };
  });

  app.put('/api/v1/projects/:id/benchmarks/selection', async (request, reply) => {
    const projectId = (request.params as { id: string }).id;
    if (!await owned(request.authUserId, projectId)) return reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
    const parsed = SaveBenchmarkSelectionRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_BENCHMARK_SELECTION', message: '对标案例选择无效。' } });
    const current = await deps.workspace.getWorkflow(projectId);
    if (!current) return reply.code(404).send({ success: false, error: { code: 'WORKFLOW_NOT_FOUND', message: '工作流不存在。' } });
    const updated: ProjectWorkflow = { ...current, selectedBenchmarkIds: parsed.data.selectedIds, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    try { await deps.workspace.saveWorkflow(request.authUserId, updated, parsed.data.expectedRevision); return { success: true, data: { selectedIds: updated.selectedBenchmarkIds, revision: updated.revision } }; }
    catch (error) { if (error instanceof VersionConflictError) return reply.code(409).send({ success: false, error: { code: 'VERSION_CONFLICT', message: '对标选择已在其他页面更新，请刷新后重试。' } }); throw error; }
  });
}
