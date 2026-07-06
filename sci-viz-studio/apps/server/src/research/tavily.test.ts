import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchTavily } from './tavily.js';
import { classifyResearchError } from './processor.js';
import { TAVILY_QUERY_LIMIT, TAVILY_RETRY_QUERY_LIMIT } from './researchQuery.js';

afterEach(() => vi.unstubAllGlobals());

describe('searchTavily', () => {
  it('does not expose provider responses to users', () => {
    expect(classifyResearchError(new Error('RESEARCH_PROVIDER_ERROR:secret upstream payload'))).toEqual({ code: 'RESEARCH_SERVICE_UNAVAILABLE', message: '联网研究服务暂时未能完成请求，项目资料已保留，可稍后重试。', retryable: true });
  });
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('limits oversized queries at the provider boundary even without project context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchTavily({ TAVILY_API_KEY: 'test-key' }, '深海机器人'.repeat(200), 'FAST');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { query: string };
    expect(body.query.length).toBeLessThanOrEqual(TAVILY_QUERY_LIMIT);
    expect(result.effectiveQuery).toBe(body.query);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once with a shorter query only when Tavily reports query length', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"detail":"query string should have at most 400 characters"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchTavily({ TAVILY_API_KEY: 'test-key' }, '科研影像拍摄策略'.repeat(80), 'DEEP');
    const retryRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const retryBody = JSON.parse(String(retryRequest.body)) as { query: string };
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryBody.query.length).toBeLessThanOrEqual(TAVILY_RETRY_QUERY_LIMIT);
    expect(result.effectiveQuery).toBe(retryBody.query);
  });

  it('does not retry unrelated bad requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"detail":"invalid topic parameter"}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchTavily({ TAVILY_API_KEY: 'test-key' }, '深海机器人', 'FAST')).rejects.toThrow('RESEARCH_PROVIDER_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a query-length failure more than once', async () => {
    const failure = () => new Response('{"detail":"query string exceeds max character length"}', { status: 400 });
    const fetchMock = vi.fn().mockImplementation(async () => failure());
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchTavily({ TAVILY_API_KEY: 'test-key' }, '科研项目'.repeat(200), 'FAST')).rejects.toThrow('RESEARCH_PROVIDER_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
