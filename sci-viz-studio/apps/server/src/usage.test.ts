import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createUsageLimiter } from './usage.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe('file usage limiter', () => {
  it('counts per user and rejects usage above the daily limit', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-usage-')); roots.push(root);
    const limiter = createUsageLimiter({ USAGE_DATABASE_PATH: path.join(root, 'usage.json'), USER_DAILY_AI_LIMIT: '2' });
    await limiter.consume('user_a');
    await limiter.consume('user_a');
    await expect(limiter.getUsage('user_a')).resolves.toMatchObject({ used: 2, limit: 2, remaining: 0 });
    await expect(limiter.consume('user_a')).rejects.toThrow('AI_DAILY_QUOTA_EXCEEDED');
    await expect(limiter.consume('user_b')).resolves.toBeUndefined();
    await expect(limiter.getUsage('user_b')).resolves.toMatchObject({ used: 1, limit: 2, remaining: 1 });
  });

  it('serializes concurrent consumption so the limit cannot be bypassed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-usage-')); roots.push(root);
    const limiter = createUsageLimiter({ USAGE_DATABASE_PATH: path.join(root, 'usage.json'), USER_DAILY_AI_LIMIT: '1' });
    const results = await Promise.allSettled([limiter.consume('user_a'), limiter.consume('user_a')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
