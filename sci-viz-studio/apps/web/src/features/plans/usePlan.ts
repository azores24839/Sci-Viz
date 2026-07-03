import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { PlanDocument, PlanContent, PlanVersion } from '@studio/contracts';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface PlanState {
  plan: PlanDocument | null;
  content: PlanContent;
  currentVersion: number;
  versions: PlanVersion[];
  saveStatus: SaveStatus;
  errorMessage: string;
  loading: boolean;
}

function emptyContent(): PlanContent {
  return {
    executiveSummary: '',
    goals: '',
    visualDiagnosis: '',
    benchmarkSummary: '',
    curationStrategy: '',
    shootingApproach: '',
    risks: [],
    sourceIds: [],
  };
}

export function usePlan(projectId: string) {
  const [state, setState] = useState<PlanState>({
    plan: null,
    content: emptyContent(),
    currentVersion: 0,
    versions: [],
    saveStatus: 'idle',
    errorMessage: '',
    loading: true,
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const dirtyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, [projectId]);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const [planRes, versionsRes] = await Promise.all([
        apiFetch(`/projects/${projectId}/plan`),
        apiFetch(`/projects/${projectId}/plan/versions`),
      ]);
      if (!mountedRef.current) return;

      const planPayload = await planRes.json() as { success: boolean; data: PlanDocument | null };
      const versionsPayload = await versionsRes.json() as { success: boolean; data: PlanVersion[] };

      const plan = planPayload.success ? planPayload.data : null;
      const versions = versionsPayload.success ? versionsPayload.data : [];

      setState({
        plan,
        content: plan?.content ?? emptyContent(),
        currentVersion: plan?.currentVersion ?? 0,
        versions,
        saveStatus: 'idle',
        errorMessage: '',
        loading: false,
      });
    } catch {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, loading: false, errorMessage: '加载计划失败。' }));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const updateContent = useCallback((patch: Partial<PlanContent>) => {
    setState((prev) => {
      const next = { ...prev.content, ...patch };
      return { ...prev, content: next, saveStatus: 'idle' };
    });
    dirtyRef.current = true;
  }, []);

  const save = useCallback(async () => {
    const current = stateRef.current;
    if (current.saveStatus === 'saving') return;

    setState((prev) => ({ ...prev, saveStatus: 'saving', errorMessage: '' }));
    try {
      const title = current.plan?.title ?? '拍摄方案';
      const response = await apiFetch(`/projects/${projectId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: current.content,
          expectedVersion: current.currentVersion,
          createdBy: 'USER',
          changeSummary: '',
        }),
      });

      if (!mountedRef.current) return;

      if (response.status === 409) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        setState((prev) => ({
          ...prev,
          saveStatus: 'conflict',
          errorMessage: payload.error?.message ?? '内容已在其他页面更新，请刷新后重试。',
        }));
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        setState((prev) => ({
          ...prev,
          saveStatus: 'error',
          errorMessage: payload.error?.message ?? '保存失败。',
        }));
        return;
      }

      const payload = await response.json() as { success: boolean; data: PlanDocument };
      if (payload.success) {
        dirtyRef.current = false;
        try {
          const versionsRes = await apiFetch(`/projects/${projectId}/plan/versions`);
          const vPayload = await versionsRes.json() as { success: boolean; data: PlanVersion[] };
          if (mountedRef.current && vPayload.success) {
            setState((prev) => ({
              ...prev,
              plan: payload.data,
              currentVersion: payload.data.currentVersion,
              versions: vPayload.data,
              saveStatus: 'saved',
              errorMessage: '',
            }));
            return;
          }
        } catch { /* versions refresh failed, still mark as saved */ }
        setState((prev) => ({
          ...prev,
          plan: payload.data,
          currentVersion: payload.data.currentVersion,
          saveStatus: 'saved',
          errorMessage: '',
        }));
      }
    } catch {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, saveStatus: 'error', errorMessage: '网络请求失败，未保存。' }));
    }
  }, [projectId]);

  const autoSave = useCallback(() => {
    if (!dirtyRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (dirtyRef.current) void save();
    }, 2000);
  }, [save]);

  const restoreVersion = useCallback(async (version: number) => {
    const current = stateRef.current;
    setState((prev) => ({ ...prev, saveStatus: 'saving' }));
    try {
      const response = await apiFetch(`/projects/${projectId}/plan/versions/${version}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: current.currentVersion }),
      });

      if (!mountedRef.current) return;

      if (response.status === 409) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        setState((prev) => ({ ...prev, saveStatus: 'conflict', errorMessage: payload.error?.message ?? '版本冲突，请刷新。' }));
        return;
      }

      if (!response.ok) throw new Error('恢复失败');
      await load();
    } catch {
      setState((prev) => ({ ...prev, saveStatus: 'error', errorMessage: '恢复版本失败。' }));
    }
  }, [projectId, load]);

  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  return {
    content: state.content,
    currentVersion: state.currentVersion,
    versions: state.versions,
    saveStatus: state.saveStatus,
    errorMessage: state.errorMessage,
    loading: state.loading,
    updateContent,
    save,
    autoSave,
    restoreVersion,
    reload: load,
    isDirty: () => dirtyRef.current,
  };
}
