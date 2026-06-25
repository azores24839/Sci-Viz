import { describe, expect, it } from 'vitest';
import { DeepSeekGateway, readDeepSeekConfig } from './deepSeekGateway';

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

  it('calls the chat completions endpoint without exposing the key in the response', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const gateway = new DeepSeekGateway({
      apiKey: 'secret-key',
      baseUrl: 'https://api.deepseek.test',
      model: 'deepseek-chat',
    }, (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        choices: [{ message: { content: '  草案内容  ' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch);

    await expect(gateway.generateText({
      systemPrompt: '系统提示词',
      userPrompt: '用户输入',
      context: { projectId: 'demo', promptVersion: 'v1' },
    })).resolves.toBe('草案内容');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.deepseek.test/chat/completions');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer secret-key' });
  });

  it('fails with a sanitized DeepSeek status error', async () => {
    const gateway = new DeepSeekGateway({
      apiKey: 'secret-key',
      baseUrl: 'https://api.deepseek.test',
      model: 'deepseek-chat',
    }, (async () => new Response('bad key', { status: 401 })) as typeof fetch);

    await expect(gateway.generateText({
      systemPrompt: '系统提示词',
      userPrompt: '用户输入',
      context: { projectId: 'demo', promptVersion: 'v1' },
    })).rejects.toThrow('DEEPSEEK_REQUEST_FAILED:401');
  });
});
