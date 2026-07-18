import assert from 'node:assert/strict';
import test from 'node:test';
import { countCasesBySourceName, type SourceOptionCase } from '../src/services/sourceFilterOptions.js';

const makeCase = (overrides: Partial<SourceOptionCase>): SourceOptionCase => ({
  sourceDomain: '', sourceUrl: '', userHint: '', caseTitle: '', ...overrides,
});

test('source option counts preserve hint, URL, title, then unique-domain priority', () => {
  const cases = [
    makeCase({ userHint: 'Hint Source / gallery', sourceUrl: 'https://wrong.example/item' }),
    makeCase({ sourceUrl: 'https://url.example/news/1', caseTitle: 'URL Source / fallback' }),
    makeCase({ caseTitle: 'Title Source / report' }),
    makeCase({ sourceDomain: 'unique.example' }),
    makeCase({ sourceDomain: 'shared.example' }),
  ];
  const sources = [
    { name: 'Hint Source', url: 'https://hint.example' },
    { name: 'URL Source', url: 'https://url.example/news' },
    { name: 'Title Source', url: 'https://title.example' },
    { name: 'Unique Domain', url: 'https://unique.example' },
    { name: 'Shared A', url: 'https://shared.example/a' },
    { name: 'Shared B', url: 'https://shared.example/b' },
  ];

  assert.deepEqual(countCasesBySourceName(cases, sources), [
    { label: 'Hint Source', count: 1 },
    { label: 'URL Source', count: 1 },
    { label: 'Title Source', count: 1 },
    { label: 'Unique Domain', count: 1 },
    { label: 'Shared A', count: 0 },
    { label: 'Shared B', count: 0 },
  ]);
});

test('source definitions are trimmed and deduplicated by name', () => {
  assert.deepEqual(countCasesBySourceName([], [
    { name: ' Source ', url: 'https://first.example' },
    { name: 'Source', url: 'https://second.example' },
  ]), [{ label: 'Source', count: 0 }]);
});
