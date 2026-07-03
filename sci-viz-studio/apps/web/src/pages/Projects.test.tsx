import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from './Projects';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  notifyUsageChanged: vi.fn(),
  setAuthTokenProvider: vi.fn(),
  API_BASE_URL: '/api/v1',
}));

import { apiFetch } from '../api/client';

const mockApi = vi.mocked(apiFetch);

function renderProjects() {
  return render(
    <MemoryRouter>
      <Projects />
    </MemoryRouter>
  );
}

describe('Projects page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    renderProjects();
    expect(screen.getByText('正在加载项目…')).toBeTruthy();
  });

  it('renders empty state when no projects', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('还没有项目')).toBeTruthy();
    });
    expect(screen.getByText('创建第一个项目')).toBeTruthy();
  });

  it('renders error state with retry', async () => {
    mockApi.mockRejectedValue(new Error('网络错误'));

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeTruthy();
    });
    expect(screen.getByText('重试')).toBeTruthy();
  });

  it('renders project list', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'proj-1',
            ownerUserId: 'user-1',
            name: '微流控成像项目',
            teamType: '高校实验室',
            researchDirection: '生物医学工程',
            primaryAudience: '合作企业',
            primaryGoal: 'INDUSTRY_COLLABORATION',
            secondaryGoal: 'PUBLIC_COMMUNICATION',
            projectType: 'PHOTO',
            status: 'ACTIVE',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-02T10:00:00.000Z',
          },
        ],
      }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('微流控成像项目')).toBeTruthy();
    });
    expect(screen.getByText('高校实验室')).toBeTruthy();
    expect(screen.getByText('产业转化/合作')).toBeTruthy();
  });

  it('opens new project modal', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('还没有项目')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('创建第一个项目'));
    expect(screen.getByText('新建项目')).toBeTruthy();
    expect(screen.getByPlaceholderText('例如：微流控芯片成像方案')).toBeTruthy();
  });

  it('prevents submit with empty name', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('还没有项目')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('创建第一个项目'));

    const submitBtn = screen.getByText('创建项目');
    expect(submitBtn.closest('button')?.disabled).toBe(true);
  });

  it('shows error when API returns failure', async () => {
    mockApi.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('还没有项目')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('创建第一个项目'));

    const nameInput = screen.getByPlaceholderText('例如：微流控芯片成像方案');
    fireEvent.change(nameInput, { target: { value: '测试项目' } });

    mockApi.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: '创建失败' } }),
    } as Response);

    fireEvent.click(screen.getByText('创建项目'));

    await waitFor(() => {
      expect(screen.getByText('创建失败')).toBeTruthy();
    });
  });

  it('does not create duplicate projects on double click', async () => {
    mockApi.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('还没有项目')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('创建第一个项目'));

    const nameInput = screen.getByPlaceholderText('例如：微流控芯片成像方案');
    fireEvent.change(nameInput, { target: { value: '测试' } });

    let callCount = 0;
    mockApi.mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 100));
      return {
        ok: true,
        json: async () => ({ success: true, data: { project: {}, workflow: {} } }),
      } as Response;
    });

    const submitBtn = screen.getByText('创建项目');
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn.closest('button')?.disabled).toBe(true);
    });
  });
});
