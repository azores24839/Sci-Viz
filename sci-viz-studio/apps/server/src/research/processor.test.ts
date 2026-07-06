import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResearchTask, SourceDocument } from '@studio/contracts';
import type { ResearchRepository } from './repository.js';
import type { SourceRepository } from '../sources/repository.js';
import { TAVILY_QUERY_LIMIT } from './researchQuery.js';

vi.mock('./tavily.js', () => ({ searchTavily: vi.fn() }));

import { searchTavily } from './tavily.js';
import { ResearchProcessor } from './processor.js';

const mockedSearch = vi.mocked(searchTavily);

function researchRepo(initial: ResearchTask) {
  let task = initial;
  const repo: ResearchRepository = {
    list: async () => [task],
    get: async () => task,
    save: async (next) => { task = next; },
    listPending: async () => [],
  };
  return { repo, current: () => task };
}

const sourceRepo = (documents: SourceDocument[]): SourceRepository => ({
  list: async () => documents,
  get: async () => undefined,
  save: async () => undefined,
  remove: async () => undefined,
  listPending: async () => [],
});

describe('ResearchProcessor query handling', () => {
  beforeEach(() => {
    mockedSearch.mockReset();
    mockedSearch.mockImplementation(async (_env, query) => ({ effectiveQuery: query, candidates: [] }));
  });

  it('preserves the original query and stores the bounded query actually used', async () => {
    const originalQuery = '深海柔性机械臂产业合作科研影像需求'.repeat(40);
    const stamp = new Date().toISOString();
    const initial: ResearchTask = {
      id: crypto.randomUUID(), projectId: crypto.randomUUID(), ownerUserId: 'user-a', mode: 'FAST',
      query: originalQuery, status: 'QUEUED', candidates: [], createdAt: stamp, updatedAt: stamp,
    };
    const storage = researchRepo(initial);
    const source: SourceDocument = {
      id: crypto.randomUUID(), projectId: initial.projectId, kind: 'TEXT', status: 'READY', selected: true,
      title: '设备与实验资料', aiSummary: '设备结构、实验过程、应用场景和安全限制'.repeat(40),
      truncated: false, createdAt: stamp, updatedAt: stamp,
    };
    const processor = new ResearchProcessor(storage.repo, { TAVILY_API_KEY: 'test' }, 1, sourceRepo([source]));

    processor.enqueue(initial.id);

    await vi.waitFor(() => expect(storage.current().status).toBe('COMPLETED'));
    expect(storage.current().query).toBe(originalQuery);
    expect(storage.current().effectiveQuery?.length).toBeLessThanOrEqual(TAVILY_QUERY_LIMIT);
    expect(mockedSearch).toHaveBeenCalledTimes(1);
  });
});
