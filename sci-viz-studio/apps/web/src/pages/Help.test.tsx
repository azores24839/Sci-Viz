import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Help } from './Help';

function renderHelp() {
  return render(
    <MemoryRouter>
      <Help />
    </MemoryRouter>
  );
}

describe('Help page', () => {
  it('renders page title', () => {
    renderHelp();
    expect(screen.getByText('帮助中心')).toBeTruthy();
  });

  it('renders all FAQ sections', () => {
    renderHelp();
    expect(screen.getByText('快速入门')).toBeTruthy();
    expect(screen.getByText('工作流使用')).toBeTruthy();
    expect(screen.getByText('常见错误')).toBeTruthy();
    expect(screen.getByText('反馈与支持')).toBeTruthy();
  });

  it('expands default sections', () => {
    renderHelp();
    expect(screen.getByText('Sci AI Studio 是什么？')).toBeTruthy();
    expect(screen.getByText('提示「今天的 AI 使用额度已用完」')).toBeTruthy();
  });

  it('collapses non-default sections', () => {
    renderHelp();
    expect(screen.queryByText('刷新页面后进度会丢失吗？')).toBeNull();
    expect(screen.queryByText('如何提交反馈或报 Bug？')).toBeNull();
  });

  it('toggles section on header click', () => {
    renderHelp();
    const workFlowHeader = screen.getByText('工作流使用');
    fireEvent.click(workFlowHeader);
    expect(screen.getByText('刷新页面后进度会丢失吗？')).toBeTruthy();
  });

  it('has error explanations for all common issues', () => {
    renderHelp();
    expect(screen.getByText(/额度已用完/)).toBeTruthy();
    expect(screen.getByText(/OCR 识别失败/)).toBeTruthy();
    expect(screen.getByText(/网页链接抓取失败/)).toBeTruthy();
    expect(screen.getByText(/MODEL_TIMEOUT/)).toBeTruthy();
    expect(screen.getByText(/MODEL_UNAVAILABLE/)).toBeTruthy();
    expect(screen.getByText(/MODEL_RATE_LIMITED/)).toBeTruthy();
    expect(screen.getByText(/导出 PDF/)).toBeTruthy();
  });

  it('has back link to project list', () => {
    renderHelp();
    const backLink = screen.getByText(/返回项目列表/);
    expect(backLink.getAttribute('href')).toBe('/');
  });

  it('shows getting started when expanded', () => {
    renderHelp();
    expect(screen.getByText('我该怎么开始？')).toBeTruthy();
    expect(screen.getByText('项目和工作流是什么关系？')).toBeTruthy();
  });

  it('feedback section mentions not auto-collecting source content', () => {
    renderHelp();
    const feedbackSection = screen.getByText('反馈与支持');
    fireEvent.click(feedbackSection);
    expect(screen.getByText(/不会自动发送你上传的文件内容/)).toBeTruthy();
  });
});
