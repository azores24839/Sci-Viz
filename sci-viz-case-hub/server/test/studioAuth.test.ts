import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidStudioServiceKey } from '../src/services/studioAuth.js';

test('Studio service credential requires an exact non-empty match', () => {
  const configured = 'a-studio-service-secret-that-is-long-enough';
  assert.equal(isValidStudioServiceKey(configured, configured), true);
  assert.equal(isValidStudioServiceKey(`${configured}x`, configured), false);
  assert.equal(isValidStudioServiceKey('', configured), false);
  assert.equal(isValidStudioServiceKey(undefined, configured), false);
});
