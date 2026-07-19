import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkbenchQueuePanels } from '../src/services/workbenchQueue.js';

test('workbench queue keeps preflight, analysis failure, and missing provenance separate', () => {
  const panels = buildWorkbenchQueuePanels({
    pendingQuality: 1,
    pendingAnalysis: 2,
    needsReview: 3,
    lowConfidence: 4,
    approved: 5,
    analysisFailed: 6,
    sourceMissing: 7,
  });
  const byKey = new Map(panels.map(panel => [panel.key, panel]));

  assert.deepEqual(panels.map(panel => panel.key), [
    'pending_quality',
    'pending_ocr',
    'needs_review',
    'low_confidence',
    'approved',
    'failed',
    'source_missing',
  ]);
  assert.equal(byKey.get('pending_quality')?.count, 1);
  assert.equal(byKey.get('pending_ocr')?.count, 2);
  assert.equal(byKey.get('failed')?.count, 6);
  assert.equal(byKey.get('failed')?.retryableCount, 6);
  assert.equal(byKey.get('source_missing')?.count, 7);
  assert.equal(byKey.has('pending_classify'), false);
});

