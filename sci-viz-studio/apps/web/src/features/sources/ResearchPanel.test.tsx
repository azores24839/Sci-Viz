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
});
