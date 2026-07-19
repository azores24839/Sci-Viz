import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldUseBrowserRendering } from '../src/crawler/browserPageRenderer.js';

test('browser fallback activates for a sparse JavaScript application shell', () => {
  const html = '<html><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
  assert.equal(shouldUseBrowserRendering(html, 0, 0), true);
});

test('browser fallback activates when a framework shell exposes only a logo', () => {
  const html = '<html><body><div id="app"><img src="/logo.png"></div><script src="/static/js/main.js"></script></body></html>';
  assert.equal(shouldUseBrowserRendering(html, 1, 0), true);
});

test('browser fallback stays off when static or embedded extraction is sufficient', () => {
  const shell = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
  assert.equal(shouldUseBrowserRendering(shell, 3, 0), false);
  assert.equal(shouldUseBrowserRendering(shell, 0, 4), false);
  assert.equal(shouldUseBrowserRendering('<html><body><main>Plain article</main></body></html>', 0, 0), false);
});
