import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AgentJob } from '@studio/contracts';
import { registerAgentJobRoutes } from './routes.js';
import type { AgentJobRepository } from './repository.js';
import type { AgentJobProcessor } from './processor.js';

function failedJob(): AgentJob {
  const stamp = new Date().toISOString();
  return { id: randomUUID(), ownerUserId: 'user-1', projectId: 'project-1', idempotencyKey: 'project-1:node:v1', status: 'FAILED', attempt: 3, maxAttempts: 3, availableAt: stamp, request: { projectId: 'project-1', projectName: 'P', nodeId: 'node', nodeLabel: 'N', agentRole: 'SOURCE_ANALYST', task: 'DIAGNOSE_VISUAL_STATE', inputLabel: 'i', outputLabel: 'o', planLabel: 'Plan A', revision: 1, upstreamArtifacts: [] }, error: { code: 'MODEL_TIMEOUT', message: '超时', retryable: true }, createdAt: stamp, updatedAt: stamp, completedAt: stamp };
}

describe('agent job routes', () => {
  it('requeues a retryable failed job without creating another job', async () => {
    const job = failedJob(); const save = vi.fn(async (updated: AgentJob) => { Object.assign(job, updated); }); const wake = vi.fn();
    const repo = { get: vi.fn(async () => job), save } as unknown as AgentJobRepository;
    const app = Fastify(); app.addHook('onRequest', async (request) => { request.authUserId = 'user-1'; });
    await registerAgentJobRoutes(app, { repo, processor: { wake } as unknown as AgentJobProcessor, ownsProject: async () => true, dailyLimit: { consume: async () => {} } });
    const response = await app.inject({ method: 'POST', url: `/api/v1/agent-jobs/${job.id}/retry` });
    expect(response.statusCode).toBe(202); expect(response.json().data).toMatchObject({ id: job.id, status: 'QUEUED', attempt: 0 }); expect(save).toHaveBeenCalledOnce(); expect(wake).toHaveBeenCalledOnce(); await app.close();
  });

  it('refuses manual retry for a non-retryable error', async () => {
    const job = failedJob(); job.error = { code: 'AGENT_OUTPUT_INVALID', message: '格式错误', retryable: false };
    const app = Fastify(); app.addHook('onRequest', async (request) => { request.authUserId = 'user-1'; });
    await registerAgentJobRoutes(app, { repo: { get: async () => job } as unknown as AgentJobRepository, processor: { wake: vi.fn() } as unknown as AgentJobProcessor, ownsProject: async () => true, dailyLimit: { consume: async () => {} } });
    const response = await app.inject({ method: 'POST', url: `/api/v1/agent-jobs/${job.id}/retry` });
    expect(response.statusCode).toBe(409); expect(response.json().error.code).toBe('AGENT_JOB_NOT_RETRYABLE'); await app.close();
  });
});
