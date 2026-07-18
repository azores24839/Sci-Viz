export const UNKNOWN_INSIGHT_LABEL = '未标注';

export function normalizeInsightLabel(value: string): string {
  return value.trim() || UNKNOWN_INSIGHT_LABEL;
}

export function isUsefulInsightLabel(label: string): boolean {
  return label !== UNKNOWN_INSIGHT_LABEL && label !== '不确定';
}

export function roundInsightPercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}
