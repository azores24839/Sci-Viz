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

const errorCodeLabel: Record<string, string> = {
  MODEL_RATE_LIMITED: '模型服务繁忙',
  MODEL_UNAVAILABLE: '模型服务暂时不可用',
  MODEL_TIMEOUT: '模型处理超时',
  USER_QUOTA_EXCEEDED: '今日额度已用完',
  AGENT_JOB_FAILED: '任务执行失败',
  INVALID_AGENT_JOB: '任务参数无效',
  AGENT_OUTPUT_INVALID: 'AI 返回内容不完整',
};

export function AgentJobStatus({ job, status, onRetry, sourceCount, revision, planLabel }: AgentJobStatusProps) {
  const config = (statusConfig[status] ?? statusConfig.FAILED)!;
  const error = job?.error;
  const isRetryable = error?.retryable === true;
  const errorCode = error?.code;
  const errorMessage = errorCode && errorCodeLabel[errorCode]
    ? `${errorCodeLabel[errorCode]}：${error.message}`
    : error?.message;

  return (
    <div className="agent-job-status" role="status" aria-live="polite">
      <div className={`agent-job-indicator ${config.cssClass}`}>
        <span className={`status-dot ${config.cssClass}`} aria-hidden="true" />
        <span className="agent-job-label">{config.label}</span>
      </div>

      <div className="agent-job-details">
        {job?.startedAt && (
          <span className="agent-job-detail">
            开始时间：{new Date(job.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        {job && job.attempt > 0 && (
          <span className="agent-job-detail">
            第 {job.attempt}/{job.maxAttempts} 次尝试
          </span>
        )}

        {sourceCount !== undefined && sourceCount > 0 && (
          <span className="agent-job-detail">使用 {sourceCount} 份资料</span>
        )}

        {revision !== undefined && (
          <span className="agent-job-detail">
            {planLabel ? `${planLabel} / ` : ''}v{revision}
          </span>
        )}

        {errorMessage && (
          <p className="agent-job-error" role="alert">
            <span className="agent-job-error-code">{errorCode || 'ERROR'}</span>
            <span>{errorMessage}</span>
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

        {errorCode === 'USER_QUOTA_EXCEEDED' && (
          <p className="agent-job-quota-note">每日额度将在次日 00:00 重置。</p>
        )}

        {status === 'FAILED' && !isRetryable && (
          <p className="agent-job-no-retry">此错误无法通过重试解决，请检查输入内容后重新运行。</p>
        )}
      </div>
    </div>
  );
}
