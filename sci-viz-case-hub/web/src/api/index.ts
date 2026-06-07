import type { ApiResponse, VisualCase, CrawlResponse, NetworkTestResponse, CrawlSource, CrawlJob, CollectionKpiProgress, InsightSummary, ComparisonData, ThreeAxisSpectrum } from '../types';

const BASE = '/api';

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  const data = await res.json().catch(() => ({
    success: false,
    error: `HTTP ${res.status}`,
  }));
  if (!res.ok && data.success !== false) {
    return { success: false, error: `HTTP ${res.status}` } as ApiResponse<T>;
  }
  return data;
}

export const api = {
  getCases(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return request<VisualCase[]>(`/cases?${qs}`);
  },

  getFacetCounts(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return request<Record<string, Record<string, number>>>(`/cases/facet-counts?${qs}`);
  },

  getInsightSummary(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString();
    return request<InsightSummary>(`/insights/summary?${qs}`);
  },

  getComparison(school?: string, dimension = 'functionalPurpose') {
    const params: Record<string, string> = { dimension };
    if (school) params.school = school;
    const qs = new URLSearchParams(params).toString();
    return request<ComparisonData>(`/insights/comparison?${qs}`);
  },

  getThreeAxisSpectrum(x = 'functionalPurpose', y = 'technicalMethod', z = 'distributionMedium') {
    const qs = new URLSearchParams({ x, y, z }).toString();
    return request<ThreeAxisSpectrum>(`/insights/three-axis-spectrum?${qs}`);
  },

  getCase(id: string) {
    return request<VisualCase>(`/cases/${id}`);
  },

  updateCase(id: string, data: Partial<VisualCase>) {
    return request<VisualCase>(`/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deleteCase(id: string) {
    return request<void>(`/cases/${id}`, { method: 'DELETE' });
  },

  batchDeleteCases(ids: string[]) {
    return request<{ deleted: number; requested: number }>('/cases/batch/delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  reanalyze(id: string) {
    return request<void>(`/cases/${id}/analyze`, { method: 'POST' });
  },

  crawlUrls(urls: string[], sourceName?: string, sourceType?: string, cookie?: string) {
    return fetch(`${BASE}/crawl/urls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, source_name: sourceName, source_type: sourceType, cookie }),
    }).then(async res => {
      const data = await res.json().catch(() => ({ success: false, summary: null, results: [] }));
      return data as CrawlResponse;
    });
  },

  getPoolSources(category?: string) {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return request<CrawlSource[]>(`/pool/sources${qs}`);
  },

  getPoolSource(id: number) {
    return request<CrawlSource>(`/pool/sources/${id}`);
  },

  createPoolSource(data: Partial<CrawlSource>) {
    return request<CrawlSource>('/pool/sources', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updatePoolSource(id: number, data: Partial<CrawlSource>) {
    return request<CrawlSource>(`/pool/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  deletePoolSource(id: number) {
    return request<void>(`/pool/sources/${id}`, { method: 'DELETE' });
  },

  triggerCrawl(sourceId: number) {
    return request<{ jobId: number }>(`/pool/sources/${sourceId}/crawl`, { method: 'POST' });
  },

  triggerEasyCrawl(options: { dryRun?: boolean; maxSources?: number; maxLinksPerSource?: number; maxPages?: number; concurrency?: number } = {}) {
    return request<Array<{ sourceId: number; sourceName: string; jobId?: number; queued?: boolean; urls?: string[]; error?: string }>>('/pool/crawl/easy', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  getCrawlJob(jobId: number) {
    return request<CrawlJob>(`/pool/jobs/${jobId}`);
  },

  async testNetwork(url?: string): Promise<NetworkTestResponse> {
    const qs = url ? `?url=${encodeURIComponent(url)}` : '';
    const res = await fetch(`${BASE}/crawl/test-network${qs}`);
    return res.json();
  },

  initCollectionKpis() {
    return request<void>('/collection/kpis/init', { method: 'POST' });
  },

  getCollectionKpis() {
    return request<CollectionKpiProgress[]>('/collection/kpis');
  },

  getNeededCollectionKpis(limit = 10) {
    return request<CollectionKpiProgress[]>(`/collection/kpis/needed?limit=${limit}`);
  },

  updateCollectionKpi(id: number, data: Partial<Pick<CollectionKpiProgress, 'targetCount' | 'priority' | 'enabled' | 'notes'>>) {
    return request<CollectionKpiProgress>(`/collection/kpis/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  getQueueStatus() {
    return request<{
      panels: Array<{ key: string; label: string; count: number; description: string }>;
    }>('/processing/queue-status');
  },

  batchOcr(scope?: string, caseIds?: string[]) {
    return request<{ success: boolean; backupPath: string; summary: { total: number; updated: number; skipped: number; failed: number } }>(
      '/processing/ocr',
      { method: 'POST', body: JSON.stringify({ scope, caseIds }) },
    );
  },

  batchQualityCheck(scope?: string, caseIds?: string[]) {
    return request<{ success: boolean; backupPath: string; summary: { total: number; ok: number; broken: number; lowQuality: number } }>(
      '/processing/quality-check',
      { method: 'POST', body: JSON.stringify({ scope, caseIds }) },
    );
  },

  batchClassify(scope?: string, caseIds?: string[]) {
    return request<{ success: boolean; backupPath: string; summary: { total: number; classified: number; skipped: number; failed: number } }>(
      '/processing/classify',
      { method: 'POST', body: JSON.stringify({ scope, caseIds }) },
    );
  },

  batchApprove(statuses?: string[]) {
    return request<{ approved: number }>('/cases/batch/approve', {
      method: 'POST',
      body: JSON.stringify({ statuses: statuses || ['needs_review', 'low_confidence_review'] }),
    });
  },

  checkAuth() {
    return request<{ id: string; username: string }>('/auth/check');
  },

  login(username: string, password: string) {
    return request<{ id: string; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  logout() {
    return request<void>('/auth/logout', { method: 'POST' });
  },
};
