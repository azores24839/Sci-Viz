import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReviewPage } from './ReviewPage';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../api/client';
const mockApi = vi.mocked(apiFetch);

function mockResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as unknown as Response;
}

const snapshot = {
  reviewLinkId: 'link-1',
  project: { name: '测试项目', teamType: '高校实验室', researchDirection: '生物医学', primaryAudience: '合作企业' },
  plan: {
    title: '方案', version: 1, executiveSummary: '摘要内容', goals: '目标描述',
    visualDiagnosis: '诊断', benchmarkSummary: '对标', curationStrategy: '策略', shootingApproach: '方法',
  },
  risks: [{ id: 'r1', category: 'SAFETY', severity: 'WARNING', description: '注意防护', resolved: false, resolution: '' }],
  shotCards: [{ id: 'sc1', title: '实验室全景', purpose: '展示环境', subject: '实验室', scene: '实验室', peopleEquipmentMaterials: [], shotSize: '全景', cameraAngle: '平拍', composition: '居中', lighting: '冷白光', colorTone: '', action: '', scienceInfo: '', priority: 'MUST', risks: [], sortOrder: 0 }],
  readiness: { executable: true, mustShotCount: 1, unresolvedBlockerCount: 0, reasons: [] },
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  submitted: false,
};

describe('ReviewPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const renderPage = () => render(
    <MemoryRouter initialEntries={['/review/test-token']}>
      <Routes>
        <Route path="/review/:token" element={<ReviewPage />} />
      </Routes>
    </MemoryRouter>
  );

  it('shows loading initially', () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('正在加载方案…')).toBeTruthy();
  });

  it('shows plan content after load', async () => {
    mockApi.mockResolvedValue(mockResponse({ success: true, data: snapshot }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('测试项目')).toBeTruthy(); }, { timeout: 3000 });
    expect(screen.getByText('摘要内容')).toBeTruthy();
    expect(screen.getByText('目标描述')).toBeTruthy();
  });

  it('shows expired state from 410 REVIEW_LINK_EXPIRED', async () => {
    mockApi.mockResolvedValue(mockResponse({ error: { code: 'REVIEW_LINK_EXPIRED', message: '审核链接已过期。' } }, false, 410));
    renderPage();
    await waitFor(() => { expect(screen.getByText('链接已过期')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows revoked state from 410 REVIEW_LINK_REVOKED', async () => {
    mockApi.mockResolvedValue(mockResponse({ error: { code: 'REVIEW_LINK_REVOKED', message: '审核链接已撤销。' } }, false, 410));
    renderPage();
    await waitFor(() => { expect(screen.getByText('链接已撤销')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows error for unknown 410 code', async () => {
    mockApi.mockResolvedValue(mockResponse({ error: { code: 'SOME_OTHER' } }, false, 410));
    renderPage();
    await waitFor(() => { expect(screen.getByText('重试')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows invalid state from 404 with REVIEW_LINK_INVALID', async () => {
    mockApi.mockResolvedValue(mockResponse({ error: { code: 'REVIEW_LINK_INVALID' } }, false, 404));
    renderPage();
    await waitFor(() => { expect(screen.getByText('链接无效')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows invalid state from 404 without error code', async () => {
    mockApi.mockResolvedValue(mockResponse({}, false, 404));
    renderPage();
    await waitFor(() => { expect(screen.getByText('链接无效')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows error with retry', async () => {
    const submitted = { ...snapshot, submitted: true };
    mockApi.mockResolvedValue(mockResponse({ success: true, data: submitted }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('审核已提交')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows invalid link state', async () => {
    mockApi.mockResolvedValue(mockResponse({}, false, 404));
    renderPage();
    await waitFor(() => { expect(screen.getByText('链接无效')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows error with retry', async () => {
    mockApi.mockRejectedValue(new Error('fail'));
    renderPage();
    await waitFor(() => { expect(screen.getByText('重试')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows not ready state', async () => {
    const notReady = { ...snapshot, readiness: { executable: false, mustShotCount: 0, unresolvedBlockerCount: 2, reasons: ['缺画面卡'] } };
    mockApi.mockResolvedValue(mockResponse({ success: true, data: notReady }));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('方案尚未满足可执行条件')).toBeTruthy();
      expect(screen.getByText('缺画面卡')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('requires comment when changes requested', async () => {
    mockApi.mockResolvedValue(mockResponse({ success: true, data: snapshot }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('测试项目')).toBeTruthy(); }, { timeout: 3000 });

    const nameInput = screen.getByPlaceholderText('请填写你的姓名');
    fireEvent.change(nameInput, { target: { value: '张专家' } });

    const changesRadio = screen.getByLabelText('方案需要修改');
    fireEvent.click(changesRadio);

    const submitBtn = screen.getByText('提交审核意见');
    expect(submitBtn.closest('button')?.disabled).toBe(true);
  });

  it('enables submit when all required filled', async () => {
    mockApi.mockResolvedValue(mockResponse({ success: true, data: snapshot }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('测试项目')).toBeTruthy(); }, { timeout: 3000 });

    const nameInput = screen.getByPlaceholderText('请填写你的姓名');
    fireEvent.change(nameInput, { target: { value: '张专家' } });

    const confirmRadio = screen.getByLabelText('方案可以执行');
    fireEvent.click(confirmRadio);

    const submitBtn = screen.getByText('提交审核意见');
    expect(submitBtn.closest('button')?.disabled).toBe(false);
  });

  it('shows readiness info', async () => {
    mockApi.mockResolvedValue(mockResponse({ success: true, data: snapshot }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('必拍画面卡 1 张，待解决阻断项 0 个')).toBeTruthy(); }, { timeout: 3000 });
  });

  it('shows shot cards', async () => {
    mockApi.mockResolvedValue(mockResponse({ success: true, data: snapshot }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('实验室全景')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);

  it('shows risk info', async () => {
    mockApi.mockResolvedValue(mockResponse({ success: true, data: snapshot }));
    renderPage();
    await waitFor(() => { expect(screen.getByText('注意防护')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);

  it('POST returns expired state on 410 REVIEW_LINK_EXPIRED', async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes('/responses')) {
        return Promise.resolve(mockResponse({ error: { code: 'REVIEW_LINK_EXPIRED' } }, false, 410));
      }
      return Promise.resolve(mockResponse({ success: true, data: snapshot }));
    });
    renderPage();
    await waitFor(() => { expect(screen.getByText('测试项目')).toBeTruthy(); }, { timeout: 3000 });

    const nameInput = screen.getByPlaceholderText('请填写你的姓名');
    fireEvent.change(nameInput, { target: { value: '张专家' } });
    fireEvent.click(screen.getByLabelText('方案可以执行'));
    fireEvent.click(screen.getByText('提交审核意见'));

    await waitFor(() => { expect(screen.getByText('链接已过期')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);

  it('POST returns revoked state on 410 REVIEW_LINK_REVOKED', async () => {
    mockApi.mockImplementation((url: string) => {
      if (String(url).includes('/responses')) {
        return Promise.resolve(mockResponse({ error: { code: 'REVIEW_LINK_REVOKED' } }, false, 410));
      }
      return Promise.resolve(mockResponse({ success: true, data: snapshot }));
    });
    renderPage();
    await waitFor(() => { expect(screen.getByText('测试项目')).toBeTruthy(); }, { timeout: 3000 });

    fireEvent.change(screen.getByPlaceholderText('请填写你的姓名'), { target: { value: '李专家' } });
    fireEvent.click(screen.getByLabelText('方案可以执行'));
    fireEvent.click(screen.getByText('提交审核意见'));

    await waitFor(() => { expect(screen.getByText('链接已撤销')).toBeTruthy(); }, { timeout: 3000 });
  }, 10000);
});
