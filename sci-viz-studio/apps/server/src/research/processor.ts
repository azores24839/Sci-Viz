import type { ResearchTask } from '@studio/contracts';
import type { ResearchRepository } from './repository.js';
import { searchTavily } from './tavily.js';

export class ResearchProcessor {
  private running = 0;
  private pending: string[] = [];
  private scheduled = new Set<string>();
  constructor(private repo: ResearchRepository, private env: NodeJS.ProcessEnv, private concurrency = 1) {}
  async resume() { for (const task of await this.repo.listPending()) this.enqueue(task.id); }
  enqueue(id: string) { if (this.scheduled.has(id)) return; this.scheduled.add(id); this.pending.push(id); this.pump(); }
  private pump() { while (this.running < this.concurrency && this.pending.length) { const id = this.pending.shift()!; this.running += 1; void this.process(id).finally(() => { this.running -= 1; this.scheduled.delete(id); this.pump(); }); } }
  private async process(id: string) {
    const task = await this.repo.get(id); if (!task) return;
    const running: ResearchTask = { ...task, status: 'RUNNING', error: undefined, updatedAt: new Date().toISOString() };
    await this.repo.save(running);
    try {
      const result = await searchTavily(this.env, task.query, task.mode);
      const stamp = new Date().toISOString();
      await this.repo.save({ ...running, status: 'COMPLETED', provider: 'tavily', candidates: result.candidates, ...(result.report ? { report: result.report } : {}), updatedAt: stamp, completedAt: stamp });
    } catch (error) {
      const raw = error instanceof Error ? error.message : '联网研究失败';
      const [code, ...rest] = raw.split(':');
      await this.repo.save({ ...running, status: 'FAILED', error: { code: code || 'RESEARCH_FAILED', message: rest.join(':') || raw, retryable: code !== 'RESEARCH_PROVIDER_NOT_CONFIGURED' }, updatedAt: new Date().toISOString() });
    }
  }
}
