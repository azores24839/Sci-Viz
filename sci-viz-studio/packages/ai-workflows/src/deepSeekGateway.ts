import type { ModelGateway } from './modelGateway';

export interface DeepSeekGatewayConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

type FetchLike = typeof fetch;

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
  constructor(
    private readonly config: DeepSeekGatewayConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async generateText(args: {
    systemPrompt: string;
    userPrompt: string;
    context: { projectId: string; promptVersion: string };
  }): Promise<string> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: args.systemPrompt },
          { role: 'user', content: args.userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`DEEPSEEK_REQUEST_FAILED:${response.status}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('DEEPSEEK_EMPTY_RESPONSE');
    }
    return content.trim();
  }

  async generateStructured<T>(): Promise<T> {
    throw new Error('DEEPSEEK_STRUCTURED_OUTPUT_NOT_ENABLED');
  }
}
