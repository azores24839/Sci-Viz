import assert from 'node:assert/strict';
import test from 'node:test';
import { extractEmbeddedPageLinks } from '../src/crawler/extractEmbeddedPageData.js';

test('recovers same-site page links from serialized CMS data without executing scripts', () => {
  const html = `<html><body><div id="root"></div><script>
    main.cards = [
      { href: '/2026/0718/c1/page.htm', image: '/images/a.jpg' },
      { url: '/news/list.htm' },
      { link: 'https://example.edu/english/' },
      { href: 'https://other.example/page.htm' },
      { href: '/files/report.pdf' }
    ];
  </script></body></html>`;

  assert.deepEqual(extractEmbeddedPageLinks(html, 'https://www.example.edu/'), [
    'https://www.example.edu/2026/0718/c1/page.htm',
    'https://www.example.edu/news/list.htm',
    'https://example.edu/english/',
  ]);
});
