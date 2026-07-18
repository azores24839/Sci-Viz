import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_DISTRIBUTION_GROUPS,
  calculateSourceDistribution,
  classifySourceDistributionGroup,
  isSourceDistributionGroupKey,
} from '../src/services/sourceDistribution.js';

test('splits domestic and international universities', () => {
  assert.equal(classifySourceDistributionGroup({ category: 'H', sourceType: 'university_news', url: 'https://www.zju.edu.cn/' }), 'domestic_university');
  assert.equal(classifySourceDistributionGroup({ category: 'A', sourceType: 'university_news', url: 'https://news.mit.edu/' }), 'international_university');
});

test('publishes the source groups used by collection and home filters', () => {
  assert.deepEqual(SOURCE_DISTRIBUTION_GROUPS.map(group => group.label), [
    '中国高校', '国外高校', '企业', '科研机构/实验室', '期刊/媒体', '图库/开放资源', '其他',
  ]);
  assert.equal(isSourceDistributionGroupKey('domestic_university'), true);
  assert.equal(isSourceDistributionGroupKey('visualization_company'), false);
});

test('counts each owner once and each media domain once when several endpoints share it', () => {
  const summary = calculateSourceDistribution([
    { category: 'A', sourceType: 'university_news', url: 'https://news.mit.edu/' },
    { category: 'A', sourceType: 'university_research_news', url: 'https://news.mit.edu/research' },
    { category: 'ENT', sourceType: 'enterprise', url: 'https://example.com/' },
  ], [
    { sourceDomain: 'news.mit.edu', count: 80 },
    { sourceDomain: 'www.example.com', count: 20 },
    { sourceDomain: 'unmatched.example', count: 5 },
  ]);

  assert.equal(summary.totalSources, 2);
  assert.equal(summary.totalMedia, 100);
  assert.equal(summary.unmatchedMedia, 5);
  assert.equal(summary.groups.find(group => group.key === 'international_university')?.mediaCount, 80);
  assert.equal(summary.groups.find(group => group.key === 'international_university')?.sourceCount, 1);
  assert.equal(summary.groups.find(group => group.key === 'enterprise')?.mediaCount, 20);
});
