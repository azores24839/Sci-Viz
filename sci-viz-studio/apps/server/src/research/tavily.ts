import { randomUUID } from 'node:crypto';
import type { ResearchCandidate, ResearchMode, ResearchReport } from '@studio/contracts';
import { TAVILY_QUERY_LIMIT, TAVILY_RETRY_QUERY_LIMIT, truncateResearchQuery } from './researchQuery.js';

type TavilyResult = { title?: string; url?: string; content?: string; score?: number; published_date?: string };
type TavilyResponse = { answer?: string; results?: TavilyResult[] };

function sourceType(url: string, title: string): ResearchCandidate['sourceType'] {
  const value = `${url} ${title}`.toLowerCase();
  if (/doi\.org|arxiv\.org|pubmed|nature\.com\/articles|science\.org\/doi|journal|论文|paper/.test(value)) return 'PAPER';
  if (/\.edu\b|\.ac\.|academy|university|institute|laboratory|lab\b|研究院|大学|实验室/.test(value)) return 'INSTITUTION';
  if (/news|press|媒体|新闻/.test(value)) return 'NEWS';
  if (/\.gov\b|\.gov\.|official|官网/.test(value)) return 'OFFICIAL';
  return 'OTHER';
}

function reportFrom(response: TavilyResponse, candidates: ResearchCandidate[]): ResearchReport {
  const snippets = candidates.map((item) => `${item.title}：${item.snippet}`).filter(Boolean);
  return {
    summary: response.answer?.trim() || '已完成公开网络检索。请结合下列来源核对项目背景与事实。',
    keyFindings: snippets.slice(0, 8),
    conflicts: [],
    openQuestions: ['哪些公开信息与当前项目实际情况一致？', '哪些设备、人物、场地与成果允许公开？'],
    limitations: ['网络资料可能过期或脱离项目现场语境，采用前需要用户核对。'],
  };
}

export async function searchTavily(env: NodeJS.ProcessEnv, query: string, mode: ResearchMode) {
  const key = env.TAVILY_API_KEY?.trim();
  if (!key) throw new Error('RESEARCH_PROVIDER_NOT_CONFIGURED:联网研究尚未配置 Tavily API Key。');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), mode === 'DEEP' ? 90_000 : 30_000);
  try {
    const endpoint = env.TAVILY_API_URL?.trim() || 'https://api.tavily.com/search';
    const request = (effectiveQuery: string) => fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: effectiveQuery,
        search_depth: mode === 'DEEP' ? 'advanced' : 'basic',
        max_results: mode === 'DEEP' ? 12 : 8,
        include_answer: mode === 'DEEP' ? 'advanced' : false,
        include_raw_content: false,
        include_favicon: false,
        topic: 'general',
      }),
      signal: controller.signal,
    });

    let effectiveQuery = truncateResearchQuery(query, TAVILY_QUERY_LIMIT);
    let response = await request(effectiveQuery);
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      const queryTooLong = response.status === 400
        && /(?:query|search|string).{0,80}(?:length|long|max|character|400)|(?:length|long|max|character|400).{0,80}(?:query|search|string)/i.test(message);
      if (queryTooLong && effectiveQuery.length > TAVILY_RETRY_QUERY_LIMIT) {
        effectiveQuery = truncateResearchQuery(effectiveQuery, TAVILY_RETRY_QUERY_LIMIT);
        response = await request(effectiveQuery);
      }
      if (!response.ok) {
        const retryMessage = response.bodyUsed ? '' : await response.text().catch(() => '');
        const detail = retryMessage || message;
        throw new Error(`RESEARCH_PROVIDER_ERROR:Tavily 请求失败（${response.status}）${detail ? `：${detail.slice(0, 200)}` : ''}`);
      }
    }
    const payload = await response.json() as TavilyResponse;
    const candidates = (payload.results ?? []).flatMap((item): ResearchCandidate[] => {
      if (!item.title || !item.url) return [];
      try {
        const url = new URL(item.url);
        return [{ id: randomUUID(), title: item.title.trim().slice(0, 500), url: url.toString(), domain: url.hostname.replace(/^www\./, ''), snippet: (item.content ?? '').trim().slice(0, 6000), score: Math.max(0, Math.min(1, Number(item.score ?? 0))), sourceType: sourceType(url.toString(), item.title), ...(item.published_date ? { publishedAt: item.published_date } : {}) }];
      } catch { return []; }
    });
    return { effectiveQuery, candidates, ...(mode === 'DEEP' ? { report: reportFrom(payload, candidates) } : {}) };
  } finally { clearTimeout(timer); }
}
