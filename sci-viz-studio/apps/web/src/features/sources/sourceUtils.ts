import type { SourceDocument } from '@studio/contracts';

const readyStatuses = new Set<SourceDocument['status']>(['READY', 'READY_WITHOUT_SUMMARY']);

export function usableSelectedSources(sources: SourceDocument[]) {
  return sources.filter((source) => source.selected
    && readyStatuses.has(source.status)
    && (source.kind !== 'IMAGE' || Boolean(source.ocrText || source.imageDescription)));
}
