import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentDraftRequest, AgentJob } from '@studio/contracts';
import { apiFetch, notifyUsageChanged } from '../../api/client';

interface UseAgentJobOptions {
  draft: AgentDraftRequest;
  idempotencyKey: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

type ViewStatus = 'IDLE' | 'LOADING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export function useAgentJob({ draft, idempotencyKey, enabled = true, pollIntervalMs = 2000 }: UseAgentJobOptions) {
  const [job, setJob] = useState<AgentJob | null>(null);
  const [status, setStatus] = useState<ViewStatus>(enabled ? 'LOADING' : 'IDLE');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const poll = useCallback(async (jobId: string) => {
    clearTimer();
    try {
      const response = await apiFetch(`/agent-jobs/${jobId}`);
      const payload = await response.json() as { success: boolean; data?: AgentJob; error?: { message: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? '暂时无法获取 AI 任务进度。');
      if (!mounted.current) return;
      setJob(payload.data); setStatus(payload.data.status); setError(null);
      if (payload.data.status === 'QUEUED' || payload.data.status === 'RUNNING') {
        timer.current = setTimeout(() => void poll(jobId), pollIntervalMs);
      } else {
        notifyUsageChanged();
      }
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : '暂时无法获取 AI 任务进度。');
      timer.current = setTimeout(() => void poll(jobId), Math.max(3000, pollIntervalMs));
    }
  }, [pollIntervalMs]);

  const submit = useCallback(async () => {
    if (!enabled) { clearTimer(); setJob(null); setStatus('IDLE'); setError(null); return; }
    setStatus('LOADING'); setError(null);
    try {
      const response = await apiFetch('/agent-jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, draft }),
      });
      const payload = await response.json() as { success: boolean; data?: AgentJob; error?: { code: string; message: string } };
      if (!response.ok || !payload.data) {
        if (payload.error?.code === 'USER_QUOTA_EXCEEDED') {
          const stamp = new Date().toISOString();
          const quotaJob = { id: crypto.randomUUID(), ownerUserId: '', projectId: draft.projectId, idempotencyKey, status: 'FAILED', attempt: 0, maxAttempts: 1, availableAt: stamp, request: draft, error: { code: 'USER_QUOTA_EXCEEDED', message: payload.error.message, retryable: false }, createdAt: stamp, updatedAt: stamp } as AgentJob;
          setJob(quotaJob); setStatus('FAILED'); return;
        }
        throw new Error(payload.error?.message ?? '无法启动 AI 任务。');
      }
      if (!mounted.current) return;
      setJob(payload.data); setStatus(payload.data.status); notifyUsageChanged();
      if (payload.data.status === 'QUEUED' || payload.data.status === 'RUNNING') await poll(payload.data.id);
    } catch (cause) {
      if (!mounted.current) return;
      setStatus('FAILED'); setError(cause instanceof Error ? cause.message : '无法启动 AI 任务。');
    }
  }, [draft, enabled, idempotencyKey, poll]);

  useEffect(() => {
    mounted.current = true; void submit();
    return () => { mounted.current = false; clearTimer(); };
  }, [submit]);

  const retry = useCallback(async () => {
    if (!job?.id) { await submit(); return; }
    setStatus('LOADING'); setError(null);
    try {
      const response = await apiFetch(`/agent-jobs/${job.id}/retry`, { method: 'POST' });
      const payload = await response.json() as { success: boolean; data?: AgentJob; error?: { message: string } };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? '暂时无法重试。');
      setJob(payload.data); setStatus(payload.data.status); await poll(payload.data.id);
    } catch (cause) { setStatus('FAILED'); setError(cause instanceof Error ? cause.message : '暂时无法重试。'); }
  }, [job, poll, submit]);

  return { job, status, error, retry };
}
