import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentJobStatus } from './AgentJobStatus';
import type { AgentJob } from '@studio/contracts';

function mockJob(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    id: 'job-001',
    ownerUserId: 'user-1',
    projectId: 'proj-1',
    idempotencyKey: 'ik-001',
    status: 'QUEUED',
    attempt: 0,
    maxAttempts: 3,
    availableAt: new Date().toISOString(),
    request: {
      projectId: 'proj-1',
      projectName: '测试项目',
      nodeId: 'visual-diagnosis',
      nodeLabel: '视觉诊断',
      agentRole: 'SOURCE_ANALYST',
      task: 'DIAGNOSE_VISUAL_STATE',
      inputLabel: '资料包',
      outputLabel: '诊断结果',
      planLabel: 'Plan A',
      revision: 1,
      upstreamArtifacts: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AgentJobStatus', () => {
  it('renders queued state', () => {
    render(<AgentJobStatus job={null} status="QUEUED" />);
    expect(screen.getByText('排队中')).toBeTruthy();
    expect(screen.getByText('您的任务已排队，完成后会自动显示结果。')).toBeTruthy();
  });

  it('hides technical telemetry while a task is running', () => {
    render(
      <AgentJobStatus
        job={mockJob({ status: 'RUNNING', attempt: 2, startedAt: '2026-07-02T10:30:00.000Z' })}
        status="RUNNING"
        sourceCount={5}
        revision={3}
        planLabel="Plan B"
      />
    );
    expect(screen.getByText('处理中')).toBeTruthy();
    expect(screen.queryByText('第 2/3 次尝试')).toBeNull();
    expect(screen.queryByText('使用 5 份资料')).toBeNull();
    expect(screen.queryByText('Plan B / v3')).toBeNull();
  });

  it('renders completed state', () => {
    render(<AgentJobStatus job={mockJob({ status: 'COMPLETED' })} status="COMPLETED" />);
    expect(screen.getByText('已完成')).toBeTruthy();
  });

  it('renders failed state with retryable error and retry button', () => {
    const onRetry = () => {};
    render(
      <AgentJobStatus
        job={mockJob({
          status: 'FAILED',
          error: { code: 'MODEL_RATE_LIMITED', message: '服务繁忙，任务将自动重试。', retryable: true },
        })}
        status="FAILED"
        onRetry={onRetry}
      />
    );
    expect(screen.getByText('失败')).toBeTruthy();
    expect(screen.getByText('重试')).toBeTruthy();
    expect(screen.getByText('当前使用人数较多')).toBeTruthy();
  });

  it('renders failed state with non-retryable error without retry button', () => {
    render(
      <AgentJobStatus
        job={mockJob({
          status: 'FAILED',
          error: { code: 'AGENT_JOB_FAILED', message: 'Task error', retryable: false },
        })}
        status="FAILED"
      />
    );
    expect(screen.queryByText('重试')).toBeNull();
    expect(screen.getByText('这次没有生成成功')).toBeTruthy();
    expect(screen.queryByText('AGENT_JOB_FAILED')).toBeNull();
    expect(screen.queryByText('Task error')).toBeNull();
    expect(screen.getByText('请返回上一步确认资料是否完整，然后重新运行。')).toBeTruthy();
  });

  it('renders quota exceeded with recovery info', () => {
    render(
      <AgentJobStatus
        job={mockJob({
          status: 'FAILED',
          error: { code: 'USER_QUOTA_EXCEEDED', message: '今天的 AI 使用额度已用完。', retryable: false },
        })}
        status="FAILED"
      />
    );
    expect(screen.getByText('每日额度将在次日 00:00 重置。')).toBeTruthy();
  });

  it('renders model timeout error', () => {
    render(
      <AgentJobStatus
        job={mockJob({
          status: 'FAILED',
          error: { code: 'MODEL_TIMEOUT', message: '模型处理超时，任务将自动重试。', retryable: true },
        })}
        status="FAILED"
      />
    );
    expect(screen.getByText('处理时间有点久')).toBeTruthy();
  });

  it('renders model unavailable error', () => {
    render(
      <AgentJobStatus
        job={mockJob({
          status: 'FAILED',
          error: { code: 'MODEL_UNAVAILABLE', message: '模型服务暂时不可用，任务将自动重试。', retryable: true },
        })}
        status="FAILED"
      />
    );
    expect(screen.getByText('AI 服务暂时不可用')).toBeTruthy();
  });

  it('renders awaiting_human state', () => {
    render(<AgentJobStatus job={null} status="AWAITING_HUMAN" />);
    expect(screen.getByText('等待确认')).toBeTruthy();
  });

  it('uses aria-live polite for screen reader announcements', () => {
    render(<AgentJobStatus job={null} status="QUEUED" />);
    const regions = screen.getAllByRole('status');
    expect(regions.length).toBeGreaterThan(0);
    expect(regions[regions.length - 1]!.getAttribute('aria-live')).toBe('polite');
  });

  it('shows error with role alert', () => {
    render(
      <AgentJobStatus
        job={mockJob({
          status: 'FAILED',
          error: { code: 'MODEL_RATE_LIMITED', message: '服务繁忙。', retryable: true },
        })}
        status="FAILED"
      />
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('never exposes raw parser errors or internal error codes', () => {
    render(<AgentJobStatus job={mockJob({ status: 'FAILED', error: { code: 'AGENT_OUTPUT_INVALID', message: 'Unexpected token # is not valid JSON', retryable: true } })} status="FAILED" onRetry={() => {}} />);
    expect(screen.getByText('生成结果需要重新整理')).toBeTruthy();
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
    expect(screen.queryByText('AGENT_OUTPUT_INVALID')).toBeNull();
  });
});
