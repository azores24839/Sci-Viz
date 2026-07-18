import { isUsefulInsightLabel, normalizeInsightLabel, roundInsightPercent } from './insightValue.js';

export type SpectrumDimKey = 'functionalPurpose' | 'mediaType' | 'discipline' | 'distributionMedium' | 'technicalMethod' | 'contentType';

export type SpectrumCase = Record<SpectrumDimKey, string>;

const SPECTRUM_DIMS: SpectrumDimKey[] = ['functionalPurpose', 'mediaType', 'discipline', 'distributionMedium', 'technicalMethod', 'contentType'];
const DIMENSION_LABELS: Record<SpectrumDimKey, string> = {
  functionalPurpose: '功能用途',
  distributionMedium: '传播媒介',
  mediaType: '呈现方式',
  discipline: '学科',
  technicalMethod: '技术手段',
  contentType: '内容类型',
};

export function resolveSpectrumDimensions(requested: string[]): SpectrumDimKey[] {
  return requested.map(dimension => SPECTRUM_DIMS.includes(dimension as SpectrumDimKey)
    ? dimension as SpectrumDimKey
    : 'functionalPurpose');
}

export function buildThreeAxisSpectrum(cases: SpectrumCase[], requestedDimensions: string[]) {
  const dimensions = resolveSpectrumDimensions(requestedDimensions);
  if (dimensions.length !== 3) throw new Error('Three spectrum dimensions are required');

  const useful = cases.filter(item => dimensions.every(dimension =>
    isUsefulInsightLabel(normalizeInsightLabel(String(item[dimension] ?? '')))
  ));
  const cellMap = new Map<string, number>();
  const axisSets = [new Set<string>(), new Set<string>(), new Set<string>()];

  for (const item of useful) {
    const values = dimensions.map(dimension => normalizeInsightLabel(String(item[dimension] ?? '')));
    values.forEach((value, index) => axisSets[index].add(value));
    const key = values.join('||');
    cellMap.set(key, (cellMap.get(key) || 0) + 1);
  }

  const total = useful.length;
  const cells = [...cellMap.entries()].map(([key, count]) => {
    const [x, y, z] = key.split('||');
    return { x, y, z, count, percentage: roundInsightPercent(count, total) };
  });
  const axisNames = ['x', 'y', 'z'] as const;
  const sortByTotal = (values: string[], axis: typeof axisNames[number]) => [...values].sort((a, b) => {
    const sum = (value: string) => cells.filter(cell => cell[axis] === value).reduce((result, cell) => result + cell.count, 0);
    return sum(b) - sum(a);
  });

  const staticCount = useful.reduce((count, item) =>
    count + (normalizeInsightLabel(String(item.distributionMedium ?? '')) === '静图' ? 1 : 0), 0);
  const dynamicCount = total - staticCount;
  const note = dynamicCount < 5
    ? `当前数据库${total}条有效案例中，${staticCount}条（${roundInsightPercent(staticCount, total)}%）传播媒介为"静图"，视频/动图/交互类案例仅${dynamicCount}条。三轴频谱主要反映静态图像的分布格局，建议通过公众号/视频平台采集补充多媒体案例后再做完整对比。`
    : '';

  return {
    dimensions: dimensions.map((axis, index) => ({
      axis,
      label: DIMENSION_LABELS[axis],
      values: sortByTotal([...axisSets[index]], axisNames[index]),
    })),
    cells,
    total,
    note,
  };
}
