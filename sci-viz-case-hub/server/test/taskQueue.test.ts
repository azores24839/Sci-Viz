import assert from 'node:assert/strict';
import test from 'node:test';
import { KeyedTaskQueue, TaskQueue } from '../src/services/taskQueue.js';

test('task queue enforces concurrency and bounded waiting capacity', async () => {
  let active = 0;
  let peak = 0;
  const releases: Array<() => void> = [];
  const queue = new TaskQueue(2, 1);
  const task = () => new Promise<void>(resolve => {
    active += 1;
    peak = Math.max(peak, active);
    releases.push(() => {
      active -= 1;
      resolve();
    });
  });

  assert.equal(queue.tryEnqueue(task), true);
  assert.equal(queue.tryEnqueue(task), true);
  assert.equal(queue.tryEnqueue(task), true);
  assert.equal(queue.tryEnqueue(task), false);
  assert.deepEqual(queue.size, { active: 2, waiting: 1 });

  releases.shift()!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(peak, 2);
  assert.deepEqual(queue.size, { active: 2, waiting: 0 });

  releases.splice(0).forEach(release => release());
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(queue.size, { active: 0, waiting: 0 });
});

test('keyed task queue deduplicates work until the original task settles', async () => {
  let release!: () => void;
  const queue = new KeyedTaskQueue(1, 0);
  const task = () => new Promise<void>(resolve => { release = resolve; });

  assert.equal(queue.tryEnqueue('case-1', task), 'queued');
  assert.equal(queue.tryEnqueue('case-1', task), 'duplicate');
  assert.equal(queue.tryEnqueue('case-2', task), 'full');
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queue.tryEnqueue('case-1', async () => {}), 'queued');
});
