import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanDocument, PlanVersion, ShotCard } from '@studio/contracts';
import { FilePlanRepository, PlanConflictError } from './repository.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
async function setup() { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-plans-')); roots.push(root); return new FilePlanRepository(path.join(root, 'plans.json')); }
const content = { executiveSummary: '', goals: '', visualDiagnosis: '', benchmarkSummary: '', curationStrategy: '', shootingApproach: '', risks: [], sourceIds: [] };
function plan(projectId: string, version = 1): { plan: PlanDocument; version: PlanVersion } { const stamp = new Date().toISOString(); return { plan: { projectId, title: 'Plan', currentVersion: version, content, createdAt: stamp, updatedAt: stamp }, version: { id: randomUUID(), projectId, version, content, createdBy: 'USER', changeSummary: '', createdAt: stamp } }; }
function card(projectId: string): ShotCard { const stamp = new Date().toISOString(); return { id: randomUUID(), projectId, title: 'Wide lab', purpose: 'Show scale', subject: 'Main equipment', scene: 'Laboratory', peopleEquipmentMaterials: [], shotSize: 'Wide', cameraAngle: 'Eye level', composition: 'Equipment centered', lighting: 'Available light', colorTone: '', action: 'Researcher operates equipment', scienceInfo: '', priority: 'MUST', risks: [], referenceCaseIds: [], referenceImageUrls: [], sortOrder: 0, revision: 1, createdAt: stamp, updatedAt: stamp }; }

describe('FilePlanRepository', () => {
  it('creates immutable versions and rejects stale plan saves', async () => {
    const repo = await setup(); const projectId = randomUUID(); const first = plan(projectId); await repo.savePlan('u', first.plan, first.version, 0);
    const second = plan(projectId, 2); await repo.savePlan('u', second.plan, second.version, 1);
    await expect(repo.savePlan('u', { ...second.plan, currentVersion: 3 }, { ...second.version, id: randomUUID(), version: 3 }, 1)).rejects.toBeInstanceOf(PlanConflictError);
    expect((await repo.listVersions(projectId)).map((item) => item.version)).toEqual([2, 1]);
  });

  it('creates a capture item with every shot card and cascades deletion', async () => {
    const repo = await setup(); const projectId = randomUUID(); const value = card(projectId); await repo.saveShotCard('u', value);
    expect(await repo.listCaptureItems(projectId)).toMatchObject([{ shotCardId: value.id, status: 'TODO', revision: 1 }]);
    await repo.removeShotCard('u', value.id, 1);
    expect(await repo.listShotCards(projectId)).toEqual([]); expect(await repo.listCaptureItems(projectId)).toEqual([]);
  });

  it('rejects stale shot and capture updates', async () => {
    const repo = await setup(); const projectId = randomUUID(); const value = card(projectId); await repo.saveShotCard('u', value);
    await expect(repo.saveShotCard('u', { ...value, revision: 2 }, 2)).rejects.toBeInstanceOf(PlanConflictError);
    const capture = (await repo.listCaptureItems(projectId))[0]!;
    await expect(repo.saveCaptureItem('u', { ...capture, revision: 2 }, 2)).rejects.toBeInstanceOf(PlanConflictError);
  });
});
