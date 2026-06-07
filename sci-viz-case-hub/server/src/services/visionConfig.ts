export const DEFAULT_VISION_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const DEFAULT_VISION_MODEL = 'qwen/qwen2.5-vl-72b-instruct';

export function getVisionConfig() {
  return {
    url: process.env.VISION_API_URL || DEFAULT_VISION_API_URL,
    key: process.env.OPENROUTER_API_KEY || process.env.VISION_API_KEY || '',
    model: process.env.VISION_MODEL || DEFAULT_VISION_MODEL,
    ocrModel: process.env.OCR_VISION_MODEL || process.env.VISION_MODEL || DEFAULT_VISION_MODEL,
    provider: process.env.VISION_PROVIDER || 'openrouter',
  };
}

export function getVisionHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (process.env.OPENROUTER_SITE_URL) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
  }

  return headers;
}
