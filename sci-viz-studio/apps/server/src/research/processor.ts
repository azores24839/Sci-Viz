import type { ResearchTask } from '@studio/contracts';
import type { ResearchRepository } from './repository.js';
import type { SourceRepository } from '../sources/repository.js';
import { searchTavily } from './tavily.js';
import { buildResearchQuery } from './researchQuery.js';

export function classifyResearchError(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  if (raw.startsWith('RESEARCH_PROVIDER_NOT_CONFIGURED')) return { code: 'RESEARCH_PROVIDER_NOT_CONFIGURED', message: '联网研究尚未配置，请联系管理员。', retryable: false };
  if (/\b429\b|rate limit/i.test(raw)) return { code: 'RESEARCH_RATE_LIMITED', message: '联网研究服务当前使用人数较多，请稍后重试。', retryable: true };
  if (/abort|timeout/i.test(raw)) return { code: 'RESEARCH_TIMEOUT', message: '这次联网研究等待时间较长，请重新尝试。', retryable: true };
  if (/RESEARCH_PROVIDER_ERROR/i.test(raw)) return { code: 'RESEARCH_SERVICE_UNAVAILABLE', message: '联网研究服务暂时未能完成请求，项目资料已保留，可稍后重试。', retryable: true };
  return { code: 'RESEARCH_FAILED', message: '联网研究暂时未能完成，项目资料已保留，可稍后重试。', retryable: true };
}

export class ResearchProcessor {
  private running = 0;
  private pending: string[] = [];
  private scheduled = new Set<string>();
  constructor(private repo: ResearchRepository, private env: NodeJS.ProcessEnv, private concurrency = 1, private sources?: SourceRepository) {}
  async resume() { for (const task of await this.repo.listPending()) this.enqueue(task.id); }
  enqueue(id: string) { if (this.scheduled.has(id)) return; this.scheduled.add(id); this.pending.push(id); this.pump(); }
  private pump() { while (this.running < this.concurrency && this.pending.length) { const id = this.pending.shift()!; this.running += 1; void this.process(id).finally(() => { this.running -= 1; this.scheduled.delete(id); this.pump(); }); } }
  private async process(id: string) {
    const task = await this.repo.get(id); if (!task) return;
    let running: ResearchTask = { ...task, status: 'RUNNING', error: undefined, updatedAt: new Date().toISOString() };
    await this.repo.save(running);
    try {
      const query = await this.enrichQueryFromProjectSources(task.projectId, task.query);
      running = { ...running, effectiveQuery: query, updatedAt: new Date().toISOString() };
      await this.repo.save(running);
      const result = await searchTavily(this.env, query, task.mode);
      const stamp = new Date().toISOString();
      await this.repo.save({ ...running, effectiveQuery: result.effectiveQuery, status: 'COMPLETED', provider: 'tavily', candidates: result.candidates, ...(result.report ? { report: result.report } : {}), updatedAt: stamp, completedAt: stamp });
    } catch (error) {
      await this.repo.save({ ...running, status: 'FAILED', error: classifyResearchError(error), updatedAt: new Date().toISOString() });
    }
  }

  private async enrichQueryFromProjectSources(projectId: string, baseQuery: string) {
    if (!this.sources) return buildResearchQuery(baseQuery);
    let projectSources = await this.sources.list(projectId);
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline && projectSources.some((source) => ['UPLOADING', 'QUEUED', 'PARSING', 'SUMMARIZING'].includes(source.status))) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      projectSources = await this.sources.list(projectId);
    }
    return buildResearchQuery(baseQuery, projectSources);
  }
}
