import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePlan } from './usePlan';

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../api/client';
const mockApi = vi.mocked(apiFetch);

function mockResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

const planData = {
  projectId: 'proj-1',
  title: '拍摄方案',
  currentVersion: 1,
  content: {
    executiveSummary: '摘要',
    goals: '目标',
    visualDiagnosis: '',
    benchmarkSummary: '',
    curationStrategy: '',
    shootingApproach: '方案内容',
    risks: [],
    sourceIds: [],
  },
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
};

describe('usePlan', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('isDirty returns false after save success', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes('plan/versions')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: planData }));
    });

    const { result } = renderHook(() => usePlan('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });

    expect(result.current.isDirty()).toBe(false);
    act(() => { result.current.updateContent({ executiveSummary: '修改' }); });
    expect(result.current.isDirty()).toBe(true);

    mockApi.mockClear();
    mockApi.mockImplementation((url: string) => {
      if (url.includes('plan/versions')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: { ...planData, currentVersion: 2 } }));
    });

    await act(async () => { await result.current.save(); });
    expect(result.current.isDirty()).toBe(false);
  }, 10000);

  it('sets conflict status on 409 response', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes('versions')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: planData }));
    });

    const { result } = renderHook(() => usePlan('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });

    act(() => { result.current.updateContent({ executiveSummary: '修改' }); });
    mockApi.mockClear();
    mockApi.mockResolvedValue(mockResponse({ error: { message: '版本冲突' } }, false, 409));

    await act(async () => { await result.current.save(); });
    expect(result.current.saveStatus).toBe('conflict');
  }, 10000);

  it('refreshes versions after save success', async () => {
    const v1 = { id: 'v1', projectId: 'proj-1', version: 1, content: planData.content, createdBy: 'USER' as const, changeSummary: '', createdAt: '2026-07-01T00:00:00.000Z' };
    const v2 = { id: 'v2', projectId: 'proj-1', version: 2, content: { ...planData.content, executiveSummary: '修改' }, createdBy: 'USER' as const, changeSummary: '', createdAt: '2026-07-02T00:00:00.000Z' };

    mockApi.mockImplementation((url: string) => {
      if (url.includes('plan/versions')) return Promise.resolve(mockResponse({ success: true, data: [v1] }));
      return Promise.resolve(mockResponse({ success: true, data: planData }));
    });

    const { result } = renderHook(() => usePlan('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });
    expect(result.current.versions).toHaveLength(1);

    act(() => { result.current.updateContent({ executiveSummary: '修改' }); });
    mockApi.mockClear();
    mockApi.mockImplementation((url: string) => {
      if (url.includes('plan/versions')) return Promise.resolve(mockResponse({ success: true, data: [v2, v1] }));
      return Promise.resolve(mockResponse({ success: true, data: { ...planData, currentVersion: 2, content: v2.content } }));
    });

    await act(async () => { await result.current.save(); });
    expect(result.current.versions).toHaveLength(2);
    expect(result.current.currentVersion).toBe(2);
  }, 10000);

  it('sets error status on network failure', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url.includes('plan/versions')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: planData }));
    });

    const { result } = renderHook(() => usePlan('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });

    act(() => { result.current.updateContent({ executiveSummary: '修改' }); });
    mockApi.mockClear();
    mockApi.mockRejectedValue(new Error('网络中断'));

    await act(async () => { await result.current.save(); });
    expect(result.current.saveStatus).toBe('error');
    expect(result.current.isDirty()).toBe(true);
  }, 10000);
});
