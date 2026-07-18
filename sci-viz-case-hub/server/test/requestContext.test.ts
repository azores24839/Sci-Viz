import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRequestId } from '../src/middleware/requestContext.js';

test('request IDs preserve safe correlation values and reject log-injection input', () => {
  assert.equal(resolveRequestId('request-12345678'), 'request-12345678');
  const generated = resolveRequestId('bad\nforged-log-entry');
  assert.match(generated, /^[0-9a-f-]{36}$/);
});
