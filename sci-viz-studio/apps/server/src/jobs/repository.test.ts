import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentJob } from '@studio/contracts';
import { FileAgentJobRepository } from './repository.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
async function setup() { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-jobs-')); roots.push(root); return new FileAgentJobRepository(path.join(root, 'jobs.json')); }
const job = (key = 'request-0001'): AgentJob => { const stamp = new Date().toISOString(); return { id: randomUUID(), ownerUserId: 'user_a', projectId: 'project_a', idempotencyKey: key, status: 'QUEUED', attempt: 0, maxAttempts: 3, availableAt: stamp, request: { projectId: 'project_a', projectName: 'Project', nodeId: 'visual-diagnosis', nodeLabel: 'Diagnosis', agentRole: 'SOURCE_ANALYST', task: 'DIAGNOSE_VISUAL_STATE', inputLabel: 'sources', outputLabel: 'diagnosis', planLabel: 'Plan A', revision: 1, upstreamArtifacts: [] }, createdAt: stamp, updatedAt: stamp }; };

describe('FileAgentJobRepository', () => {
  it('deduplicates jobs per owner and idempotency key', async () => {
    const repo = await setup(); const first = job(); const second = { ...job(), idempotencyKey: first.idempotencyKey };
    expect((await repo.create(first)).id).toBe(first.id);
    expect((await repo.create(second)).id).toBe(first.id);
  });

  it('claims a queued job once and recovers interrupted work', async () => {
    const repo = await setup(); const value = job(); await repo.create(value);
    const claimed = await repo.claimNext(); expect(claimed).toMatchObject({ id: value.id, status: 'RUNNING', attempt: 1 });
    expect(await repo.claimNext()).toBeUndefined();
    expect(await repo.recoverInterrupted()).toBe(1);
    expect(await repo.claimNext()).toMatchObject({ id: value.id, status: 'RUNNING', attempt: 2 });
  });
});
