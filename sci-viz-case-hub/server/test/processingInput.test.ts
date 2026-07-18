import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCaseIds } from '../src/services/processingInput.js';

test('processing case IDs are trimmed, deduplicated, and bounded', () => {
  assert.deepEqual(normalizeCaseIds([' case-1 ', 'case-1', 'case-2']), ['case-1', 'case-2']);
  assert.deepEqual(normalizeCaseIds(undefined), []);
  assert.equal(normalizeCaseIds('case-1'), null);
  assert.equal(normalizeCaseIds(['']), null);
  assert.equal(normalizeCaseIds(Array.from({ length: 201 }, (_, index) => `case-${index}`)), null);
});
