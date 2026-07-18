import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicSourceDto } from '../src/services/publicSource.js';

test('public source DTO strips crawler diagnostics, strategy, notes, and job state', () => {
  const result = toPublicSourceDto({
    id: 1, name: 'Research source', url: 'https://example.com', category: '国际研究',
    sourceDomain: 'example.com', existingCases: 20,
    lastDiagnosis: 'internal failure detail', strategyHint: 'internal strategy', notes: 'private note',
    lastJob: { id: 9, error: 'private error' }, enabled: false,
  });
  assert.equal(result.name, 'Research source');
  assert.equal(result.sourceDomain, 'example.com');
  for (const field of ['lastDiagnosis', 'strategyHint', 'notes', 'lastJob', 'enabled']) {
    assert.equal(Object.hasOwn(result, field), false, `${field} must not be public`);
  }
});
