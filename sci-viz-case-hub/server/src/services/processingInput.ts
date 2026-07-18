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
