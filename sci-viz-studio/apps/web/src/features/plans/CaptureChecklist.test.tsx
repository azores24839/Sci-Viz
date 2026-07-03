import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CaptureChecklist } from './CaptureChecklist';

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../api/client';
const mockApi = vi.mocked(apiFetch);

function mockResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

const stamp = '2026-07-02T10:00:00.000Z';

function mockCard(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, projectId: 'proj-1', title: `画面 ${id}`, purpose: 'p', subject: 's',
    scene: overrides.scene as string ?? '实验室', shotSize: '全景',
    cameraAngle: 'a', composition: 'c', lighting: 'l', colorTone: '', action: 'a',
    scienceInfo: '', priority: (overrides.priority as string) ?? 'MUST',
    peopleEquipmentMaterials: [], risks: [], referenceCaseIds: [],
    referenceImageUrls: [], sortOrder: 0, revision: 1, createdAt: stamp, updatedAt: stamp,
  };
}

function mockCapture(shotCardId: string, overrides: Record<string, unknown> = {}) {
  return {
    shotCardId, projectId: 'proj-1',
    status: (overrides.status as string) ?? 'TODO',
    fileNumber: (overrides.fileNumber as string) ?? '',
    note: (overrides.note as string) ?? '',
    revision: (overrides.revision as number) ?? 1,
    updatedAt: stamp,
  };
}

describe('CaptureChecklist', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders loading state', () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    render(<CaptureChecklist projectId="proj-1" />);
    expect(screen.getByText('正在加载拍摄清单…')).toBeTruthy();
  });

  it('renders empty state when no cards', async () => {
    mockApi.mockImplementation((_url, init) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      if (url.includes('/capture-items')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => {
      expect(screen.getByText(/暂无画面卡/)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renders checklist grouped by scene', async () => {
    const cards = [
      mockCard('c1', { scene: '实验室A', priority: 'MUST' }),
      mockCard('c2', { scene: '实验室A', priority: 'SHOULD' }),
      mockCard('c3', { scene: '办公室', priority: 'MUST' }),
    ];
    mockApi.mockImplementation((_url) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => {
      expect(screen.getByText('实验室A')).toBeTruthy();
      expect(screen.getByText('办公室')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('toggles status successfully and updates revision', async () => {
    const cards = [mockCard('c1')];
    let patchCallCount = 0;
    mockApi.mockImplementation((_url, init) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) {
        if (init?.method === 'PATCH') {
          patchCallCount++;
          return Promise.resolve(mockResponse({ success: true, data: mockCapture('c1', { status: 'CAPTURED', revision: 2 }) }));
        }
        return Promise.resolve(mockResponse({ success: true, data: [] }));
      }
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => { expect(screen.getByText('未拍')).toBeTruthy(); }, { timeout: 3000 });

    await act(async () => { fireEvent.click(screen.getByText('未拍')); });
    await waitFor(() => { expect(screen.getByText('已拍')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);

  it('rapid clicks send only one PATCH', async () => {
    const cards = [mockCard('c1')];
    let patchCallCount = 0;
    mockApi.mockImplementation((_url, init) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) {
        if (init?.method === 'PATCH') {
          patchCallCount++;
          return Promise.resolve(mockResponse({ success: true, data: mockCapture('c1', { status: 'CAPTURED', revision: 2 }) }));
        }
        return Promise.resolve(mockResponse({ success: true, data: [] }));
      }
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => { expect(screen.getByText('未拍')).toBeTruthy(); }, { timeout: 3000 });

    const btn = screen.getByText('未拍');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    await waitFor(() => { expect(screen.getByText('已拍')).toBeTruthy(); }, { timeout: 3000 });
    expect(patchCallCount).toBe(1);
  }, 10000);

  it('status persists locally on network failure', async () => {
    const cards = [mockCard('c1')];
    mockApi.mockImplementation((_url, init) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) {
        if (init?.method === 'PATCH') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve(mockResponse({ success: true, data: [] }));
      }
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => { expect(screen.getByText('未拍')).toBeTruthy(); }, { timeout: 3000 });

    fireEvent.click(screen.getByText('未拍'));

    await waitFor(() => {
      const labels = screen.getAllByText('已拍');
      expect(labels.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  }, 10000);

  it('retry sync re-submits failed tasks', async () => {
    const cards = [mockCard('c1')];
    let attempt = 0;
    mockApi.mockImplementation((_url, init) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) {
        if (init?.method === 'PATCH') {
          attempt++;
          if (attempt === 1) return Promise.reject(new Error('fail'));
          return Promise.resolve(mockResponse({ success: true, data: mockCapture('c1', { status: 'CAPTURED', revision: 2 }) }));
        }
        return Promise.resolve(mockResponse({ success: true, data: [] }));
      }
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => { expect(screen.getByText('未拍')).toBeTruthy(); }, { timeout: 3000 });

    fireEvent.click(screen.getByText('未拍'));
    await waitFor(() => {
      const labels = screen.queryAllByText(/未保存|同步失败/);
      expect(labels.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    fireEvent.click(screen.getByTitle('重新同步'));
    await waitFor(() => { expect(screen.getByText('已同步')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);

  it('total status cycle works TODO→CAPTURED→RESHOOT', async () => {
    const cards = [mockCard('c1')];
    let currentStatus = 'TODO';
    mockApi.mockImplementation((_url, init) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) {
        if (init?.method === 'PATCH') {
          if (currentStatus === 'TODO') currentStatus = 'CAPTURED';
          else if (currentStatus === 'CAPTURED') currentStatus = 'RESHOOT';
          else currentStatus = 'TODO';
          return Promise.resolve(mockResponse({ success: true, data: mockCapture('c1', { status: currentStatus, revision: 1 }) }));
        }
        return Promise.resolve(mockResponse({ success: true, data: [] }));
      }
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => { expect(screen.getByText('未拍')).toBeTruthy(); }, { timeout: 3000 });

    await act(async () => { fireEvent.click(screen.getByText('未拍')); });
    await waitFor(() => { expect(screen.getByText('已拍')).toBeTruthy(); }, { timeout: 3000 });

    await act(async () => { fireEvent.click(screen.getByText('已拍')); });
    await waitFor(() => { expect(screen.getByText('需补拍')).toBeTruthy(); }, { timeout: 3000 });

    await act(async () => { fireEvent.click(screen.getByText('需补拍')); });
    await waitFor(() => { expect(screen.getByText('未拍')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);

  it('file number input exists and is accessible', async () => {
    const cards = [mockCard('c1')];
    mockApi.mockImplementation((_url) => {
      const url = String(_url);
      if (url.includes('/shot-cards')) return Promise.resolve(mockResponse({ success: true, data: cards }));
      if (url.includes('/capture-items')) return Promise.resolve(mockResponse({ success: true, data: [] }));
      return Promise.resolve(mockResponse({ success: true, data: [] }));
    });
    render(<CaptureChecklist projectId="proj-1" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('IMG_001')).toBeTruthy();
      expect(screen.getByText('添加备注…')).toBeTruthy();
    }, { timeout: 3000 });
  }, 10000);
});
