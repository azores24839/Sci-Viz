import type { SourceDocument } from '@studio/contracts';

const readyStatuses = new Set<SourceDocument['status']>(['READY', 'READY_WITHOUT_SUMMARY']);

export function usableSelectedSources(sources: SourceDocument[]) {
  return sources.filter((source) => source.selected
    && readyStatuses.has(source.status)
    && (source.kind !== 'IMAGE' || Boolean(source.ocrText || source.imageDescription)));
}

export function formatSourceSummary(selected: SourceDocument[]): string {
  if (selected.length === 0) return '请添加并选择至少一份已解析资料';
  const names = selected.map((source) => source.title).filter(Boolean);
  if (names.length === 0) return `已选择 ${selected.length} 份可用资料`;
  if (names.length <= 3) return `已选择 ${selected.length} 份可用资料：${names.join('、')}`;
  return `已选择 ${selected.length} 份可用资料：${names.slice(0, 3).join('、')} 等 ${names.length} 项`;
}
