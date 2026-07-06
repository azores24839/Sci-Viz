import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResearchPanel } from './ResearchPanel';
import { apiFetch } from '../../api/client';

vi.mock('../../api/client', () => ({ apiFetch: vi.fn(), notifyUsageChanged: vi.fn() }));
const mockedFetch = vi.mocked(apiFetch);

describe('ResearchPanel', () => {
  beforeEach(() => { mockedFetch.mockReset(); });

  it('offers only Fast and Deep research and starts the selected mode', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { id: 'task' } }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }));
    render(<ResearchPanel projectId="11111111-1111-4111-8111-111111111111" onAdopted={vi.fn()} />);
    expect(await screen.findByText('Fast Research')).toBeTruthy();
    expect(screen.getByText('Deep Research')).toBeTruthy();
    expect(screen.queryByText('Google Drive')).toBeNull();
    fireEvent.click(screen.getByText('Deep Research'));
    fireEvent.change(screen.getByPlaceholderText('输入项目名称、实验室、研究主题，或希望补充的问题…'), { target: { value: '深海机器人实验室' } });
    fireEvent.click(screen.getByRole('button', { name: '开始深度研究' }));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('/research-tasks', expect.objectContaining({ method: 'POST' })));
    const request = mockedFetch.mock.calls.find(([url]) => url === '/research-tasks')?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ mode: 'DEEP', query: '深海机器人实验室' });
  });

  it('shows the server configuration error instead of mock results', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { message: '联网研究尚未配置。' } }), { status: 503 }));
    render(<ResearchPanel projectId="11111111-1111-4111-8111-111111111111" onAdopted={vi.fn()} />);
    await screen.findByText('Fast Research');
    fireEvent.change(screen.getByPlaceholderText('输入项目名称、实验室、研究主题，或希望补充的问题…'), { target: { value: '量子材料' } });
    fireEvent.click(screen.getByRole('button', { name: '快速研究' }));
    expect(await screen.findByText('联网研究尚未配置。')).toBeTruthy();
  });

  it('selects and clears every candidate in one research task', async () => {
    const task = {
      id: '22222222-2222-4222-8222-222222222222', projectId: '11111111-1111-4111-8111-111111111111', ownerUserId: 'user-a', mode: 'FAST', query: '深海机器人', status: 'COMPLETED', createdAt: '2026-07-05T00:00:00.000Z', updatedAt: '2026-07-05T00:00:01.000Z',
      candidates: [
        { id: '33333333-3333-4333-8333-333333333333', title: '来源 A', url: 'https://a.example/research', domain: 'a.example', snippet: 'A', score: 0.9, sourceType: 'OFFICIAL' },
        { id: '44444444-4444-4444-8444-444444444444', title: '来源 B', url: 'https://b.example/paper', domain: 'b.example', snippet: 'B', score: 0.8, sourceType: 'PAPER' },
      ],
    };
    mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: [task] }), { status: 200 }));
    render(<ResearchPanel projectId={task.projectId} onAdopted={vi.fn()} />);
    const selectAll = await screen.findByRole('checkbox', { name: '全选本次结果' });
    fireEvent.click(selectAll);
    expect(screen.getByText('已选 2/2')).toBeTruthy();
    expect(screen.getAllByRole('checkbox').filter((checkbox) => (checkbox as HTMLInputElement).checked)).toHaveLength(3);
    fireEvent.click(selectAll);
    expect(screen.getByText('已选 0/2')).toBeTruthy();
  });
});
