import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseHubUnavailableError, fetchCaseHubRecommendations } from './client.js';

afterEach(() => vi.unstubAllGlobals());

const result = {
  items: [{ id: 'case-1', title: 'Lab', thumbnailUrl: '/uploads/thumb.jpg', sourceUrl: 'https://example.com/case', sourceDomain: 'example.com', discipline: '工程', functionalPurpose: '展示', distributionMedium: '静图', technicalMethod: '拍摄', contentType: '设备', matchScore: 80, matchLevel: 'EXACT', recommendationReason: '同学科', borrowablePoints: '尺度' }],
  fallbackMessage: '', appliedFilters: { discipline: '工程', teamType: '', goals: ['INDUSTRY_COLLABORATION'], technicalMethods: [], medium: '静图' },
};

describe('fetchCaseHubRecommendations', () => {
  it('authenticates the service request and normalizes relative thumbnails', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: result }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await fetchCaseHubRecommendations({ CASE_HUB_API_URL: 'http://casehub.test/api', CASE_HUB_STUDIO_KEY: 'secret' }, { discipline: '工程', goals: ['INDUSTRY_COLLABORATION'], technicalMethods: [], limit: 6 });
    expect(response.items[0]?.thumbnailUrl).toBe('http://casehub.test/uploads/thumb.jpg');
    expect(fetchMock).toHaveBeenCalledWith('http://casehub.test/api/studio/recommendations', expect.objectContaining({ headers: expect.objectContaining({ 'x-studio-key': 'secret' }) }));
  });

  it('fails closed when the service key is missing', async () => {
    await expect(fetchCaseHubRecommendations({}, { goals: [], technicalMethods: [], limit: 6 })).rejects.toBeInstanceOf(CaseHubUnavailableError);
  });

  it('rejects malformed Case Hub responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { items: 'bad' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(fetchCaseHubRecommendations({ CASE_HUB_STUDIO_KEY: 'secret' }, { goals: [], technicalMethods: [], limit: 6 })).rejects.toThrow('CASE_HUB_INVALID_RESPONSE');
  });
});
