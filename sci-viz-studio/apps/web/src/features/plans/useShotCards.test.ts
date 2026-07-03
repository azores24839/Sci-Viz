import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../api/client';
import { useShotCards, parseRiskLines, buildRisks } from './useShotCards';
import type { ShotCard } from '@studio/contracts';

const mockApi = vi.mocked(apiFetch);

function mockResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

const stamp = '2026-07-02T10:00:00.000Z';

function card(overrides: Partial<ShotCard> = {}): ShotCard {
  return {
    id: 'card-1', projectId: 'proj-1', title: 'Test', purpose: 'p', subject: 's', scene: 's',
    shotSize: '全景', cameraAngle: '平拍', composition: 'c', lighting: 'l', colorTone: '', action: 'a',
    scienceInfo: '', priority: 'MUST', peopleEquipmentMaterials: [], risks: [], referenceCaseIds: [],
    referenceImageUrls: [], sortOrder: 0, revision: 1, createdAt: stamp, updatedAt: stamp,
    ...overrides,
  };
}

describe('useShotCards risk conversion', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends risks array without riskNotes on create', async () => {
    let sentBody: string | null = null;
    mockApi.mockImplementation(async (url, init) => {
      if (String(url).includes('/shot-cards') && init?.method === 'POST') {
        sentBody = init.body as string;
        return mockResponse({ success: true, data: card({ id: 'new-card' }) });
      }
      return mockResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useShotCards('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });

    await act(async () => {
      await result.current.create({
        title: 'Test', purpose: 'p', subject: 's', scene: 's', shotSize: '全景',
        cameraAngle: 'a', composition: 'c', lighting: 'l', colorTone: '', action: 'a',
        scienceInfo: '', priority: 'MUST', peopleEquipmentMaterials: '',
        riskNotes: '[WARNING] 激光风险\n[BLOCKER] 未授权区域',
        referenceImageUrls: '',
      });
    });

    expect(sentBody).not.toBeNull();
    const body = JSON.parse(sentBody!);
    expect(body.riskNotes).toBeUndefined();
    expect(body.risks).toBeDefined();
    expect(body.risks).toHaveLength(2);
    expect(body.risks[0].severity).toBe('WARNING');
    expect(body.risks[0].description).toBe('激光风险');
    expect(body.risks[1].severity).toBe('BLOCKER');
    expect(body.risks[1].description).toBe('未授权区域');
    expect(body.risks[0].id).toBeTruthy();
    expect(body.risks[0].resolved).toBe(false);
  }, 10000);

  it('preserves existing risk IDs on update', async () => {
    const existingRisk = { id: 'old-risk-id', category: 'SAFETY' as const, severity: 'WARNING' as const, description: '激光风险', resolved: true, resolution: '已处理', sourceIds: [] as string[] };
    const existingCard = card({ id: 'card-1', revision: 1, risks: [existingRisk] });

    let sentBody: string | null = null;
    mockApi.mockImplementation(async (url, init) => {
      if (String(url).includes('/shot-cards')) {
        if (init?.method === 'PATCH') {
          sentBody = init.body as string;
          return mockResponse({ success: true, data: { ...existingCard, revision: 2 } });
        }
        return mockResponse({ success: true, data: [existingCard] });
      }
      return mockResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useShotCards('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });

    await act(async () => {
      await result.current.update('card-1', {
        title: 'Updated', riskNotes: '[WARNING] 激光风险\n[INFO] 新风险',
      } as any, 1);
    });

    expect(sentBody).not.toBeNull();
    const body = JSON.parse(sentBody!);
    expect(body.riskNotes).toBeUndefined();
    expect(body.risks).toHaveLength(2);

    const matched = body.risks.find((r: any) => r.description === '激光风险');
    expect(matched).toBeDefined();
    expect(matched.id).toBe('old-risk-id');
    expect(matched.resolved).toBe(true);
    expect(matched.resolution).toBe('已处理');

    const newRisk = body.risks.find((r: any) => r.description === '新风险');
    expect(newRisk).toBeDefined();
    expect(newRisk.id).toBeTruthy();
    expect(newRisk.resolved).toBe(false);
  }, 10000);

  it('parses risk severity from bracket format', () => {
    const parsed = parseRiskLines('[BLOCKER] 安全问题\n[WARNING] 注意\n[INFO] 提示信息');
    expect(parsed).toHaveLength(3);
    expect(parsed[0]!.severity).toBe('BLOCKER');
    expect(parsed[0]!.description).toBe('安全问题');
  });

  it('ignores lines without severity brackets', () => {
    const parsed = parseRiskLines('[WARNING] valid\nplain text\n[INFO] another');
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.description).toBe('valid');
    expect(parsed[1]!.description).toBe('another');
  });

  it('buildRisks preserves existing IDs and resolved status', () => {
    const existing: any[] = [{ id: 'old-1', category: 'SAFETY', severity: 'WARNING' as const, description: 'match', resolved: true, resolution: 'done', sourceIds: [] }];
    const parsed = [{ severity: 'BLOCKER' as const, description: 'match' }, { severity: 'INFO' as const, description: 'new' }];
    const result = buildRisks(parsed, existing);
    expect(result[0]!.id).toBe('old-1');
    expect(result[0]!.resolved).toBe(true);
    expect(result[0]!.severity).toBe('BLOCKER');
    expect(result[1]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result[1]!.resolved).toBe(false);
  });

  it('each risk has required PlanRisk fields', async () => {
    let sentBody: string | null = null;
    mockApi.mockImplementation(async (url, init) => {
      if (String(url).includes('/shot-cards') && init?.method === 'POST') {
        sentBody = init.body as string;
        return mockResponse({ success: true, data: card({ id: 'new' }) });
      }
      return mockResponse({ success: true, data: [] });
    });

    const { result } = renderHook(() => useShotCards('proj-1'));
    await waitFor(() => { expect(result.current.loading).toBe(false); }, { timeout: 3000 });

    await act(async () => {
      await result.current.create({
        title: 'T', purpose: 'p', subject: 's', scene: 's', shotSize: 's',
        cameraAngle: 'a', composition: 'c', lighting: 'l', colorTone: '', action: 'a',
        scienceInfo: '', priority: 'MUST', peopleEquipmentMaterials: '',
        riskNotes: '[BLOCKER] test',
        referenceImageUrls: '',
      });
    });

    const body = JSON.parse(sentBody!);
    const risk = body.risks[0];
    expect(risk.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(risk.category).toBe('SAFETY');
    expect(risk.severity).toBe('BLOCKER');
    expect(risk.description).toBe('test');
    expect(risk.resolved).toBe(false);
    expect(risk.resolution).toBe('');
    expect(risk.sourceIds).toEqual([]);
  }, 10000);
});
