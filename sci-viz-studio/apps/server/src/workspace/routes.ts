import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ArtifactVersionSchema,
  CreateStudioProjectRequestSchema,
  SaveProjectWorkflowRequestSchema,
  UpdateStudioProjectRequestSchema,
  type ProjectWorkflow,
  type StudioProject,
} from '@studio/contracts';
import { createDirectorWorkflowStates, researchPhotoWorkflowV1 } from '@studio/workflow-core';
import { VersionConflictError, type WorkspaceRepository } from './repository.js';

const now = () => new Date().toISOString();
const notFound = (reply: FastifyReply) => reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
const conflict = (reply: FastifyReply) => reply.code(409).send({ success: false, error: { code: 'VERSION_CONFLICT', message: '该内容已在其他页面更新，请刷新后重试。' } });

async function ownedProject(repo: WorkspaceRepository, request: FastifyRequest, id: string) {
  const project = await repo.getProject(id);
  return project?.ownerUserId === request.authUserId ? project : undefined;
}

export async function registerWorkspaceRoutes(app: FastifyInstance, repo: WorkspaceRepository) {
  app.get('/api/v1/projects', async (request) => ({ success: true, data: await repo.listProjects(request.authUserId) }));

  app.post('/api/v1/projects', async (request, reply) => {
    const parsed = CreateStudioProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_PROJECT', message: '请填写项目名称。' } });
    const stamp = now();
    const project: StudioProject = {
      id: randomUUID(), ownerUserId: request.authUserId, name: parsed.data.name,
      teamType: parsed.data.teamType ?? '', researchDirection: parsed.data.researchDirection ?? '', primaryAudience: parsed.data.primaryAudience ?? '',
      ...(parsed.data.primaryGoal ? { primaryGoal: parsed.data.primaryGoal } : {}),
      ...(parsed.data.secondaryGoal ? { secondaryGoal: parsed.data.secondaryGoal } : {}),
      projectType: 'PHOTO', status: 'DRAFT', createdAt: stamp, updatedAt: stamp,
    };
    const workflow: ProjectWorkflow = {
      projectId: project.id, templateId: researchPhotoWorkflowV1.id, templateVersion: researchPhotoWorkflowV1.version,
      revision: 1, states: createDirectorWorkflowStates(researchPhotoWorkflowV1), selectedBenchmarkIds: [],
      ...(project.primaryGoal ? { primaryGoal: project.primaryGoal } : {}), ...(project.secondaryGoal ? { secondaryGoal: project.secondaryGoal } : {}),
      createdAt: stamp, updatedAt: stamp,
    };
    await repo.saveProject(project);
    try { await repo.saveWorkflow(request.authUserId, workflow, 0); }
    catch (error) { request.log.error({ error, projectId: project.id }, 'Initial workflow creation failed'); return reply.code(500).send({ success: false, error: { code: 'PROJECT_INITIALIZATION_FAILED', message: '项目初始化失败，请重试。' } }); }
    return reply.code(201).send({ success: true, data: { project, workflow } });
  });

  app.get('/api/v1/projects/:id', async (request, reply) => {
    const project = await ownedProject(repo, request, (request.params as { id: string }).id);
    return project ? { success: true, data: project } : notFound(reply);
  });

  app.patch('/api/v1/projects/:id', async (request, reply) => {
    const project = await ownedProject(repo, request, (request.params as { id: string }).id);
    if (!project) return notFound(reply);
    const parsed = UpdateStudioProjectRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_PROJECT_UPDATE', message: '项目信息无效。' } });
    const { expectedUpdatedAt, ...changes } = parsed.data;
    const definedChanges = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Partial<StudioProject>;
    const updated: StudioProject = { ...project, ...definedChanges, updatedAt: now() };
    try { await repo.saveProject(updated, expectedUpdatedAt); return { success: true, data: updated }; }
    catch (error) { if (error instanceof VersionConflictError) return conflict(reply); throw error; }
  });

  app.delete('/api/v1/projects/:id', async (request, reply) => {
    const project = await ownedProject(repo, request, (request.params as { id: string }).id);
    if (!project) return notFound(reply);
    const stamp = now(); const archived: StudioProject = { ...project, status: 'ARCHIVED', archivedAt: stamp, updatedAt: stamp };
    await repo.saveProject(archived);
    return reply.code(204).send();
  });

  app.get('/api/v1/projects/:id/workflow', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!await ownedProject(repo, request, id)) return notFound(reply);
    const workflow = await repo.getWorkflow(id);
    return workflow ? { success: true, data: workflow } : reply.code(404).send({ success: false, error: { code: 'WORKFLOW_NOT_FOUND', message: '工作流不存在。' } });
  });

  app.put('/api/v1/projects/:id/workflow', async (request, reply) => {
    const id = (request.params as { id: string }).id; const project = await ownedProject(repo, request, id);
    if (!project) return notFound(reply);
    const parsed = SaveProjectWorkflowRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_WORKFLOW', message: '工作流状态无效。' } });
    const current = await repo.getWorkflow(id);
    if (!current) return reply.code(404).send({ success: false, error: { code: 'WORKFLOW_NOT_FOUND', message: '工作流不存在。' } });
    const updated: ProjectWorkflow = { ...current, states: parsed.data.states, selectedBenchmarkIds: parsed.data.selectedBenchmarkIds ?? current.selectedBenchmarkIds, revision: current.revision + 1, updatedAt: now(), ...(parsed.data.primaryGoal ? { primaryGoal: parsed.data.primaryGoal } : {}), ...(parsed.data.secondaryGoal ? { secondaryGoal: parsed.data.secondaryGoal } : {}) };
    try { await repo.saveWorkflow(request.authUserId, updated, parsed.data.expectedRevision); return { success: true, data: updated }; }
    catch (error) { if (error instanceof VersionConflictError) return conflict(reply); throw error; }
  });

  app.get('/api/v1/projects/:id/artifacts', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!await ownedProject(repo, request, id)) return notFound(reply);
    const nodeId = (request.query as { nodeId?: string }).nodeId;
    return { success: true, data: await repo.listArtifactVersions(id, nodeId) };
  });

  app.post('/api/v1/projects/:id/artifacts', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!await ownedProject(repo, request, id)) return notFound(reply);
    const existing = await repo.listArtifactVersions(id);
    const input = request.body as Record<string, unknown>;
    const nodeId = typeof input?.nodeId === 'string' ? input.nodeId : '';
    const version = Math.max(0, ...existing.filter((item) => item.nodeId === nodeId).map((item) => item.version)) + 1;
    const parsed = ArtifactVersionSchema.safeParse({ ...input, id: randomUUID(), projectId: id, version, createdAt: now() });
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_ARTIFACT', message: '产物内容无效。' } });
    await repo.saveArtifactVersion(request.authUserId, parsed.data);
    return reply.code(201).send({ success: true, data: parsed.data });
  });
}
