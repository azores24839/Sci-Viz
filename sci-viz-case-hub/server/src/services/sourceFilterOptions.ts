export interface SourceOptionCase {
  sourceDomain: string;
  sourceUrl: string;
  userHint: string;
  caseTitle: string;
}

export interface SourceDefinition {
  name: string;
  url: string;
}

function sourceDomainFromUrl(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

export function countCasesBySourceName(cases: SourceOptionCase[], sources: SourceDefinition[]) {
  const uniqueSources = [...new Map(
    sources
      .map(source => ({ ...source, name: source.name.trim(), domain: sourceDomainFromUrl(source.url) }))
      .filter(source => source.name)
      .map(source => [source.name, source]),
  ).values()];
  const domainCounts = new Map<string, number>();
  for (const source of uniqueSources) {
    if (source.domain) domainCounts.set(source.domain, (domainCounts.get(source.domain) || 0) + 1);
  }

  return uniqueSources.map(source => {
    const byHint = cases.filter(item => item.userHint === source.name || item.userHint.startsWith(`${source.name} /`)).length;
    if (byHint > 0) return { label: source.name, count: byHint };

    const byUrl = source.url ? cases.filter(item => item.sourceUrl.startsWith(source.url)).length : 0;
    if (byUrl > 0) return { label: source.name, count: byUrl };

    const byTitle = cases.filter(item => item.caseTitle === source.name || item.caseTitle.startsWith(`${source.name} /`)).length;
    if (byTitle > 0) return { label: source.name, count: byTitle };

    const byUniqueDomain = source.domain && domainCounts.get(source.domain) === 1
      ? cases.filter(item => item.sourceDomain === source.domain).length
      : 0;
    return { label: source.name, count: byUniqueDomain };
  });
}
