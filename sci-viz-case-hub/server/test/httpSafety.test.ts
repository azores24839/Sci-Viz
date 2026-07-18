import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicHttpUrl, normalizeHttpUrl, readResponseWithLimit } from '../src/utils/httpSafety.js';

test('HTTP URL normalization adds a scheme and rejects unsafe source URL formats', () => {
  assert.equal(normalizeHttpUrl('example.edu/research/image'), 'https://example.edu/research/image');
  assert.equal(normalizeHttpUrl('https://example.edu/source'), 'https://example.edu/source');
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(normalizeHttpUrl('https://user:secret@example.edu/source'), null);
});

test('SSRF validation rejects local, private, link-local, and mapped IPv6 literals', async () => {
  const blocked = [
    'http://127.0.0.1/image.png',
    'http://10.1.2.3/image.png',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/image.png',
    'http://[fc00::1]/image.png',
    'http://[fe80::1]/image.png',
    'http://[::ffff:172.16.0.1]/image.png',
    'http://[ff02::1]/image.png',
  ];

  for (const candidate of blocked) {
    await assert.rejects(() => assertPublicHttpUrl(candidate));
  }
});

test('bounded response reading cancels streams that exceed the byte limit', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(8));
    },
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(() => readResponseWithLimit(new Response(stream), 10), /Response too large/);
  assert.equal(cancelled, true);
});
