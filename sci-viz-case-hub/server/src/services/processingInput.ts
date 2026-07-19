const MAX_CASE_ID_LENGTH = 100;

export function normalizeCaseIds(value: unknown, maxItems = 200): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const id = item.trim();
    if (!id || id.length > MAX_CASE_ID_LENGTH) return null;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    if (ids.length > maxItems) return null;
  }
  return ids;
}

export function normalizeReviewStatuses(value: unknown, allowed: readonly string[]): string[] | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0) return null;
  const allowedSet = new Set(allowed);
  if (value.some(item => typeof item !== 'string')) return null;
  const statuses = [...new Set((value as string[]).map(item => item.trim()))];
  if (statuses.length === 0 || statuses.some(status => !status || !allowedSet.has(status))) return null;
  return statuses;
}

export function dedupeCaseIdsByImageHash(
  candidates: Array<{ id: string; imageHash: string }>,
  requestedIds?: string[],
): string[] {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const ordered = requestedIds ?? candidates.map(candidate => candidate.id);
  const seenIds = new Set<string>();
  const seenHashes = new Set<string>();
  const result: string[] = [];

  for (const id of ordered) {
    if (seenIds.has(id)) continue;
    const candidate = byId.get(id);
    if (!candidate) continue;
    seenIds.add(id);
    if (candidate.imageHash && seenHashes.has(candidate.imageHash)) continue;
    if (candidate.imageHash) seenHashes.add(candidate.imageHash);
    result.push(id);
  }
  return result;
}
