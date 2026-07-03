import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectWorkflow, StudioProject } from '@studio/contracts';
import { FileWorkspaceRepository, VersionConflictError } from './repository.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-workspace-')); roots.push(root);
  return new FileWorkspaceRepository(path.join(root, 'workspace.json'));
}

const project = (ownerUserId: string, name = 'Project'): StudioProject => {
  const stamp = new Date().toISOString();
  return { id: randomUUID(), ownerUserId, name, teamType: '', researchDirection: '', primaryAudience: '', projectType: 'PHOTO', status: 'DRAFT', createdAt: stamp, updatedAt: stamp };
};

const workflow = (projectId: string): ProjectWorkflow => {
  const stamp = new Date().toISOString();
  return { projectId, templateId: 'research-static-photo-v1', templateVersion: 3, revision: 1, states: [], selectedBenchmarkIds: [], createdAt: stamp, updatedAt: stamp };
};

describe('FileWorkspaceRepository', () => {
  it('isolates project lists by owner and hides archived projects', async () => {
    const repo = await setup(); const one = project('user_a', 'A'); const two = project('user_b', 'B');
    await repo.saveProject(one); await repo.saveProject(two);
    expect((await repo.listProjects('user_a')).map((item) => item.name)).toEqual(['A']);
    await repo.saveProject({ ...one, status: 'ARCHIVED', archivedAt: new Date().toISOString(), updatedAt: new Date(Date.now() + 1).toISOString() });
    expect(await repo.listProjects('user_a')).toEqual([]);
  });

  it('rejects stale project writes', async () => {
    const repo = await setup(); const value = project('user_a'); await repo.saveProject(value);
    await expect(repo.saveProject({ ...value, name: 'stale', updatedAt: new Date().toISOString() }, 'older-value')).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('uses workflow revisions as an optimistic lock', async () => {
    const repo = await setup(); const value = project('user_a'); await repo.saveProject(value);
    const initial = workflow(value.id); await repo.saveWorkflow('user_a', initial, 0);
    const updated = { ...initial, revision: 2, updatedAt: new Date(Date.now() + 1).toISOString() };
    await repo.saveWorkflow('user_a', updated, 1);
    await expect(repo.saveWorkflow('user_a', { ...updated, revision: 3 }, 1)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await repo.getWorkflow(value.id))?.revision).toBe(2);
  });
});
