import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ProjectGoal, ProjectWorkflow } from '@studio/contracts';
import type { WorkflowNodeState } from '@studio/workflow-core';
import { apiFetch } from '../../api/client';

export type WorkflowSaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error';

interface WorkflowPersistenceOptions {
  projectId: string;
  createInitialStates: () => WorkflowNodeState[];
  defaultPrimaryGoal: ProjectGoal;
  defaultSecondaryGoal?: ProjectGoal;
}

interface SaveSnapshot {
  states: WorkflowNodeState[];
  primaryGoal: ProjectGoal;
  secondaryGoal: ProjectGoal | '';
}

function signatureOf(snapshot: SaveSnapshot) {
  return JSON.stringify(snapshot);
}

async function readError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return payload?.error?.message ?? fallback;
}

export function useWorkflowPersistence({
  projectId,
  createInitialStates,
  defaultPrimaryGoal,
  defaultSecondaryGoal = 'PUBLIC_COMMUNICATION',
}: WorkflowPersistenceOptions) {
  const [states, setStates] = useState<WorkflowNodeState[]>(createInitialStates);
  const [primaryGoal, setPrimaryGoal] = useState<ProjectGoal>(defaultPrimaryGoal);
  const [secondaryGoal, setSecondaryGoal] = useState<ProjectGoal | ''>(defaultSecondaryGoal);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<WorkflowSaveStatus>('loading');
  const [saveError, setSaveError] = useState('');
  const revisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const latestRef = useRef<SaveSnapshot>({ states, primaryGoal, secondaryGoal });
  const savedSignatureRef = useRef('');

  latestRef.current = { states, primaryGoal, secondaryGoal };

  const save = useCallback(async () => {
    if (!mountedRef.current || revisionRef.current < 1) return;
    const snapshot = latestRef.current;
    const signature = signatureOf(snapshot);
    setSaveStatus('saving');
    setSaveError('');

    const persist = async (expectedRevision: number) => apiFetch(`/projects/${projectId}/workflow`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        states: snapshot.states,
        primaryGoal: snapshot.primaryGoal,
        ...(snapshot.secondaryGoal ? { secondaryGoal: snapshot.secondaryGoal } : {}),
        expectedRevision,
      }),
    });

    try {
      let response = await persist(revisionRef.current);
      if (response.status === 409) {
        const latestResponse = await apiFetch(`/projects/${projectId}/workflow`);
        const latestPayload = await latestResponse.json().catch(() => null) as { data?: ProjectWorkflow } | null;
        if (!latestResponse.ok || !latestPayload?.data) {
          throw new Error('版本冲突，暂时无法获取最新版本。请重试。');
        }
        revisionRef.current = latestPayload.data.revision;
        response = await persist(revisionRef.current);
      }

      if (!response.ok) throw new Error(await readError(response, '工作流保存失败，请重试。'));
      const payload = await response.json() as { data?: ProjectWorkflow };
      if (!payload.data) throw new Error('服务器没有返回已保存的工作流。');
      revisionRef.current = payload.data.revision;
      savedSignatureRef.current = signature;
      if (!mountedRef.current) return;
      setSaveStatus(signatureOf(latestRef.current) === signature ? 'saved' : 'idle');
    } catch (cause) {
      if (!mountedRef.current) return;
      setSaveStatus('error');
      setSaveError(cause instanceof Error ? cause.message : '网络请求失败，工作流尚未保存。');
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    setLoaded(false);
    setSaveStatus('loading');
    setSaveError('');

    const load = async () => {
      try {
        const response = await apiFetch(`/projects/${projectId}/workflow`);
        const payload = await response.json().catch(() => null) as { data?: ProjectWorkflow; error?: { message?: string } } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error?.message ?? '工作流加载失败。');
        if (cancelled) return;
        const restored = payload.data.states.map((state) => state.nodeId === 'source-intake' && state.status === 'READY'
          ? { ...state, status: 'AWAITING_HUMAN' as const, progress: 50, summary: '请添加并选择至少一份已解析资料' }
          : state) as WorkflowNodeState[];
        const next: SaveSnapshot = {
          states: restored,
          primaryGoal: payload.data.primaryGoal ?? defaultPrimaryGoal,
          secondaryGoal: payload.data.secondaryGoal ?? ('' as const),
        };
        revisionRef.current = payload.data.revision;
        savedSignatureRef.current = signatureOf(next);
        setStates(restored);
        setPrimaryGoal(next.primaryGoal);
        setSecondaryGoal(next.secondaryGoal);
        setSaveStatus('saved');
      } catch (cause) {
        if (cancelled) return;
        setSaveStatus('error');
        setSaveError(cause instanceof Error ? cause.message : '工作流加载失败。');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [projectId, createInitialStates, defaultPrimaryGoal]);

  useEffect(() => {
    if (!loaded || revisionRef.current < 1) return;
    const currentSignature = signatureOf(latestRef.current);
    if (currentSignature === savedSignatureRef.current) return;
    setSaveStatus((current) => current === 'error' ? current : 'idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void save(), 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [states, primaryGoal, secondaryGoal, loaded, save]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (signatureOf(latestRef.current) === savedSignatureRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const retrySave = useCallback(() => void save(), [save]);

  return {
    states,
    setStates: setStates as Dispatch<SetStateAction<WorkflowNodeState[]>>,
    primaryGoal,
    setPrimaryGoal,
    secondaryGoal,
    setSecondaryGoal,
    loaded,
    saveStatus,
    saveError,
    retrySave,
  };
}
