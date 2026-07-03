import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionPanel } from './VersionPanel';
import type { PlanVersion } from '@studio/contracts';

function mockVersion(overrides: Partial<PlanVersion> = {}): PlanVersion {
  return {
    id: 'v-001',
    projectId: 'proj-1',
    version: 1,
    content: {
      executiveSummary: '测试方案摘要',
      goals: '产业转化',
      visualDiagnosis: '',
      benchmarkSummary: '',
      curationStrategy: '',
      shootingApproach: '拍摄方案内容',
      risks: [],
      sourceIds: [],
    },
    createdBy: 'USER',
    changeSummary: '更新了拍摄方案',
    createdAt: '2026-07-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('VersionPanel', () => {
  it('renders version list', () => {
    render(
      <VersionPanel
        versions={[mockVersion(), mockVersion({ id: 'v-002', version: 2, createdBy: 'AGENT', changeSummary: '' })]}
        currentVersion={2}
        onRestore={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText('版本历史')).toBeTruthy();
  });

  it('marks current version', () => {
    render(
      <VersionPanel
        versions={[mockVersion(), mockVersion({ id: 'v-002', version: 2 })]}
        currentVersion={2}
        onRestore={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('当前')).toBeTruthy();
  });

  it('shows createdBy labels', () => {
    render(
      <VersionPanel
        versions={[mockVersion({ createdBy: 'USER' }), mockVersion({ id: 'v-002', version: 2, createdBy: 'AGENT' }), mockVersion({ id: 'v-003', version: 3, createdBy: 'SYSTEM' })]}
        currentVersion={3}
        onRestore={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('你')).toBeTruthy();
    expect(screen.getByText('AI')).toBeTruthy();
    expect(screen.getByText('系统')).toBeTruthy();
  });

  it('shows restore button for non-current versions', () => {
    render(
      <VersionPanel
        versions={[mockVersion(), mockVersion({ id: 'v-002', version: 2 })]}
        currentVersion={2}
        onRestore={() => {}}
        onClose={() => {}}
      />
    );
    const restoreBtns = screen.getAllByText('恢复此版本');
    expect(restoreBtns).toHaveLength(1);
  });

  it('calls onRestore on confirm', () => {
    const onRestore = vi.fn();
    window.confirm = vi.fn(() => true);
    render(
      <VersionPanel
        versions={[mockVersion(), mockVersion({ id: 'v-002', version: 2 })]}
        currentVersion={2}
        onRestore={onRestore}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByText('恢复此版本'));
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('calls onClose', () => {
    const onClose = vi.fn();
    render(
      <VersionPanel versions={[mockVersion()]} currentVersion={1} onRestore={() => {}} onClose={onClose} />
    );
    fireEvent.click(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state', () => {
    render(
      <VersionPanel versions={[]} currentVersion={0} onRestore={() => {}} onClose={() => {}} />
    );
    expect(screen.getByText('暂无历史版本。')).toBeTruthy();
  });

  it('shows change summary when present', () => {
    render(
      <VersionPanel
        versions={[mockVersion({ changeSummary: '修改了拍摄目标' })]}
        currentVersion={1}
        onRestore={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('修改了拍摄目标')).toBeTruthy();
  });

  it('keyboard accessible - Escape closes', () => {
    const onClose = vi.fn();
    render(
      <VersionPanel versions={[mockVersion()]} currentVersion={1} onRestore={() => {}} onClose={onClose} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
  });
});
