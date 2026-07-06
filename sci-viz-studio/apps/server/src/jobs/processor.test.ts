import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentJob } from '@studio/contracts';
import { AgentJobProcessor, classifyAgentJobError } from './processor.js';
import { FileAgentJobRepository } from './repository.js';

const roots: string[] = []; const processors: AgentJobProcessor[] = [];
afterEach(async () => { processors.splice(0).forEach((processor) => processor.stop()); await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('AgentJobProcessor', () => {
  it('sanitizes model parser errors before persistence', () => {
    expect(classifyAgentJobError(new Error(`Unexpected token '#', "## 视觉现状诊断" is not valid JSON`))).toEqual({
      code: 'AGENT_OUTPUT_INVALID',
      message: '这次生成的内容格式不完整，系统会重新尝试。',
      retryable: true,
    });
    expect(classifyAgentJobError(new Error('secret internal provider detail'))).toEqual({
      code: 'AGENT_JOB_FAILED',
      message: '这次没有生成可用结果，请稍后重新运行。',
      retryable: true,
    });
  });

  it('persists a completed result', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-processor-')); roots.push(root); const repo = new FileAgentJobRepository(path.join(root, 'jobs.json'));
    const stamp = new Date().toISOString(); const value: AgentJob = { id: randomUUID(), ownerUserId: 'u', projectId: 'p', idempotencyKey: 'request-0001', status: 'QUEUED', attempt: 0, maxAttempts: 3, availableAt: stamp, request: { projectId: 'p', projectName: 'P', nodeId: 'n', nodeLabel: 'N', agentRole: 'SOURCE_ANALYST', task: 'DIAGNOSE_VISUAL_STATE', inputLabel: 'i', outputLabel: 'o', planLabel: 'A', revision: 1, upstreamArtifacts: [] }, createdAt: stamp, updatedAt: stamp };
    await repo.create(value); const processor = new AgentJobProcessor(repo, async () => ({ label: 'done', body: 'result', blockerCount: 0, provider: 'mock', evidence: [], structured: { role: 'SOURCE_ANALYST', observations: [], gaps: [] } }), 1); processors.push(processor); await processor.start();
    await expect.poll(async () => (await repo.get(value.id))?.status, { timeout: 2000 }).toBe('COMPLETED');
    expect((await repo.get(value.id))?.result?.body).toBe('result');
  });

  it('does not persist an invalid model result as completed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-processor-')); roots.push(root); const repo = new FileAgentJobRepository(path.join(root, 'jobs.json'));
    const stamp = new Date().toISOString(); const value: AgentJob = { id: randomUUID(), ownerUserId: 'u', projectId: 'p', idempotencyKey: 'request-invalid', status: 'QUEUED', attempt: 0, maxAttempts: 1, availableAt: stamp, request: { projectId: 'p', projectName: 'P', nodeId: 'n', nodeLabel: 'N', agentRole: 'SOURCE_ANALYST', task: 'DIAGNOSE_VISUAL_STATE', inputLabel: 'i', outputLabel: 'o', planLabel: 'A', revision: 1, upstreamArtifacts: [] }, createdAt: stamp, updatedAt: stamp };
    await repo.create(value); const processor = new AgentJobProcessor(repo, async () => ({ label: '', body: '', blockerCount: -1, provider: 'mock', evidence: [], structured: { role: 'SOURCE_ANALYST', observations: [], gaps: [] } }), 1); processors.push(processor); await processor.start();
    await expect.poll(async () => (await repo.get(value.id))?.status, { timeout: 2000 }).toBe('FAILED');
    expect((await repo.get(value.id))?.error?.code).toBe('AGENT_OUTPUT_INVALID');
    expect((await repo.get(value.id))?.result).toBeUndefined();
  });
});
