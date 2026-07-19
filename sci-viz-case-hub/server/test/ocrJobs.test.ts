import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import type { OcrJob } from '@prisma/client';
import { isActiveOcrStatus, localPathFromWebPath, toOcrJobSnapshot } from '../src/services/ocrJobs.js';
import { isAppleVisionOcrEnabled } from '../src/services/ocrPolicy.js';

function jobFixture(overrides: Partial<OcrJob> = {}): OcrJob {
  const now = new Date('2026-07-17T12:00:00.000Z');
  return {
    id: 'job-1',
    status: 'running',
    stage: 'ocr',
    activeKey: 'global',
    caseIdsJson: '["case-1","case-2","case-3"]',
    nextIndex: 1,
    totalCount: 3,
    processedCount: 1,
    updatedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    currentCaseId: 'case-2',
    currentCaseTitle: 'A specimen label',
    currentMethod: 'local',
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

test('OCR snapshot exposes real counters and bounded progress', () => {
  const snapshot = toOcrJobSnapshot(jobFixture());
  assert.equal(snapshot.progress, 33);
  assert.equal(snapshot.processed, snapshot.updated + snapshot.skipped + snapshot.failed);
  assert.equal(snapshot.currentCaseTitle, 'A specimen label');

  const empty = toOcrJobSnapshot(jobFixture({ totalCount: 0, processedCount: 0 }));
  assert.equal(empty.progress, 100);
});

test('OCR active statuses include cooperative cancellation only', () => {
  assert.equal(isActiveOcrStatus('queued'), true);
  assert.equal(isActiveOcrStatus('running'), true);
  assert.equal(isActiveOcrStatus('cancelling'), true);
  assert.equal(isActiveOcrStatus('completed'), false);
  assert.equal(isActiveOcrStatus('cancelled'), false);
  assert.equal(isActiveOcrStatus('failed'), false);
});

test('OCR local paths resolve to real server roots and reject traversal', () => {
  assert.equal(
    localPathFromWebPath('/uploads/originals/example.jpg'),
    path.resolve(process.cwd(), 'uploads/originals/example.jpg'),
  );
  assert.equal(
    localPathFromWebPath('/journal_covers/example.jpg'),
    path.resolve(process.cwd(), '../../journal_covers/example.jpg'),
  );
  assert.equal(localPathFromWebPath('/uploads/../../.env'), '');
  assert.equal(localPathFromWebPath('https://example.com/image.jpg'), '');
});

test('Apple Vision OCR only enables on an explicit true value', () => {
  assert.equal(isAppleVisionOcrEnabled(''), false);
  assert.equal(isAppleVisionOcrEnabled('false'), false);
  assert.equal(isAppleVisionOcrEnabled('true'), true);
});
