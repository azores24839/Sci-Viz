import { randomUUID } from 'node:crypto';
import {
  CrawlCancelledError,
  runUrlCrawl,
  type CrawlProgressEvent,
  type CrawlResponse,
} from '../crawler/runUrlCrawl.js';
import { TaskQueue } from './taskQueue.js';

export type UrlCrawlTaskStatus = 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
export type UrlCrawlTaskStage = 'queued' | 'reading_pages' | 'processing_images' | 'finalizing' | 'completed' | 'failed' | 'cancelled';

export interface UrlCrawlTaskSnapshot {
  id: string;
  status: UrlCrawlTaskStatus;
  stage: UrlCrawlTaskStage;
  totalPageCount: number;
  processedPageCount: number;
  failedPageCount: number;
  activeUrls: string[];
  candidateImageCount: number;
  processedImageCount: number;
  createdCaseCount: number;
  duplicateImageCount: number;
  filteredImageCount: number;
  cappedImageCount: number;
  failedImageCount: number;
  createdAt: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string;
  error: string;
  result?: CrawlResponse;
}

interface CreateUrlCrawlTaskInput {
  urls: string[];
  sourceName: string;
  sourceType: string;
  cookie: string;
}

interface StoredTask {
  snapshot: UrlCrawlTaskSnapshot;
  controller: AbortController;
  input: CreateUrlCrawlTaskInput;
}

const TASK_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RETAINED_TASKS = 30;
const tasks = new Map<string, StoredTask>();
const taskQueue = new TaskQueue(1, 4, error => {
  console.error('[url-crawl-task] queued task failed:', error);
});

function now() {
  return new Date().toISOString();
}

function pruneTasks() {
  const cutoff = Date.now() - TASK_RETENTION_MS;
  for (const [id, task] of tasks) {
    const terminal = ['completed', 'failed', 'cancelled'].includes(task.snapshot.status);
    if (terminal && new Date(task.snapshot.updatedAt).getTime() < cutoff) tasks.delete(id);
  }
  if (tasks.size <= MAX_RETAINED_TASKS) return;
  const removable = [...tasks.entries()]
    .filter(([, task]) => ['completed', 'failed', 'cancelled'].includes(task.snapshot.status))
    .sort((a, b) => a[1].snapshot.updatedAt.localeCompare(b[1].snapshot.updatedAt));
  while (tasks.size > MAX_RETAINED_TASKS && removable.length > 0) {
    tasks.delete(removable.shift()![0]);
  }
}

export function applyUrlCrawlProgress(snapshot: UrlCrawlTaskSnapshot, event: CrawlProgressEvent) {
  snapshot.updatedAt = now();
  if (event.type === 'page_started') {
    snapshot.stage = 'reading_pages';
    if (!snapshot.activeUrls.includes(event.url)) snapshot.activeUrls.push(event.url);
    return;
  }
  if (event.type === 'page_scanned') {
    snapshot.stage = 'processing_images';
    snapshot.candidateImageCount += event.candidateImageCount;
    return;
  }
  if (event.type === 'images_processed') {
    snapshot.stage = 'processing_images';
    snapshot.processedImageCount += event.count;
    if (event.outcome === 'created') snapshot.createdCaseCount += event.count;
    if (event.outcome === 'duplicate') snapshot.duplicateImageCount += event.count;
    if (event.outcome === 'filtered') snapshot.filteredImageCount += event.count;
    if (event.outcome === 'capped') snapshot.cappedImageCount += event.count;
    if (event.outcome === 'failed') snapshot.failedImageCount += event.count;
    return;
  }
  snapshot.processedPageCount += 1;
  if (event.result.status !== 'success') snapshot.failedPageCount += 1;
  snapshot.activeUrls = snapshot.activeUrls.filter(url => url !== event.url);
  snapshot.stage = snapshot.activeUrls.length > 0 ? 'processing_images' : 'reading_pages';
}

export function createInitialUrlCrawlTaskSnapshot(id: string, totalPageCount: number, timestamp = now()): UrlCrawlTaskSnapshot {
  return {
    id,
    status: 'queued',
    stage: 'queued',
    totalPageCount,
    processedPageCount: 0,
    failedPageCount: 0,
    activeUrls: [],
    candidateImageCount: 0,
    processedImageCount: 0,
    createdCaseCount: 0,
    duplicateImageCount: 0,
    filteredImageCount: 0,
    cappedImageCount: 0,
    failedImageCount: 0,
    createdAt: timestamp,
    startedAt: '',
    updatedAt: timestamp,
    finishedAt: '',
    error: '',
  };
}

async function executeTask(task: StoredTask) {
  const snapshot = task.snapshot;
  if (task.controller.signal.aborted) return;
  snapshot.status = 'running';
  snapshot.stage = 'reading_pages';
  snapshot.startedAt = now();
  snapshot.updatedAt = snapshot.startedAt;

  try {
    const result = await runUrlCrawl(
      task.input.urls,
      task.input.sourceName,
      task.input.sourceType,
      task.input.cookie,
      {
        signal: task.controller.signal,
        onProgress: event => applyUrlCrawlProgress(snapshot, event),
      },
    );
    snapshot.stage = 'finalizing';
    snapshot.updatedAt = now();
    snapshot.result = result;
    snapshot.status = 'completed';
    snapshot.stage = 'completed';
    snapshot.activeUrls = [];
    snapshot.finishedAt = now();
    snapshot.updatedAt = snapshot.finishedAt;
  } catch (error) {
    const cancelled = error instanceof CrawlCancelledError || task.controller.signal.aborted;
    snapshot.status = cancelled ? 'cancelled' : 'failed';
    snapshot.stage = cancelled ? 'cancelled' : 'failed';
    snapshot.activeUrls = [];
    snapshot.error = cancelled ? '' : (error instanceof Error ? error.message : '采集任务失败');
    snapshot.finishedAt = now();
    snapshot.updatedAt = snapshot.finishedAt;
  }
}

export function createUrlCrawlTask(input: CreateUrlCrawlTaskInput): UrlCrawlTaskSnapshot {
  pruneTasks();
  const timestamp = now();
  const task: StoredTask = {
    input,
    controller: new AbortController(),
    snapshot: createInitialUrlCrawlTaskSnapshot(randomUUID(), input.urls.length, timestamp),
  };
  tasks.set(task.snapshot.id, task);
  const accepted = taskQueue.tryEnqueue(() => executeTask(task));
  if (!accepted) {
    tasks.delete(task.snapshot.id);
    throw new Error('采集任务队列已满，请稍后再试');
  }
  return getUrlCrawlTask(task.snapshot.id)!;
}

export function getUrlCrawlTask(id: string): UrlCrawlTaskSnapshot | null {
  const task = tasks.get(id);
  if (!task) return null;
  return { ...task.snapshot, activeUrls: [...task.snapshot.activeUrls] };
}

export function cancelUrlCrawlTask(id: string): UrlCrawlTaskSnapshot | null {
  const task = tasks.get(id);
  if (!task) return null;
  if (['completed', 'failed', 'cancelled'].includes(task.snapshot.status)) return getUrlCrawlTask(id);
  task.controller.abort();
  if (task.snapshot.status === 'queued') {
    task.snapshot.status = 'cancelled';
    task.snapshot.stage = 'cancelled';
    task.snapshot.finishedAt = now();
  } else {
    task.snapshot.status = 'cancelling';
  }
  task.snapshot.updatedAt = now();
  return getUrlCrawlTask(id);
}
