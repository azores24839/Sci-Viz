import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchTavily } from './tavily.js';

afterEach(() => vi.unstubAllGlobals());

describe('searchTavily', () => {
  it('fails clearly when the provider is not configured', async () => {
    await expect(searchTavily({}, '深海机器人', 'FAST')).rejects.toThrow('RESEARCH_PROVIDER_NOT_CONFIGURED');
  });

  it('maps fast search results into traceable candidates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: '海洋实验室研究项目', url: 'https://example.edu/lab/project', content: '介绍深海机器人研究。', score: 0.91 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchTavily({ TAVILY_API_KEY: 'test-key' }, '深海机器人', 'FAST');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ domain: 'example.edu', sourceType: 'INSTITUTION', score: 0.91 });
    expect(result.report).toBeUndefined();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: 'Bearer test-key' });
    expect(JSON.parse(String(request.body))).toMatchObject({ search_depth: 'basic', max_results: 8, include_answer: false });
  });

  it('creates a deep research report without treating it as confirmed project fact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: '多个公开来源显示该团队研究水下机器人。',
      results: [{ title: '公开项目页', url: 'https://institute.org/project', content: '项目公开介绍。', score: 0.8 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const result = await searchTavily({ TAVILY_API_KEY: 'test-key' }, '水下机器人项目', 'DEEP');
    expect(result.report?.summary).toContain('公开来源');
    expect(result.report?.limitations[0]).toContain('需要用户核对');
    expect(result.candidates).toHaveLength(1);
  });
});
