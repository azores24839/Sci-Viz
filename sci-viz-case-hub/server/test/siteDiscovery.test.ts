import assert from 'node:assert/strict';
import test from 'node:test';
import { isUnresolvedDynamicShell } from '../src/crawler/siteDiscovery.js';

test('marks an empty JavaScript app shell as unresolved instead of low-yield', () => {
  const html = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
  assert.equal(isUnresolvedDynamicShell(html, 0, 0), true);
});

test('does not mark shells whose embedded data or rendered markup yielded images', () => {
  const html = '<html><body><div id="root"></div></body></html>';
  assert.equal(isUnresolvedDynamicShell(html, 1, 0), false);
  assert.equal(isUnresolvedDynamicShell(html, 0, 2), false);
});

test('does not mark an ordinary text page as a JavaScript shell', () => {
  const html = '<html><body><main><h1>Research news</h1><p>Server-rendered article content.</p></main></body></html>';
  assert.equal(isUnresolvedDynamicShell(html, 0, 0), false);
});
