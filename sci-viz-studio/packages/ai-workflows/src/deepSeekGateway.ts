import type { ModelGateway } from './modelGateway';

export interface DeepSeekGatewayConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function readDeepSeekConfig(env: Record<string, string | undefined>): DeepSeekGatewayConfig {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  };
}

export class DeepSeekGateway implements ModelGateway {
  constructor(private readonly config: DeepSeekGatewayConfig) {}

  async generateStructured<T>(): Promise<T> {
    void this.config;
    throw new Error('DEEPSEEK_GATEWAY_NOT_ENABLED_IN_MVP');
  }
}
