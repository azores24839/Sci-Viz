import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { AdoptResearchCandidatesRequestSchema, CreateResearchTaskRequestSchema, type ResearchTask, type SourceDocument } from '@studio/contracts';
import type { ResearchRepository } from './repository.js';
import type { ResearchProcessor } from './processor.js';
import type { SourceRepository } from '../sources/repository.js';
import type { SourceProcessor } from '../sources/processor.js';
import { canonicalizeUrl } from '../sources/webFetcher.js';

const now = () => new Date().toISOString();

export async function registerResearchRoutes(app: FastifyInstance, deps: {
  research: ResearchRepository;
  processor: ResearchProcessor;
  sources: SourceRepository;
  sourceProcessor: SourceProcessor;
  ownsProject: (userId: string, projectId: string) => Promise<boolean>;
  maxSources: number;
}) {
  const missing = (reply: FastifyReply) => reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });

  app.get('/api/v1/projects/:projectId/research-tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!await deps.ownsProject(request.authUserId, projectId)) return missing(reply);
    return { success: true, data: await deps.research.list(projectId) };
  });

  app.post('/api/v1/research-tasks', async (request, reply) => {
    const parsed = CreateResearchTaskRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_RESEARCH_REQUEST', message: '请输入至少两个字的研究问题。' } });
    if (!await deps.ownsProject(request.authUserId, parsed.data.projectId)) return missing(reply);
    if (!process.env.TAVILY_API_KEY?.trim()) return reply.code(503).send({ success: false, error: { code: 'RESEARCH_PROVIDER_NOT_CONFIGURED', message: '联网研究尚未配置，请先在服务端设置 TAVILY_API_KEY。' } });
    const stamp = now();
    const task: ResearchTask = { id: randomUUID(), projectId: parsed.data.projectId, ownerUserId: request.authUserId, mode: parsed.data.mode, query: parsed.data.query, status: 'QUEUED', candidates: [], createdAt: stamp, updatedAt: stamp };
    await deps.research.save(task); deps.processor.enqueue(task.id);
    return reply.code(202).send({ success: true, data: task });
  });

  app.post('/api/v1/research-tasks/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string }; const task = await deps.research.get(id);
    if (!task || !await deps.ownsProject(request.authUserId, task.projectId)) return missing(reply);
    if (!process.env.TAVILY_API_KEY?.trim()) return reply.code(503).send({ success: false, error: { code: 'RESEARCH_PROVIDER_NOT_CONFIGURED', message: '联网研究尚未配置。' } });
    const queued: ResearchTask = { ...task, status: 'QUEUED', candidates: [], report: undefined, error: undefined, effectiveQuery: undefined, completedAt: undefined, updatedAt: now() };
    await deps.research.save(queued); deps.processor.enqueue(id);
    return reply.code(202).send({ success: true, data: queued });
  });

  app.post('/api/v1/research-tasks/:id/adopt', async (request, reply) => {
    const parsed = AdoptResearchCandidatesRequestSchema.safeParse(request.body); const { id } = request.params as { id: string }; const task = await deps.research.get(id);
    if (!parsed.success || !task || task.status !== 'COMPLETED' || !await deps.ownsProject(request.authUserId, task.projectId)) return reply.code(404).send({ success: false, error: { code: 'RESEARCH_TASK_NOT_FOUND', message: '研究任务或候选来源不存在。' } });
    const chosen = task.candidates.filter((candidate) => parsed.data.candidateIds.includes(candidate.id));
    if (chosen.length !== parsed.data.candidateIds.length) return reply.code(400).send({ success: false, error: { code: 'INVALID_RESEARCH_CANDIDATES', message: '部分候选来源已失效，请刷新后重试。' } });
    const existing = await deps.sources.list(task.projectId);
    const existingUrls = new Set(existing.map((source) => source.canonicalUrl).filter(Boolean));
    const additions = chosen.filter((candidate) => { try { return !existingUrls.has(canonicalizeUrl(candidate.url)); } catch { return false; } });
    if (existing.length + additions.length > deps.maxSources) return reply.code(429).send({ success: false, error: { code: 'USER_QUOTA_EXCEEDED', message: '采用这些来源会超过资料数量上限。' } });
    const created: SourceDocument[] = [];
    for (const candidate of additions) {
      const stamp = now(); const canonicalUrl = canonicalizeUrl(candidate.url);
      const source: SourceDocument = { id: randomUUID(), projectId: task.projectId, ownerUserId: request.authUserId, kind: 'WEB', status: 'QUEUED', selected: true, title: candidate.title, sourceUrl: candidate.url, canonicalUrl, rawText: candidate.snippet, truncated: false, createdAt: stamp, updatedAt: stamp };
      await deps.sources.save(source); deps.sourceProcessor.enqueue(source.id); created.push(source); existingUrls.add(canonicalUrl);
    }
    return reply.code(201).send({ success: true, data: { created, skippedDuplicateCount: chosen.length - additions.length } });
  });
}
