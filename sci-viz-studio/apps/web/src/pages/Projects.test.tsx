import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Projects } from './Projects';

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
  notifyUsageChanged: vi.fn(),
  setAuthTokenProvider: vi.fn(),
  API_BASE_URL: '/api/v1',
}));
vi.mock('../auth/AuthRoot', () => ({ AccountIdentity: () => <span>测试账户</span> }));
vi.mock('../auth/UsageProfile', () => ({ UsageProfile: () => <span>AI 50</span> }));

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
      expect(screen.getByText('还没有项目，从上方开始。')).toBeTruthy();
    });
    expect(screen.getByText('从一个科研项目开始')).toBeTruthy();
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

  it('keeps the unified project starter above an empty recent-project section', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('最近项目')).toBeTruthy();
    });
    expect(screen.getByLabelText('项目启动内容')).toBeTruthy();
    expect(screen.getByLabelText('选择联网研究模式').textContent).toContain('Fast Research');
    expect(screen.getByText('所有项目')).toBeTruthy();
    expect(screen.getByText('问题反馈')).toBeTruthy();
    expect(screen.queryByText('Sci AI Studio')).toBeNull();
  });

  it('disables creating a project while the unified input is empty', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    renderProjects();
    await waitFor(() => {
      expect(screen.getByText('从一个科研项目开始')).toBeTruthy();
    });
    expect((screen.getByRole('button', { name: '创建项目' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
