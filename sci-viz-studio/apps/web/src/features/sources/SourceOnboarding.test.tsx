import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceOnboarding } from './SourceOnboarding';
import { createProjectTextSource, startProjectResearch, uploadProjectFiles } from './sourceApi';

vi.mock('./sourceApi', () => ({
  createProjectTextSource: vi.fn(),
  createProjectWebSource: vi.fn(),
  startProjectResearch: vi.fn(),
  uploadProjectFiles: vi.fn(),
}));

const projectId = '11111111-1111-4111-8111-111111111111';

describe('SourceOnboarding', () => {
  beforeEach(() => {
    vi.mocked(createProjectTextSource).mockReset().mockResolvedValue(undefined);
    vi.mocked(startProjectResearch).mockReset().mockResolvedValue(undefined);
    vi.mocked(uploadProjectFiles).mockReset().mockResolvedValue(undefined);
  });

  it('saves a normal submission as the project description and opens the workspace', async () => {
    const onStarted = vi.fn();
    render(<SourceOnboarding projectId={projectId} onStarted={onStarted} />);
    expect(screen.getByText('从理解科研项目开始')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('项目描述'), { target: { value: '我们正在研发深海机器人' } });
    fireEvent.click(screen.getByRole('button', { name: '保存项目描述' }));
    await waitFor(() => expect(createProjectTextSource).toHaveBeenCalledWith(projectId, '我们正在研发深海机器人', '项目描述'));
    expect(startProjectResearch).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it('uses the input as a research query without also saving it as project text', async () => {
    const onStarted = vi.fn();
    render(<SourceOnboarding projectId={projectId} onStarted={onStarted} />);
    fireEvent.change(screen.getByLabelText('项目描述'), { target: { value: '量子材料实验室' } });
    fireEvent.click(screen.getByRole('button', { name: /Deep Research/ }));
    await waitFor(() => expect(startProjectResearch).toHaveBeenCalledWith(projectId, 'DEEP', '量子材料实验室'));
    expect(createProjectTextSource).not.toHaveBeenCalled();
    expect(onStarted).toHaveBeenCalledOnce();
  });

  it('opens the workspace after a file is uploaded even when the text box is empty', async () => {
    const onStarted = vi.fn();
    const { container } = render(<SourceOnboarding projectId={projectId} onStarted={onStarted} />);
    const file = new File(['content'], 'brief.pdf', { type: 'application/pdf' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploadProjectFiles).toHaveBeenCalledWith(projectId, [file]));
    expect(onStarted).toHaveBeenCalledOnce();
  });
});
