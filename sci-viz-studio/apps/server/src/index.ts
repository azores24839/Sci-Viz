import 'dotenv/config';
import Fastify from 'fastify';
import { DeepSeekGateway, generateAgentDraft, readDeepSeekConfig } from '@studio/ai-workflows';
import { AgentDraftRequestSchema } from '@studio/contracts';

const app = Fastify({ logger: true });

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;
  reply.header('Access-Control-Allow-Origin', origin ?? '*');
  reply.header('Vary', 'Origin');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (request.method === 'OPTIONS') {
    return reply.code(204).send();
  }
});

app.get('/api/v1/health', async () => ({
  success: true,
  data: {
    service: 'sci-viz-studio',
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
