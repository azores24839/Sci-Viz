import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { CaptureItem, ShotCard } from '@studio/contracts';

export type CaptureStatus = 'TODO' | 'CAPTURED' | 'RESHOOT';
export type SyncState = 'idle' | 'saving' | 'queued' | 'error' | 'conflict';

export interface MergedCaptureItem {
  shotCardId: string;
  title: string;
  scene: string;
  priority: ShotCard['priority'];
  shotSize: string;
  status: CaptureStatus;
  fileNumber: string;
  note: string;
  revision: number;
  syncState: SyncState;
}

const NEXT_STATUS: Record<CaptureStatus, CaptureStatus> = {
  TODO: 'CAPTURED',
  CAPTURED: 'RESHOOT',
  RESHOOT: 'TODO',
};

export const STATUS_LABEL: Record<CaptureStatus, string> = {
  TODO: '未拍',
  CAPTURED: '已拍',
  RESHOOT: '需补拍',
};

interface PendingTask {
  shotCardId: string;
  type: 'status' | 'detail';
  field?: 'fileNumber' | 'note';
  value?: string;
  status?: CaptureStatus;
  execute: () => Promise<boolean>;
}

function mergeData(cards: ShotCard[], captures: CaptureItem[], existing: MergedCaptureItem[]): MergedCaptureItem[] {
  const captureByCardId = new Map(captures.map((c) => [c.shotCardId, c]));
  const existingByCardId = new Map(existing.map((i) => [i.shotCardId, i]));
  return cards.map((card) => {
    const capture = captureByCardId.get(card.id);
    const prev = existingByCardId.get(card.id);
    if (prev && prev.syncState !== 'idle') {
      return {
        ...prev,
        title: card.title,
        scene: card.scene,
        priority: card.priority,
        shotSize: card.shotSize,
      };
    }
    return {
      shotCardId: card.id,
      title: card.title,
      scene: card.scene,
      priority: card.priority,
      shotSize: card.shotSize,
      status: (capture?.status ?? 'TODO') as CaptureStatus,
      fileNumber: capture?.fileNumber ?? '',
      note: capture?.note ?? '',
      revision: capture?.revision ?? 1,
      syncState: 'idle' as SyncState,
    };
  });
}

function groupByScene(items: MergedCaptureItem[]): Map<string, MergedCaptureItem[]> {
  const groups = new Map<string, MergedCaptureItem[]>();
  for (const item of items) {
    const key = item.scene || '未分类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return groups;
}

function computeGlobalSync(items: MergedCaptureItem[]): SyncState {
  if (items.some((i) => i.syncState === 'error')) return 'error';
  if (items.some((i) => i.syncState === 'conflict')) return 'conflict';
  if (items.some((i) => i.syncState === 'queued')) return 'queued';
  if (items.some((i) => i.syncState === 'saving')) return 'saving';
  return 'idle';
}

export function useCaptureItems(projectId: string) {
  const [items, setItems] = useState<MergedCaptureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const tasksRef = useRef<PendingTask[]>([]);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);

  const setItemState = useCallback((shotCardId: string, patch: Partial<MergedCaptureItem>) => {
    setItems((prev) => {
      const next = prev.map((item) =>
        item.shotCardId === shotCardId ? { ...item, ...patch } : item
      );
      return next;
    });
  }, []);

  const updateGlobal = useCallback(() => {
    setItems((prev) => {
      const global = computeGlobalSync(prev);
      setError(global === 'conflict' ? '内容已在其他页面更新，请重新加载或重试。' : '');
      return prev;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsRes, capturesRes] = await Promise.all([
        apiFetch(`/projects/${projectId}/shot-cards`),
        apiFetch(`/projects/${projectId}/capture-items`),
      ]);
      if (!mountedRef.current) return;
      const cardsPayload = await cardsRes.json() as { success: boolean; data: ShotCard[] };
      const capturesPayload = await capturesRes.json() as { success: boolean; data: CaptureItem[] };
      const cards = cardsPayload.success ? cardsPayload.data : [];
      const captures = capturesPayload.success ? capturesPayload.data : [];
      setItems((prev) => {
        const merged = mergeData(cards, captures, prev);
        return merged;
      });
      setError('');
    } catch {
      if (mountedRef.current) setError('加载拍摄清单失败。');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const flushQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      let batchSize = tasksRef.current.length;
      while (batchSize > 0 && tasksRef.current.length > 0) {
        const task = tasksRef.current.shift();
        if (!task || !mountedRef.current) break;
        batchSize--;
        setItemState(task.shotCardId, { syncState: 'saving' });
        const ok = await task.execute();
        if (!ok && mountedRef.current) {
          setItemState(task.shotCardId, { syncState: navigator.onLine ? 'error' : 'queued' });
          tasksRef.current.push(task);
        } else if (ok && mountedRef.current) {
          setItemState(task.shotCardId, { syncState: 'idle' });
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [setItemState]);

  const toggleStatus = useCallback((shotCardId: string) => {
    const current = itemsRef.current.find((item) => item.shotCardId === shotCardId);
    if (!current || current.syncState === 'saving') return;
    const nextStatus = NEXT_STATUS[current.status];

    setItemState(shotCardId, { status: nextStatus, syncState: 'saving' });

    const task: PendingTask = {
      shotCardId,
      type: 'status' as const,
      status: nextStatus,
      execute: async () => {
        try {
          const item = itemsRef.current.find((i) => i.shotCardId === shotCardId);
          if (!item) return false;
          const response = await apiFetch(`/projects/${projectId}/capture-items/${shotCardId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus, expectedRevision: item.revision }),
          });
          if (!mountedRef.current) return false;
          if (response.status === 409) {
            const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
            setItemState(shotCardId, { syncState: 'conflict', status: item.status });
            setError(payload.error?.message ?? '内容已在其他页面更新，请重新加载。');
            return false;
          }
          if (response.ok) {
            const payload = await response.json() as { success: boolean; data: CaptureItem };
            if (payload.success) {
              setItemState(shotCardId, { revision: payload.data.revision, syncState: 'idle' });
              return true;
            }
          }
          setItemState(shotCardId, { syncState: 'error' });
          return false;
        } catch {
          if (!mountedRef.current) return false;
          setItemState(shotCardId, { syncState: 'queued' });
          return false;
        }
      },
    };
    tasksRef.current.push(task);
    void flushQueue();
  }, [projectId, setItemState, flushQueue, setError]);

  const updateDetail = useCallback((shotCardId: string, field: 'fileNumber' | 'note', value: string) => {
    const current = itemsRef.current.find((item) => item.shotCardId === shotCardId);
    if (!current || current.syncState === 'saving') return;

    setItemState(shotCardId, { [field]: value, syncState: 'saving' });

    const task: PendingTask = {
      shotCardId,
      type: 'detail' as const,
      field,
      value,
      execute: async () => {
        try {
          const item = itemsRef.current.find((i) => i.shotCardId === shotCardId);
          if (!item) return false;
          const body: Record<string, unknown> = { expectedRevision: item.revision };
          body[field] = value;
          const response = await apiFetch(`/projects/${projectId}/capture-items/${shotCardId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!mountedRef.current) return false;
          if (response.status === 409) {
            const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
            setItemState(shotCardId, { syncState: 'conflict' });
            setError(payload.error?.message ?? '内容已在其他页面更新，请重新加载。');
            return false;
          }
          if (response.ok) {
            const payload = await response.json() as { success: boolean; data: CaptureItem };
            if (payload.success) {
              setItemState(shotCardId, { revision: payload.data.revision, syncState: 'idle' });
              return true;
            }
          }
          setItemState(shotCardId, { syncState: 'error' });
          return false;
        } catch {
          if (!mountedRef.current) return false;
          setItemState(shotCardId, { syncState: 'queued' });
          return false;
        }
      },
    };
    tasksRef.current.push(task);
    void flushQueue();
  }, [projectId, setItemState, flushQueue, setError]);

  const retrySync = useCallback(() => {
    if (tasksRef.current.length === 0) return;
    tasksRef.current.forEach((t) => {
      setItemState(t.shotCardId, { syncState: 'queued' });
    });
    void flushQueue();
  }, [flushQueue, setItemState]);

  const scenes = Array.from(groupByScene(items).entries());
  const globalSyncState = computeGlobalSync(items);

  return {
    items,
    scenes,
    loading,
    error,
    globalSyncState,
    toggleStatus,
    updateDetail,
    retrySync,
    reload: load,
  };
}

export { NEXT_STATUS };
