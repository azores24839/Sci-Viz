import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SourceDocument } from '@studio/contracts';
import { FileSourceRepository } from './repository.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('FileSourceRepository', () => {
  it('persists and filters project sources', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-')); roots.push(root);
    const repo = new FileSourceRepository(path.join(root, 'sources.json'));
    const stamp = new Date().toISOString();
    const source: SourceDocument = { id: 'one', projectId: 'p1', kind: 'TEXT', status: 'QUEUED', selected: true, title: 'Test', rawText: 'Body', truncated: false, createdAt: stamp, updatedAt: stamp };
    await repo.save(source);
    expect(await repo.get('one')).toEqual(source);
    expect(await repo.list('p1')).toHaveLength(1);
    expect(await repo.list('p2')).toHaveLength(0);
    expect(await repo.listPending()).toHaveLength(1);
  });
});
