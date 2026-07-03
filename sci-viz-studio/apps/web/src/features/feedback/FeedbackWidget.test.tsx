import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackWidget } from './FeedbackWidget';

vi.mock('../../api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../api/client';

const mockApi = vi.mocked(apiFetch);

describe('FeedbackWidget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders trigger button', () => {
    render(<FeedbackWidget context={{ page: '测试页' }} />);
    expect(screen.getByLabelText('打开反馈')).toBeTruthy();
  });

  it('opens modal on trigger click', () => {
    render(<FeedbackWidget context={{ page: '测试页' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    expect(screen.getByText('反馈类型')).toBeTruthy();
    expect(screen.getByPlaceholderText('请描述你遇到的问题或建议…')).toBeTruthy();
  });

  it('shows auto context info', () => {
    render(<FeedbackWidget context={{ page: '测试页', projectId: 'proj-1', nodeId: 'node-2', nodeLabel: '视觉诊断' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    expect(screen.getByText(/测试页/)).toBeTruthy();
    expect(screen.getByText(/proj-1/)).toBeTruthy();
    expect(screen.getByText(/node-2/)).toBeTruthy();
    expect(screen.getByText(/视觉诊断/)).toBeTruthy();
  });

  it('prevents submit without category and description', () => {
    render(<FeedbackWidget context={{ page: '测试页' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    const submitBtn = screen.getByRole('button', { name: '提交反馈' });
    expect(submitBtn.closest('button')?.disabled).toBe(true);
  });

  it('enables submit after selecting category and writing description', () => {
    render(<FeedbackWidget context={{ page: '测试页' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    fireEvent.click(screen.getByText('功能建议'));
    const textarea = screen.getByPlaceholderText('请描述你遇到的问题或建议…');
    fireEvent.change(textarea, { target: { value: '测试反馈内容' } });
    const submitBtn = screen.getByRole('button', { name: '提交反馈' });
    expect(submitBtn.closest('button')?.disabled).toBe(false);
  });

  it('submits feedback successfully', async () => {
    mockApi.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'fb-1' } }),
    } as Response);

    render(<FeedbackWidget context={{ page: '测试页' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    fireEvent.click(screen.getByText('遇到问题'));
    fireEvent.change(screen.getByPlaceholderText('请描述你遇到的问题或建议…'), { target: { value: '测试反馈' } });
    fireEvent.click(screen.getByRole('button', { name: '提交反馈' }));

    await waitFor(() => {
      expect(screen.getByText('感谢你的反馈')).toBeTruthy();
    });
  });

  it('shows error on API failure', async () => {
    mockApi.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: '提交失败' } }),
    } as Response);

    render(<FeedbackWidget context={{ page: '测试页' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    fireEvent.click(screen.getByText('其他'));
    fireEvent.change(screen.getByPlaceholderText('请描述你遇到的问题或建议…'), { target: { value: '测试' } });
    fireEvent.click(screen.getByRole('button', { name: '提交反馈' }));

    await waitFor(() => {
      expect(screen.getByText('提交失败')).toBeTruthy();
    });
  });

  it('closes on Escape key', () => {
    render(<FeedbackWidget context={{ page: '测试页' }} />);
    fireEvent.click(screen.getByLabelText('打开反馈'));
    expect(screen.getByText('反馈类型')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('反馈类型')).toBeNull();
  });
});
