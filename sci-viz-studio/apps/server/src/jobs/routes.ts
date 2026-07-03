import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { CreateAgentJobRequestSchema, type AgentJob } from '@studio/contracts';
import type { AgentJobProcessor } from './processor.js';
import type { AgentJobRepository } from './repository.js';

export async function registerAgentJobRoutes(app: FastifyInstance, deps: { repo: AgentJobRepository; processor: AgentJobProcessor; ownsProject: (userId: string, projectId: string) => Promise<boolean>; dailyLimit: { consume(userId: string): Promise<void> } }) {
  app.post('/api/v1/agent-jobs', async (request, reply) => {
    const parsed = CreateAgentJobRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_AGENT_JOB', message: 'AI 任务参数无效。' } });
    if (!await deps.ownsProject(request.authUserId, parsed.data.draft.projectId)) return reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
    const existing = await deps.repo.findByIdempotencyKey(request.authUserId, parsed.data.idempotencyKey);
    if (existing) return reply.code(200).send({ success: true, data: existing });
    try { await deps.dailyLimit.consume(request.authUserId); }
    catch { return reply.code(429).send({ success: false, error: { code: 'USER_QUOTA_EXCEEDED', message: '今天的 AI 使用额度已用完。' } }); }
    const stamp = new Date().toISOString();
    const job: AgentJob = { id: randomUUID(), ownerUserId: request.authUserId, projectId: parsed.data.draft.projectId, idempotencyKey: parsed.data.idempotencyKey, status: 'QUEUED', attempt: 0, maxAttempts: 3, availableAt: stamp, request: parsed.data.draft, createdAt: stamp, updatedAt: stamp };
    const created = await deps.repo.create(job); deps.processor.wake();
    return reply.code(202).send({ success: true, data: created });
  });

  app.get('/api/v1/agent-jobs/:id', async (request, reply) => {
    const job = await deps.repo.get((request.params as { id: string }).id);
    if (!job || job.ownerUserId !== request.authUserId) return reply.code(404).send({ success: false, error: { code: 'AGENT_JOB_NOT_FOUND', message: 'AI 任务不存在。' } });
    return { success: true, data: job };
  });

  app.post('/api/v1/agent-jobs/:id/retry', async (request, reply) => {
    const job = await deps.repo.get((request.params as { id: string }).id);
    if (!job || job.ownerUserId !== request.authUserId) return reply.code(404).send({ success: false, error: { code: 'AGENT_JOB_NOT_FOUND', message: 'AI 任务不存在。' } });
    if (job.status !== 'FAILED') return reply.code(409).send({ success: false, error: { code: 'AGENT_JOB_NOT_RETRYABLE', message: '只有失败的任务可以重新运行。' } });
    if (!job.error?.retryable) return reply.code(409).send({ success: false, error: { code: 'AGENT_JOB_NOT_RETRYABLE', message: '这个问题需要调整输入后重新生成。' } });
    const stamp = new Date().toISOString();
    const retried: AgentJob = { ...job, status: 'QUEUED', attempt: 0, availableAt: stamp, error: undefined, completedAt: undefined, startedAt: undefined, updatedAt: stamp };
    await deps.repo.save(retried); deps.processor.wake();
    return reply.code(202).send({ success: true, data: retried });
  });
}
