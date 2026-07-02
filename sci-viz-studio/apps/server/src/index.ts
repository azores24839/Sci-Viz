import 'dotenv/config';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { DeepSeekGateway, generateAgentDraft, readDeepSeekConfig } from '@studio/ai-workflows';
import { AgentDraftRequestSchema } from '@studio/contracts';
import { createSourceRepository } from './sources/repository.js';
import { createObjectStorage } from './sources/storage.js';
import { SourceProcessor } from './sources/processor.js';
import { registerSourceRoutes } from './sources/routes.js';

const app = Fastify({ logger: true });
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } });

const sourceRepository = createSourceRepository(process.env);
const sourceStorage = createObjectStorage(process.env);
const sourceProcessor = new SourceProcessor(sourceRepository, sourceStorage, process.env, Number(process.env.SOURCE_WORKER_CONCURRENCY ?? 2));
await registerSourceRoutes(app, { repo: sourceRepository, storage: sourceStorage, processor: sourceProcessor });
await sourceProcessor.resume();

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
});

app.get('/api/v1/health', async () => ({
  success: true,
  data: {
    service: 'sci-ai-studio',
    aiProvider: process.env.AI_PROVIDER ?? 'mock',
  },
}));

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

  try {
    const provider = process.env.AI_PROVIDER ?? 'mock';
    const gateway = provider === 'deepseek'
      ? new DeepSeekGateway(readDeepSeekConfig(process.env))
      : null;

    const draft = await generateAgentDraft(gateway, parsed.data);
    return { success: true, data: draft };
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
