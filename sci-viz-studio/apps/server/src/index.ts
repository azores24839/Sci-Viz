import 'dotenv/config';
import Fastify from 'fastify';
import { readDeepSeekConfig } from '@studio/ai-workflows';

const app = Fastify({ logger: true });

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

const port = Number(process.env.PORT ?? 3011);
await app.listen({ host: '127.0.0.1', port });
