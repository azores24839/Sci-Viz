import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDirectorWorkflowStates, researchPhotoWorkflowV1 } from '@studio/workflow-core';
import { useWorkflowPersistence } from './useWorkflowPersistence';

vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '../../api/client';
const mockApi = vi.mocked(apiFetch);

function response(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const states = createDirectorWorkflowStates(researchPhotoWorkflowV1);
const workflow = {
  projectId,
  templateId: researchPhotoWorkflowV1.id,
  templateVersion: researchPhotoWorkflowV1.version,
  revision: 1,
  states,
  selectedBenchmarkIds: [],
  primaryGoal: 'INDUSTRY_COLLABORATION' as const,
  secondaryGoal: 'PUBLIC_COMMUNICATION' as const,
  createdAt: '2026-07-03T00:00:00.000Z',
  updatedAt: '2026-07-03T00:00:00.000Z',
};

const options = {
  projectId,
  createInitialStates: () => states,
  defaultPrimaryGoal: 'INDUSTRY_COLLABORATION' as const,
  defaultSecondaryGoal: 'PUBLIC_COMMUNICATION' as const,
};

describe('useWorkflowPersistence', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads the workflow and persists later changes', async () => {
    mockApi.mockResolvedValueOnce(response({ success: true, data: workflow }));
    mockApi.mockResolvedValueOnce(response({ success: true, data: { ...workflow, revision: 2 } }));
    const { result } = renderHook(() => useWorkflowPersistence(options));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.saveStatus).toBe('saved');

    act(() => result.current.setPrimaryGoal('ACADEMIC_COMMUNICATION'));
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'), { timeout: 2500 });

    expect(mockApi).toHaveBeenCalledTimes(2);
    const [, init] = mockApi.mock.calls[1]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({
      primaryGoal: 'ACADEMIC_COMMUNICATION',
      expectedRevision: 1,
    });
  });

  it('keeps local changes and supports retry after a save failure', async () => {
    mockApi.mockResolvedValueOnce(response({ success: true, data: workflow }));
    mockApi.mockRejectedValueOnce(new Error('网络中断'));
    const { result } = renderHook(() => useWorkflowPersistence(options));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.setPrimaryGoal('RECRUITING_BRAND'));
    await waitFor(() => expect(result.current.saveStatus).toBe('error'), { timeout: 2500 });
    expect(result.current.primaryGoal).toBe('RECRUITING_BRAND');

    mockApi.mockResolvedValueOnce(response({ success: true, data: { ...workflow, revision: 2, primaryGoal: 'RECRUITING_BRAND' } }));
    act(() => result.current.retrySave());
    await waitFor(() => expect(result.current.saveStatus).toBe('saved'));
    expect(result.current.saveError).toBe('');
  });
});
