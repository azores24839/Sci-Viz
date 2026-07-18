import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnalysisJob } from '@prisma/client';
import { isActiveAnalysisStatus, toAnalysisJobSnapshot } from '../src/services/analysisJobs.js';

function jobFixture(overrides: Partial<AnalysisJob> = {}): AnalysisJob {
  const now = new Date('2026-07-17T12:00:00.000Z');
  return {
    id: 'analysis-job-1',
    status: 'running',
    stage: 'analyzing',
    activeKey: 'qwen-vision',
    caseIdsJson: '["case-1","case-2","case-3","case-4"]',
    nextIndex: 1,
    totalCount: 4,
    processedCount: 1,
    analyzedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    currentCaseId: 'case-2',
    currentCaseTitle: 'A microscopy image',
    errorsJson: '[]',
    backupPath: '/tmp/backup.db',
    error: '',
    cancelRequested: false,
    startedAt: now,
    heartbeatAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('Qwen analysis snapshot exposes semantic-analysis counters and progress', () => {
  const snapshot = toAnalysisJobSnapshot(jobFixture());
  assert.equal(snapshot.progress, 25);
  assert.equal(snapshot.processed, snapshot.analyzed + snapshot.skipped + snapshot.failed);
  assert.equal(snapshot.currentCaseTitle, 'A microscopy image');

  const empty = toAnalysisJobSnapshot(jobFixture({ totalCount: 0, processedCount: 0 }));
  assert.equal(empty.progress, 100);
});

test('Qwen analysis active statuses include cooperative cancellation only', () => {
  assert.equal(isActiveAnalysisStatus('queued'), true);
  assert.equal(isActiveAnalysisStatus('running'), true);
  assert.equal(isActiveAnalysisStatus('cancelling'), true);
  assert.equal(isActiveAnalysisStatus('completed'), false);
  assert.equal(isActiveAnalysisStatus('cancelled'), false);
  assert.equal(isActiveAnalysisStatus('failed'), false);
});

test('Qwen analysis snapshot tolerates malformed stored error details', () => {
  const snapshot = toAnalysisJobSnapshot(jobFixture({ errorsJson: 'not-json' }));
  assert.deepEqual(snapshot.errors, []);
});
