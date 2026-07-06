import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStarter } from './ProjectStarter';
import { apiFetch } from '../../api/client';
import { createProjectTextSource, createProjectWebSource, startProjectResearch, uploadProjectFile } from '../sources/sourceApi';

vi.mock('../../api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../sources/sourceApi', () => ({
  readApiPayload: async (response: Response) => response.json(),
  createProjectTextSource: vi.fn(), createProjectWebSource: vi.fn(),
  startProjectResearch: vi.fn(), uploadProjectFile: vi.fn(),
}));

const mockedFetch = vi.mocked(apiFetch);

describe('ProjectStarter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createProjectTextSource).mockResolvedValue(undefined);
    vi.mocked(createProjectWebSource).mockResolvedValue(undefined);
    vi.mocked(startProjectResearch).mockResolvedValue(undefined);
    vi.mocked(uploadProjectFile).mockResolvedValue(undefined);
  });

  it('uses AI intake output, saves the original input and starts Fast Research by default', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { title: '深海柔性机械臂项目', brief: '原文', userNeeds: [], researchDirection: '深海机器人', possibleAudience: '产业合作方', primaryGoal: 'INDUSTRY_COLLABORATION', goalEvidence: '找合作方', constraints: [], urls: ['https://lab.example/research'], searchQuery: '深海柔性机械臂 产业合作 科研影像', uncertainties: [], usedAi: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { project: { id: '11111111-1111-4111-8111-111111111111' } } }), { status: 201 }));
    render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<ProjectStarter />} /><Route path="/projects/:id" element={<div>项目画布</div>} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('项目启动内容'), { target: { value: '我们在做深海柔性机械臂，准备找产业合作方。https://lab.example/research' } });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));
    await screen.findByText('项目画布');
    expect(createProjectTextSource).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('深海柔性机械臂'), '首页项目描述');
    expect(createProjectWebSource).toHaveBeenCalledWith(expect.any(String), 'https://lab.example/research');
    expect(startProjectResearch).toHaveBeenCalledWith(expect.any(String), 'FAST', expect.stringContaining('科研影像'));
  });

  it('switches to Deep Research through the icon-aligned menu', async () => {
    render(<MemoryRouter><ProjectStarter /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText('选择联网研究模式'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Deep Research/ }));
    await waitFor(() => expect(screen.getByLabelText('选择联网研究模式').textContent).toContain('Deep Research'));
  });

  it('accepts a dropped file, prevents browser navigation and enables file-only project creation', () => {
    render(<MemoryRouter><ProjectStarter /></MemoryRouter>);
    const file = new File(['image'], 'sample.jpg', { type: 'image/jpeg' });
    const composer = screen.getByLabelText('项目启动内容').parentElement!;
    fireEvent.drop(composer, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(screen.getByText('sample.jpg')).toBeTruthy();
    expect((screen.getByRole('button', { name: '创建项目' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
