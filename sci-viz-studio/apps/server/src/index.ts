import 'dotenv/config';
import Fastify from 'fastify';
import crypto from 'node:crypto';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { DeepSeekGateway, generateAgentDraft, parseImagePrompts, readDeepSeekConfig, OpenRouterImageGateway, readOpenRouterImageConfig } from '@studio/ai-workflows';
import { AgentDraftRequestSchema } from '@studio/contracts';
import { createSourceRepository } from './sources/repository.js';
import { createObjectStorage } from './sources/storage.js';
import { SourceProcessor } from './sources/processor.js';
import { registerSourceRoutes } from './sources/routes.js';
import { assertProductionAuth, authenticate, defaultProjectId } from './auth.js';
import { createUsageLimiter } from './usage.js';
import { createWorkspaceRepository } from './workspace/repository.js';
import { registerWorkspaceRoutes } from './workspace/routes.js';
import { createAgentJobRepository } from './jobs/repository.js';
import { AgentJobProcessor } from './jobs/processor.js';
import { registerAgentJobRoutes } from './jobs/routes.js';
import { registerBenchmarkRoutes } from './benchmarks/routes.js';
import { createPlanRepository } from './plans/repository.js';
import { registerPlanRoutes } from './plans/routes.js';
import { createReviewRepository } from './reviews/repository.js';
import { registerReviewRoutes } from './reviews/routes.js';
import { createResearchRepository } from './research/repository.js';
import { ResearchProcessor } from './research/processor.js';
import { registerResearchRoutes } from './research/routes.js';
import { registerProjectIntakeRoutes } from './intake/routes.js';

import { createFeedbackRepository } from './feedback.js';

const app = Fastify({ logger: true });
assertProductionAuth(process.env);
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

const sourceRepository = createSourceRepository(process.env);
const sourceStorage = createObjectStorage(process.env);
const usageLimiter = createUsageLimiter(process.env);
const workspaceRepository = createWorkspaceRepository(process.env);
const agentJobRepository = createAgentJobRepository(process.env);
const planRepository = createPlanRepository(process.env);
const reviewRepository = createReviewRepository(process.env);
const researchRepository = createResearchRepository(process.env);
const sourceProcessor = new SourceProcessor(sourceRepository, sourceStorage, process.env, Number(process.env.SOURCE_WORKER_CONCURRENCY ?? 2), usageLimiter);
const researchProcessor = new ResearchProcessor(researchRepository, process.env, Number(process.env.RESEARCH_WORKER_CONCURRENCY ?? 1), sourceRepository);
const ownsProject = async (userId: string, projectId: string) => projectId === defaultProjectId(userId, process.env) || (await workspaceRepository.getProject(projectId))?.ownerUserId === userId;
const agentJobProcessor = new AgentJobProcessor(agentJobRepository, async (draft) => {
  const provider = process.env.AI_PROVIDER ?? 'mock';
  const gateway = provider === 'deepseek' ? new DeepSeekGateway(readDeepSeekConfig(process.env)) : null;
  let primary = await generateAgentDraft(gateway, draft);
  if (draft.task === 'GENERATE_AI_REFERENCES' && process.env.IMAGE_PROVIDER === 'openrouter') {
    const imageGateway = new OpenRouterImageGateway(readOpenRouterImageConfig(process.env));
    const prompts = parseImagePrompts(primary.body); const images: Array<{ url: string; prompt: string }> = [];
    for (const image of await imageGateway.generateImages(prompts)) {
      const key = `ai-references/${draft.projectId}/${crypto.randomUUID()}.png`;
      await sourceStorage.put(key, Buffer.from(image.base64, 'base64'), 'image/png');
      images.push({ url: await sourceStorage.signedGetUrl(key), prompt: image.prompt });
    }
    if (images.length) primary = { ...primary, images };
  }
  const needsScienceReview = ['DIAGNOSE_VISUAL_STATE', 'GENERATE_CURATION_STRATEGY', 'GENERATE_PHOTO_PLAN', 'COMPILE_FINAL_PLAN'].includes(draft.task);
  if (!needsScienceReview || draft.agentRole === 'SCIENCE_REVIEWER') return primary;
  const review = await generateAgentDraft(gateway, {
    ...draft,
    nodeId: `${draft.nodeId}:science-review`,
    nodeLabel: `${draft.nodeLabel} · 科研审校`,
    agentRole: 'SCIENCE_REVIEWER',
    task: 'REVIEW_SCIENCE_RISKS',
    inputLabel: draft.outputLabel,
    outputLabel: '科研审校意见',
    upstreamArtifacts: [...draft.upstreamArtifacts, { nodeId: draft.nodeId, label: primary.label, body: primary.body }],
  });
  return {
    ...primary,
    body: `${primary.body}\n\n### 科研审校员检查\n${review.body}`,
    blockerCount: Math.max(primary.blockerCount, review.blockerCount),
    evidence: [...primary.evidence, ...review.evidence],
  };
}, Number(process.env.AGENT_WORKER_CONCURRENCY ?? 2));

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5178').split(',').map((value) => value.trim());
  if (origin && allowedOrigins.includes(origin)) reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  if (request.method === 'OPTIONS') {
    return reply.code(204).send();
  }
  if (request.url === '/api/v1/health' || request.url.startsWith('/api/v1/source-objects/') || request.url.startsWith('/api/v1/review/')) return;
  return authenticate(request, reply, process.env);
});

await app.register(rateLimit, {
  global: true,
  max: Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 120),
  timeWindow: '1 minute',
  keyGenerator: (request) => request.authUserId || request.ip,
  errorResponseBuilder: () => ({ success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试。' } }),
});

await registerWorkspaceRoutes(app, workspaceRepository);
await registerProjectIntakeRoutes(app, process.env, (userId) => usageLimiter.consume(userId));
await registerSourceRoutes(app, { repo: sourceRepository, storage: sourceStorage, processor: sourceProcessor, ownsProject, maxStorageBytes: Number(process.env.USER_STORAGE_LIMIT_MB ?? 500) * 1024 * 1024, maxSources: Number(process.env.USER_SOURCE_LIMIT ?? 50) });
await registerAgentJobRoutes(app, { repo: agentJobRepository, processor: agentJobProcessor, ownsProject, dailyLimit: usageLimiter });
await registerBenchmarkRoutes(app, { workspace: workspaceRepository, env: process.env });
await registerPlanRoutes(app, { plans: planRepository, workspace: workspaceRepository });
await registerReviewRoutes(app, { reviews: reviewRepository, plans: planRepository, workspace: workspaceRepository, env: process.env });
await registerResearchRoutes(app, { research: researchRepository, processor: researchProcessor, sources: sourceRepository, sourceProcessor, ownsProject, maxSources: Number(process.env.USER_SOURCE_LIMIT ?? 50) });
await sourceProcessor.resume();
await researchProcessor.resume();
await agentJobProcessor.start();
const feedbackRepository = createFeedbackRepository(process.env);

app.get('/api/v1/health', async () => ({
  success: true,
  data: {
    service: 'sci-ai-studio',
    aiProvider: process.env.AI_PROVIDER ?? 'mock',
  },
}));

app.get('/api/v1/me', async (request) => {
  const projectId = defaultProjectId(request.authUserId, process.env);
  const sources = await sourceRepository.list(projectId);
  const sourceLimit = Number(process.env.USER_SOURCE_LIMIT ?? 50);
  const storageLimitBytes = Number(process.env.USER_STORAGE_LIMIT_MB ?? 500) * 1024 * 1024;
  const storageUsedBytes = sources.reduce((total, source) => total + (source.sizeBytes ?? Buffer.byteLength(source.rawText ?? '', 'utf8')), 0);
  const ai = await usageLimiter.getUsage(request.authUserId);
  return { success: true, data: {
    userId: request.authUserId,
    projectId,
    quota: {
      sources: { used: sources.length, limit: sourceLimit, remaining: Math.max(0, sourceLimit - sources.length) },
      storage: { usedBytes: storageUsedBytes, limitBytes: storageLimitBytes, remainingBytes: Math.max(0, storageLimitBytes - storageUsedBytes) },
      ai,
    },
  } };
});

app.post('/api/v1/feedback', async (request, reply) => {
  const { category, description, context } = request.body as Record<string, unknown>;
  if (!category || !description || typeof category !== 'string' || typeof description !== 'string' || !['BUG', 'SUGGESTION', 'INACCURATE', 'OTHER'].includes(category)) {
    return reply.code(400).send({ success: false, error: { code: 'INVALID_FEEDBACK', message: '请填写反馈类型和描述。' } });
  }
  const entry = {
    id: crypto.randomUUID(),
    userId: request.authUserId,
    category: category as 'BUG' | 'SUGGESTION' | 'INACCURATE' | 'OTHER',
    description: description.trim().slice(0, 2000),
    context: typeof context === 'string' ? context.slice(0, 1000) : '',
    createdAt: new Date().toISOString(),
  };
  await feedbackRepository.add(entry);
  return reply.code(201).send({ success: true, data: { id: entry.id } });
});

app.get('/api/v1/config/ai', async () => {
  const provider = process.env.AI_PROVIDER ?? 'mock';
  if (provider !== 'deepseek') return { success: true, data: { provider: 'mock', configured: true } };
  readDeepSeekConfig(process.env);
  return { success: true, data: { provider: 'deepseek', configured: true } };
});

app.post('/api/v1/agent-drafts', async (request, reply) => {
  const parsed = AgentDraftRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      success: false,
      error: { code: 'INVALID_AGENT_DRAFT_REQUEST', message: 'Agent draft request is invalid.' },
    });
  }
  if (!await ownsProject(request.authUserId, parsed.data.projectId)) return reply.code(404).send({ success: false, error: { code: 'PROJECT_NOT_FOUND', message: '项目不存在。' } });
  try { await usageLimiter.consume(request.authUserId); } catch { return reply.code(429).send({ success: false, error: { code: 'USER_QUOTA_EXCEEDED', message: '今天的 AI 使用额度已用完。' } }); }

  try {
    const provider = process.env.AI_PROVIDER ?? 'mock';
    const gateway = provider === 'deepseek'
      ? new DeepSeekGateway(readDeepSeekConfig(process.env))
      : null;

    const draft = await generateAgentDraft(gateway, parsed.data);

    let images: Array<{ url: string; prompt: string }> | undefined;
    if (parsed.data.task === 'GENERATE_AI_REFERENCES' && process.env.IMAGE_PROVIDER === 'openrouter') {
      try {
        const imageConfig = readOpenRouterImageConfig(process.env);
        const imageGateway = new OpenRouterImageGateway(imageConfig);
        const prompts = parseImagePrompts(draft.body);
        if (prompts.length > 0) {
          const generated = await imageGateway.generateImages(prompts);
          const stored: Array<{ url: string; prompt: string }> = [];
          for (const img of generated) {
            const id = crypto.randomUUID();
            const key = `ai-references/${parsed.data.projectId}/${id}.png`;
            const body = Buffer.from(img.base64, 'base64');
            await sourceStorage.put(key, body, 'image/png');
            const url = await sourceStorage.signedGetUrl(key);
            stored.push({ url, prompt: img.prompt });
          }
          if (stored.length > 0) images = stored;
        }
      } catch (error) {
        request.log.error({ error }, 'AI reference image generation failed');
      }
    }

    return { success: true, data: { ...draft, images } };
  } catch (error) {
    request.log.error({ error }, 'Agent draft generation failed');
    return reply.code(502).send({
      success: false,
      error: {
        code: 'AGENT_DRAFT_GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Agent draft generation failed.',
      },
    });
  }
});

const port = Number(process.env.PORT ?? 3011);
await app.listen({ host: '127.0.0.1', port });
