import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrawlPageResult } from '../src/crawler/runUrlCrawl.js';
import {
  applyUrlCrawlProgress,
  createInitialUrlCrawlTaskSnapshot,
} from '../src/services/urlCrawlTasks.js';

function pageResult(status: CrawlPageResult['status'] = 'success'): CrawlPageResult {
  return {
    url: 'https://example.com/story',
    status,
    pageTitle: 'Story',
    candidateImageCount: 4,
    filteredImageCount: 1,
    filterReasons: {
      missingSourceCount: 0,
      inlineDataCount: 0,
      unsupportedFormatCount: 0,
      tooSmallCount: 1,
      duplicateUrlCount: 0,
    },
    createdCaseCount: 2,
    duplicateImageCount: 1,
    cappedImageCount: 0,
    failedImageCount: 0,
    createdCases: [],
    errors: [],
    notices: [],
  };
}

test('URL crawl task progress accounts for pages and image outcomes incrementally', () => {
  const task = createInitialUrlCrawlTaskSnapshot('task-1', 3, '2026-07-17T00:00:00.000Z');

  applyUrlCrawlProgress(task, { type: 'page_started', url: 'https://example.com/story' });
  applyUrlCrawlProgress(task, { type: 'page_scanned', url: 'https://example.com/story', candidateImageCount: 4 });
  applyUrlCrawlProgress(task, { type: 'images_processed', url: 'https://example.com/story', count: 2, outcome: 'created' });
  applyUrlCrawlProgress(task, { type: 'images_processed', url: 'https://example.com/story', count: 1, outcome: 'duplicate' });
  applyUrlCrawlProgress(task, { type: 'images_processed', url: 'https://example.com/story', count: 1, outcome: 'filtered' });
  applyUrlCrawlProgress(task, { type: 'page_completed', url: 'https://example.com/story', result: pageResult() });

  assert.equal(task.processedPageCount, 1);
  assert.equal(task.candidateImageCount, 4);
  assert.equal(task.processedImageCount, 4);
  assert.equal(task.createdCaseCount, 2);
  assert.equal(task.duplicateImageCount, 1);
  assert.equal(task.filteredImageCount, 1);
  assert.deepEqual(task.activeUrls, []);
});

test('URL crawl task records failed pages without inventing image failures', () => {
  const task = createInitialUrlCrawlTaskSnapshot('task-2', 1);
  applyUrlCrawlProgress(task, { type: 'page_started', url: 'https://example.com/failure' });
  applyUrlCrawlProgress(task, { type: 'page_completed', url: 'https://example.com/failure', result: pageResult('failed') });

  assert.equal(task.processedPageCount, 1);
  assert.equal(task.failedPageCount, 1);
  assert.equal(task.failedImageCount, 0);
});
