import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentDraftRequest, AgentJob } from '@studio/contracts';
import { useAgentJob } from './useAgentJob';
import { apiFetch } from '../../api/client';

vi.mock('../../api/client', () => ({ apiFetch: vi.fn(), notifyUsageChanged: vi.fn() }));
const mockApi = vi.mocked(apiFetch);
const draft: AgentDraftRequest = { projectId: 'project-1', projectName: 'P', nodeId: 'visual-diagnosis', nodeLabel: '诊断', agentRole: 'SOURCE_ANALYST', task: 'DIAGNOSE_VISUAL_STATE', inputLabel: '资料', outputLabel: '诊断', planLabel: 'Plan A', revision: 1, upstreamArtifacts: [] };
const stamp = '2026-07-03T00:00:00.000Z';
const job = (status: AgentJob['status']): AgentJob => ({ id: '11111111-1111-4111-8111-111111111111', ownerUserId: 'u', projectId: 'project-1', idempotencyKey: 'project-1:visual:v1', status, attempt: 1, maxAttempts: 3, availableAt: stamp, request: draft, createdAt: stamp, updatedAt: stamp, ...(status === 'COMPLETED' ? { result: { label: '完成', body: '- 有来源的结论', blockerCount: 0, provider: 'mock', evidence: [], structured: { role: 'SOURCE_ANALYST', observations: [], gaps: [] } } } : {}) });
const response = (data: unknown, ok = true, status = 200) => ({ ok, status, json: async () => data }) as Response;

describe('useAgentJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not create a job while the node is not active', async () => {
    renderHook(() => useAgentJob({ draft, idempotencyKey: 'project-1:visual:v1', enabled: false }));
    await new Promise((resolve) => setTimeout(resolve, 0)); expect(mockApi).not.toHaveBeenCalled();
  });

  it('submits and restores a completed background result', async () => {
    mockApi.mockResolvedValueOnce(response({ success: true, data: job('QUEUED') }, true, 202)).mockResolvedValueOnce(response({ success: true, data: job('COMPLETED') }));
    const { result } = renderHook(() => useAgentJob({ draft, idempotencyKey: 'project-1:visual:v1', pollIntervalMs: 5 }));
    await waitFor(() => expect(result.current.status).toBe('COMPLETED'));
    expect(result.current.job?.result?.label).toBe('完成');
  });

  it('uses the retry endpoint for a retryable failed job', async () => {
    const failed = { ...job('FAILED'), error: { code: 'MODEL_TIMEOUT', message: '超时', retryable: true } };
    mockApi.mockResolvedValueOnce(response({ success: true, data: failed }))
      .mockResolvedValueOnce(response({ success: true, data: job('QUEUED') }, true, 202))
      .mockResolvedValueOnce(response({ success: true, data: job('COMPLETED') }));
    const { result } = renderHook(() => useAgentJob({ draft, idempotencyKey: 'project-1:visual:v1', pollIntervalMs: 5 }));
    await waitFor(() => expect(result.current.status).toBe('FAILED'));
    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.status).toBe('COMPLETED'));
    expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('/retry'), { method: 'POST' });
  });
});
