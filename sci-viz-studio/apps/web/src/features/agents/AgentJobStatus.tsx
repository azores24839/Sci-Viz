import type { AgentJob, AgentJobStatus as JobStatus } from '@studio/contracts';

interface AgentJobStatusProps {
  job: AgentJob | null;
  status: JobStatus | 'LOADING' | 'AWAITING_HUMAN';
  onRetry?: () => void;
  sourceCount?: number;
  revision?: number;
  planLabel?: string;
}

const statusConfig: Record<string, { label: string; cssClass: string; icon: string }> = {
  LOADING: { label: '发送中…', cssClass: 'queued', icon: '' },
  QUEUED: { label: '排队中', cssClass: 'queued', icon: '' },
  RUNNING: { label: '处理中', cssClass: 'running', icon: '' },
  COMPLETED: { label: '已完成', cssClass: 'completed', icon: '' },
  FAILED: { label: '失败', cssClass: 'failed', icon: '' },
  CANCELLED: { label: '已取消', cssClass: 'failed', icon: '' },
  AWAITING_HUMAN: { label: '等待确认', cssClass: 'awaiting_human', icon: '' },
};

const errorCopy: Record<string, { title: string; message: string; action?: string }> = {
  MODEL_RATE_LIMITED: { title: '当前使用人数较多', message: 'AI 服务暂时繁忙，请稍后再试。' },
  MODEL_UNAVAILABLE: { title: 'AI 服务暂时不可用', message: '你的资料和进度已经保留，请稍后重试。' },
  MODEL_TIMEOUT: { title: '处理时间有点久', message: '这次任务没有在预期时间内完成，可以重新尝试。' },
  USER_QUOTA_EXCEEDED: { title: '今天的 AI 额度已用完', message: '你的资料和项目不会受到影响。', action: '每日额度将在次日 00:00 重置。' },
  AGENT_JOB_FAILED: { title: '这次没有生成成功', message: '你的资料和进度已经保留，可以重新运行这一步。' },
  INVALID_AGENT_JOB: { title: '暂时无法开始这一步', message: '请返回上一步，确认必要信息已经填写完整。' },
  AGENT_OUTPUT_INVALID: { title: '生成结果需要重新整理', message: 'AI 返回的内容格式不完整，可以重新生成，不会覆盖已有内容。' },
};

const fallbackError: { title: string; message: string; action?: string } = { title: '暂时无法完成这一步', message: '你的资料和进度已经保留，请稍后重试。' };

export function AgentJobStatus({ job, status, onRetry, sourceCount, revision, planLabel }: AgentJobStatusProps) {
  const config = (statusConfig[status] ?? statusConfig.FAILED)!;
  const error = job?.error;
  const isRetryable = error?.retryable === true;
  const errorCode = error?.code;
  const friendlyError = error ? (errorCode && errorCopy[errorCode] ? errorCopy[errorCode] : fallbackError) : null;

  return (
    <div className="agent-job-status" role="status" aria-live="polite">
      <div className={`agent-job-indicator ${config.cssClass}`}>
        <span className={`status-dot ${config.cssClass}`} aria-hidden="true" />
        <span className="agent-job-label">{config.label}</span>
      </div>

      <div className="agent-job-details">
        {friendlyError && (
          <p className="agent-job-error" role="alert">
            <span className="agent-job-error-code">{friendlyError.title}</span>
            <span>{friendlyError.message}</span>
          </p>
        )}

        {status === 'QUEUED' && (
          <p className="agent-job-waiting">您的任务已排队，完成后会自动显示结果。</p>
        )}
      </div>

      <div className="agent-job-actions">
        {isRetryable && onRetry && (
          <button type="button" className="agent-job-retry-btn" onClick={onRetry}>
            重试
          </button>
        )}

        {friendlyError?.action && (
          <p className="agent-job-quota-note">{friendlyError.action}</p>
        )}

        {status === 'FAILED' && !isRetryable && (
          <p className="agent-job-no-retry">请返回上一步确认资料是否完整，然后重新运行。</p>
        )}
      </div>
    </div>
  );
}
