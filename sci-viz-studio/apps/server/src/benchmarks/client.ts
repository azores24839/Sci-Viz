import { BenchmarkRecommendationResultSchema, type BenchmarkRecommendationRequest, type BenchmarkRecommendationResult } from '@studio/contracts';

export class CaseHubUnavailableError extends Error { constructor(message = 'Case Hub is unavailable') { super(message); } }

export async function fetchCaseHubRecommendations(env: NodeJS.ProcessEnv, input: BenchmarkRecommendationRequest): Promise<BenchmarkRecommendationResult> {
  const serviceKey = env.CASE_HUB_STUDIO_KEY;
  if (!serviceKey) throw new CaseHubUnavailableError('CASE_HUB_STUDIO_KEY is not configured');
  const baseUrl = (env.CASE_HUB_API_URL ?? 'http://127.0.0.1:3001/api').replace(/\/$/, '');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}/studio/recommendations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-studio-key': serviceKey }, body: JSON.stringify(input), signal: controller.signal });
    if (!response.ok) throw new CaseHubUnavailableError(`CASE_HUB_${response.status}`);
    const payload = await response.json() as { success?: boolean; data?: unknown };
    const parsed = BenchmarkRecommendationResultSchema.safeParse(payload.data);
    if (!payload.success || !parsed.success) throw new CaseHubUnavailableError('CASE_HUB_INVALID_RESPONSE');
    const publicBase = new URL(baseUrl).origin;
    return { ...parsed.data, items: parsed.data.items.map((item) => ({ ...item, thumbnailUrl: item.thumbnailUrl && !/^https?:\/\//.test(item.thumbnailUrl) ? new URL(item.thumbnailUrl, publicBase).toString() : item.thumbnailUrl })) };
  } catch (error) {
    if (error instanceof CaseHubUnavailableError) throw error;
    throw new CaseHubUnavailableError(error instanceof Error ? error.message : 'Case Hub request failed');
  } finally { clearTimeout(timer); }
}
