import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCollectionKpiProgress } from '../src/services/collectionKpi.js';

const baseCase = {
  mediaType: '摄影',
  contentType: '实验过程',
  discipline: '医学',
  technicalMethod: '成像',
  functionalPurpose: '解释',
  distributionMedium: '静图',
  rating: 5,
};

test('coverage targets are filled only by approved cases', () => {
  const progress = calculateCollectionKpiProgress([
    {
      id: 1,
      dimension: 'discipline',
      category: '医学',
      targetCount: 2,
      priority: 60,
      enabled: true,
      notes: '',
    },
  ], [
    { ...baseCase, reviewStatus: 'approved' },
    { ...baseCase, reviewStatus: 'needs_review' },
  ]);

  assert.equal(progress[0].currentCount, 2);
  assert.equal(progress[0].approvedCount, 1);
  assert.equal(progress[0].highValueCount, 1);
  assert.equal(progress[0].remainingCount, 1);
  assert.equal(progress[0].isReached, false);
});

test('a high rating is not high-value until the case is approved', () => {
  const progress = calculateCollectionKpiProgress([
    {
      id: 1,
      dimension: 'functionalPurpose',
      category: '解释',
      targetCount: 1,
      priority: 40,
      enabled: true,
      notes: '',
    },
  ], [
    { ...baseCase, reviewStatus: 'needs_review' },
  ]);

  assert.equal(progress[0].highValueCount, 0);
  assert.equal(progress[0].isReached, false);
});
