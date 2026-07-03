import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { PlanRisk, ShotCard } from '@studio/contracts';

interface ShotCardInput {
  title: string; purpose: string; subject: string; scene: string;
  shotSize: string; cameraAngle: string; composition: string;
  lighting: string; colorTone: string; action: string;
  scienceInfo: string; priority: 'MUST' | 'SHOULD' | 'OPTIONAL';
  peopleEquipmentMaterials: string;
  riskNotes: string;
  referenceImageUrls: string;
}

type RiskSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

function parseRiskLines(notes: string): Array<{ description: string; severity: RiskSeverity }> {
  if (!notes.trim()) return [];
  const parsed: Array<{ description: string; severity: RiskSeverity }> = [];
  for (const line of notes.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^\[(BLOCKER|WARNING|INFO)\]\s*(.+)/);
    if (match) {
      parsed.push({ severity: match[1] as RiskSeverity, description: match[2]!.trim() });
    }
  }
  return parsed;
}

function buildRisks(parsed: Array<{ description: string; severity: RiskSeverity }>, existing: PlanRisk[]): PlanRisk[] {
  const existingByDesc = new Map(existing.map((r) => [r.description, r]));
  return parsed.map((p) => {
    const prev = existingByDesc.get(p.description);
    if (prev) {
      return { ...prev, severity: p.severity };
    }
    return {
      id: crypto.randomUUID(),
      category: 'SAFETY' as const,
      severity: p.severity,
      description: p.description,
      resolved: false,
      resolution: '',
      sourceIds: [],
    };
  });
}

export { parseRiskLines, buildRisks };

function toApiPayload(input: ShotCardInput, existingRisks: PlanRisk[] = []) {
  const { riskNotes, ...rest } = input;
  const parsed = parseRiskLines(riskNotes ?? '');
  return {
    ...rest,
    peopleEquipmentMaterials: input.peopleEquipmentMaterials
      ? input.peopleEquipmentMaterials.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
      : [] as string[],
    referenceImageUrls: input.referenceImageUrls
      ? input.referenceImageUrls.split('\n').map((s) => s.trim()).filter(Boolean)
      : [] as string[],
    risks: buildRisks(parsed, existingRisks),
  };
}

export function useShotCards(projectId: string) {
  const [cards, setCards] = useState<ShotCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/projects/${projectId}/shot-cards`);
      if (!mountedRef.current) return;
      const payload = await response.json() as { success: boolean; data: ShotCard[] };
      if (payload.success) setCards(payload.data);
    } catch {
      if (mountedRef.current) setError('加载画面卡失败。');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const create = useCallback(async (input: ShotCardInput) => {
    try {
      const apiInput = { ...toApiPayload(input), sortOrder: cardsRef.current.length };
      const response = await apiFetch(`/projects/${projectId}/shot-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiInput),
      });
      const payload = await response.json() as { success: boolean; data: ShotCard; error?: { message: string } };
      if (!payload.success) throw new Error(payload.error?.message ?? '创建失败');
      setCards((prev) => [...prev, payload.data]);
      return payload.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建画面卡失败。');
      return null;
    }
  }, [projectId]);

  const update = useCallback(async (cardId: string, patch: Partial<ShotCardInput>, expectedRevision: number): Promise<boolean> => {
    try {
      const card = cardsRef.current.find((c) => c.id === cardId);
      const existingRisks = card?.risks ?? [];
      const response = await apiFetch(`/projects/${projectId}/shot-cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...toApiPayload(patch as ShotCardInput, existingRisks), expectedRevision }),
      });
      const payload = await response.json() as { success: boolean; data: ShotCard; error?: { code: string; message: string } };
      if (!payload.success) {
        const msg = payload.error?.code === 'VERSION_CONFLICT'
          ? '该画面卡已在其他页面更新，请刷新后重试。'
          : (payload.error?.message ?? '更新失败');
        setError(msg);
        return false;
      }
      setCards((prev) => prev.map((c) => c.id === cardId ? payload.data : c));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新画面卡失败。');
      return false;
    }
  }, [projectId]);

  const remove = useCallback(async (cardId: string, expectedRevision: number) => {
    try {
      const response = await apiFetch(`/projects/${projectId}/shot-cards/${cardId}?expectedRevision=${expectedRevision}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('删除失败');
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除画面卡失败。');
    }
  }, [projectId]);

  const duplicate = useCallback(async (card: ShotCard) => {
    return create({
      title: `${card.title}（副本）`,
      purpose: card.purpose,
      subject: card.subject,
      scene: card.scene,
      shotSize: card.shotSize,
      cameraAngle: card.cameraAngle,
      composition: card.composition,
      lighting: card.lighting,
      colorTone: card.colorTone,
      action: card.action,
      scienceInfo: card.scienceInfo,
      priority: card.priority,
      peopleEquipmentMaterials: (card.peopleEquipmentMaterials ?? []).join('、'),
      riskNotes: (card.risks ?? []).map((r) => `[${r.severity}] ${r.description}`).join('\n'),
      referenceImageUrls: (card.referenceImageUrls ?? []).join('\n'),
    });
  }, [projectId, create]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const current = cardsRef.current;
    setCards((prev) => {
      const byId = new Map(prev.map((c) => [c.id, c]));
      return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
    });
    try {
      const response = await apiFetch(`/projects/${projectId}/shot-cards/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
      const payload = await response.json() as { success: boolean; data: ShotCard[] };
      if (payload.success) setCards(payload.data);
      else setCards(current);
    } catch {
      setCards(current);
      setError('排序失败。');
    }
  }, [projectId]);

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    const ids = cardsRef.current.map((c) => c.id);
    [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
    void reorder(ids);
  }, [reorder]);

  const moveDown = useCallback((index: number) => {
    if (index >= cardsRef.current.length - 1) return;
    const ids = cardsRef.current.map((c) => c.id);
    [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!];
    void reorder(ids);
  }, [reorder]);

  return { cards, loading, error, create, update, remove, duplicate, reorder, moveUp, moveDown, reload: load, setError };
}
