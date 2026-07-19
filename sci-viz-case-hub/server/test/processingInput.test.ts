import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCaseIds, normalizeReviewStatuses } from '../src/services/processingInput.js';

test('processing case IDs are trimmed, deduplicated, and bounded', () => {
  assert.deepEqual(normalizeCaseIds([' case-1 ', 'case-1', 'case-2']), ['case-1', 'case-2']);
  assert.deepEqual(normalizeCaseIds(undefined), []);
  assert.equal(normalizeCaseIds('case-1'), null);
  assert.equal(normalizeCaseIds(['']), null);
  assert.equal(normalizeCaseIds(Array.from({ length: 201 }, (_, index) => `case-${index}`)), null);
});

test('processing review statuses are deduplicated and restricted to an allowlist', () => {
  const allowed = ['pending_ai_analysis', 'analysis_failed'];
  assert.deepEqual(normalizeReviewStatuses(['analysis_failed'], allowed), ['analysis_failed']);
  assert.deepEqual(normalizeReviewStatuses(['analysis_failed', 'analysis_failed'], allowed), ['analysis_failed']);
  assert.equal(normalizeReviewStatuses(undefined, allowed), undefined);
  assert.equal(normalizeReviewStatuses([], allowed), null);
  assert.equal(normalizeReviewStatuses(['approved'], allowed), null);
  assert.equal(normalizeReviewStatuses(['analysis_failed', 3], allowed), null);
});
