import { AgentDraftResponseSchema, type AgentDraftRequest, type AgentDraftResponse, type AgentJob } from '@studio/contracts';
import type { AgentJobRepository } from './repository.js';

export type AgentJobHandler = (request: AgentDraftRequest) => Promise<AgentDraftResponse>;

export function classifyAgentJobError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Agent task failed';
  const status = message.match(/\b(429|5\d\d)\b/)?.[1];
  if (status === '429') return { code: 'MODEL_RATE_LIMITED', message: '模型服务繁忙，任务将自动重试。', retryable: true };
  if (status?.startsWith('5')) return { code: 'MODEL_UNAVAILABLE', message: '模型服务暂时不可用，任务将自动重试。', retryable: true };
  if (/timeout|aborted/i.test(message)) return { code: 'MODEL_TIMEOUT', message: '模型处理超时，任务将自动重试。', retryable: true };
  if (/AGENT_OUTPUT_INVALID|Unexpected token|not valid JSON|JSON at position|JSON input/i.test(message)) return { code: 'AGENT_OUTPUT_INVALID', message: '这次生成的内容格式不完整，系统会重新尝试。', retryable: true };
  return { code: 'AGENT_JOB_FAILED', message: '这次没有生成可用结果，请稍后重新运行。', retryable: true };
}

export class AgentJobProcessor {
  private active = 0;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  constructor(private repo: AgentJobRepository, private handler: AgentJobHandler, private concurrency = 2) {}

  async start() {
    await this.repo.recoverInterrupted();
    this.timer = setInterval(() => this.wake(), 1500);
    this.timer.unref(); this.wake();
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); }
  wake() { if (this.stopped) return; while (this.active < this.concurrency) { this.active += 1; void this.runOne().finally(() => { this.active -= 1; }); } }

  private async runOne() {
    const job = await this.repo.claimNext();
    if (!job) return;
    try {
      const rawResult = await this.handler(job.request); const parsed = AgentDraftResponseSchema.safeParse(rawResult);
      if (!parsed.success) throw new Error('AGENT_OUTPUT_INVALID');
      const stamp = new Date().toISOString();
      await this.repo.save({ ...job, status: 'COMPLETED', result: parsed.data, error: undefined, completedAt: stamp, updatedAt: stamp });
    } catch (cause) {
      const error = classifyAgentJobError(cause); const stamp = new Date(); const retry = error.retryable && job.attempt < job.maxAttempts;
      const failed: AgentJob = retry
        ? { ...job, status: 'QUEUED', error, availableAt: new Date(stamp.getTime() + Math.min(30_000, 1000 * 2 ** job.attempt)).toISOString(), updatedAt: stamp.toISOString() }
        : { ...job, status: 'FAILED', error, completedAt: stamp.toISOString(), updatedAt: stamp.toISOString() };
      await this.repo.save(failed);
    }
  }
}
