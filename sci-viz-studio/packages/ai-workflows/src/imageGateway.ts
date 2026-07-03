export interface ImageGenerationGateway {
  generateImages(prompts: string[]): Promise<Array<{ prompt: string; base64: string }>>;
}

export interface OpenRouterImageConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

type FetchLike = typeof fetch;

export function readOpenRouterImageConfig(env: Record<string, string | undefined>): OpenRouterImageConfig {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('IMAGE_PROVIDER_NOT_CONFIGURED');
  return {
    apiKey,
    baseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: env.IMAGE_MODEL ?? 'google/gemini-3.1-flash-lite-image',
  };
}

export class OpenRouterImageGateway implements ImageGenerationGateway {
  constructor(
    private readonly config: OpenRouterImageConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async generateImages(prompts: string[]): Promise<Array<{ prompt: string; base64: string }>> {
    const results: Array<{ prompt: string; base64: string }> = [];
    for (const prompt of prompts) {
      const response = await this.fetcher(`${this.config.baseUrl.replace(/\/$/, '')}/images`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: this.config.model, prompt }),
      });

      if (!response.ok) {
        throw new Error(`IMAGE_GENERATION_FAILED:${response.status}`);
      }

      const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
      for (const image of payload.data ?? []) {
        if (image.b64_json) {
          results.push({ prompt, base64: image.b64_json });
        }
      }
    }
    return results;
  }
}
