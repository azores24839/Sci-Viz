import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThreeAxisSpectrum, type SpectrumCase } from '../src/services/threeAxisSpectrum.js';

const makeCase = (overrides: Partial<SpectrumCase> = {}): SpectrumCase => ({
  functionalPurpose: '解释', mediaType: '信息图', discipline: '工程',
  distributionMedium: '静图', technicalMethod: '绘设', contentType: '机制模型',
  ...overrides,
});

test('three-axis spectrum preserves filtering, aggregation, ordering, and percentages', () => {
  const result = buildThreeAxisSpectrum([
    makeCase(), makeCase(),
    makeCase({ functionalPurpose: '数据', technicalMethod: '数据' }),
    makeCase({ functionalPurpose: '不确定' }),
    makeCase({ technicalMethod: '  ' }),
  ], ['functionalPurpose', 'technicalMethod', 'distributionMedium']);

  assert.equal(result.total, 3);
  assert.deepEqual(result.dimensions[0].values, ['解释', '数据']);
  assert.deepEqual(result.cells, [
    { x: '解释', y: '绘设', z: '静图', count: 2, percentage: 66.7 },
    { x: '数据', y: '数据', z: '静图', count: 1, percentage: 33.3 },
  ]);
  assert.match(result.note, /3条有效案例中，3条（100%）/);
});

test('invalid dimensions fall back independently and empty datasets keep the existing note', () => {
  const result = buildThreeAxisSpectrum([], ['bad', 'discipline', 'contentType']);
  assert.deepEqual(result.dimensions.map(item => item.axis), ['functionalPurpose', 'discipline', 'contentType']);
  assert.equal(result.total, 0);
  assert.deepEqual(result.cells, []);
  assert.match(result.note, /0条有效案例中，0条（0%）/);
});

test('dynamic media clears the low-diversity note at five cases', () => {
  const result = buildThreeAxisSpectrum(Array.from({ length: 5 }, (_, index) =>
    makeCase({ distributionMedium: index % 2 ? '视频' : '动图' })
  ), ['functionalPurpose', 'technicalMethod', 'distributionMedium']);
  assert.equal(result.note, '');
});
