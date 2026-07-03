import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { BenchmarkRecommendation } from '@studio/contracts';

type LoadState = 'loading' | 'loaded' | 'error' | 'unavailable';

interface BenchmarkSelectionState {
  recommendations: BenchmarkRecommendation[];
  selectedIds: string[];
  fallbackMessage: string;
  revision: number;
  loadState: LoadState;
  errorMessage: string;
  retryable: boolean;
}

export function useBenchmarkSelection(projectId: string) {
  const [state, setState] = useState<BenchmarkSelectionState>({
    recommendations: [],
    selectedIds: [],
    fallbackMessage: '',
    revision: 0,
    loadState: 'loading',
    errorMessage: '',
    retryable: false,
  });
  const [saving, setSaving] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, [projectId]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loadState: 'loading', errorMessage: '' }));
    try {
      const [recResponse, selResponse] = await Promise.all([
        apiFetch(`/projects/${projectId}/benchmarks/recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        apiFetch(`/projects/${projectId}/benchmarks/selection`),
      ]);

      if (!mountedRef.current) return;

      if (!recResponse.ok) {
        const is503 = recResponse.status === 503;
        const payload = await recResponse.json().catch(() => ({})) as { error?: { message?: string } };
        setState((prev) => ({
          ...prev,
          loadState: is503 ? 'unavailable' : 'error',
          errorMessage: payload.error?.message ?? (is503 ? '案例库暂时无法访问。' : '案例推荐加载失败。'),
          retryable: !is503,
        }));
        return;
      }

      const recPayload = await recResponse.json() as {
        success: boolean;
        data?: { items: BenchmarkRecommendation[]; fallbackMessage: string };
      };

      if (!recPayload.success || !recPayload.data) {
        setState((prev) => ({ ...prev, loadState: 'error', errorMessage: '案例推荐数据无效。', retryable: true }));
        return;
      }

      let selectedIds: string[] = [];
      let revision = 0;
      if (selResponse.ok) {
        const selPayload = await selResponse.json() as { success: boolean; data?: { selectedIds: string[]; revision: number } };
        if (selPayload.success && selPayload.data) {
          selectedIds = selPayload.data.selectedIds;
          revision = selPayload.data.revision;
        }
      }

      setState({
        recommendations: recPayload.data.items,
        selectedIds,
        fallbackMessage: recPayload.data.fallbackMessage || '',
        revision,
        loadState: 'loaded',
        errorMessage: '',
        retryable: false,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        loadState: 'error',
        errorMessage: err instanceof Error ? err.message : '网络请求失败。',
        retryable: true,
      }));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (benchmarkId: string) => {
    const current = stateRef.current;
    const exists = current.selectedIds.includes(benchmarkId);
    const newSelected = exists
      ? current.selectedIds.filter((id) => id !== benchmarkId)
      : [...current.selectedIds, benchmarkId];

    setState((prev) => ({ ...prev, selectedIds: newSelected }));
    setSaving(true);
    try {
      const response = await apiFetch(`/projects/${projectId}/benchmarks/selection`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: newSelected, expectedRevision: current.revision }),
      });
      const payload = await response.json() as { success: boolean; data?: { selectedIds: string[]; revision: number }; error?: { code: string; message: string } };
      if (response.ok && payload.success && payload.data) {
        setState((prev) => ({ ...prev, revision: payload.data!.revision }));
      } else if (!response.ok && response.status === 409) {
        await load();
        setState((prev) => ({ ...prev, errorMessage: payload.error?.message ?? '选择已过期，已同步最新结果。' }));
      } else {
        setState((prev) => ({ ...prev, selectedIds: current.selectedIds, errorMessage: payload.error?.message ?? '选择保存失败，请重试。' }));
      }
    } catch (err) {
      setState((prev) => ({ ...prev, selectedIds: current.selectedIds, errorMessage: err instanceof Error ? err.message : '选择保存失败。' }));
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [load, projectId]);

  const retry = useCallback(() => { void load(); }, [load]);

  return {
    recommendations: state.recommendations,
    selectedIds: state.selectedIds,
    fallbackMessage: state.fallbackMessage,
    loadState: state.loadState,
    errorMessage: state.errorMessage,
    retryable: state.retryable,
    saving,
    toggle,
    retry,
    reload: load,
  };
}
