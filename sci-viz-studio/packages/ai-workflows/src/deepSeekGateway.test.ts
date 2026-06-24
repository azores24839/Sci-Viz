import { describe, expect, it } from 'vitest';
import { readDeepSeekConfig } from './deepSeekGateway';

describe('DeepSeek configuration', () => {
  it('fails closed when the server secret is missing', () => {
    expect(() => readDeepSeekConfig({})).toThrow('AI_PROVIDER_NOT_CONFIGURED');
  });

  it('reads a server-only configuration without exposing unrelated values', () => {
    expect(readDeepSeekConfig({ DEEPSEEK_API_KEY: 'secret', DEEPSEEK_MODEL: 'deepseek-chat' })).toEqual({
      apiKey: 'secret',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    });
  });
});
