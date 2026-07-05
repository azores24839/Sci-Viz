import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResearchTask } from '@studio/contracts';
import { FileResearchRepository } from './repository.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('FileResearchRepository', () => {
  it('keeps project research tasks isolated and resumes pending work', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-research-')); roots.push(root);
    const repo = new FileResearchRepository(path.join(root, 'tasks.json'));
    const stamp = new Date().toISOString();
    const task = (projectId: string, status: ResearchTask['status']): ResearchTask => ({ id: randomUUID(), projectId, ownerUserId: 'user-a', mode: 'DEEP', query: '量子材料实验室', status, candidates: [], createdAt: stamp, updatedAt: stamp });
    await repo.save(task('11111111-1111-4111-8111-111111111111', 'QUEUED'));
    await repo.save(task('22222222-2222-4222-8222-222222222222', 'COMPLETED'));
    expect(await repo.list('11111111-1111-4111-8111-111111111111')).toHaveLength(1);
    expect(await repo.listPending()).toHaveLength(1);
  });
});
