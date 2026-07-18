export type SourceDistributionGroupKey =
  | 'domestic_university'
  | 'international_university'
  | 'enterprise'
  | 'research_institute'
  | 'journal_media'
  | 'gallery_open'
  | 'other';

export interface SourceDistributionSource {
  category: string;
  sourceType: string;
  url: string;
  sourceOwnerKey?: string;
  sourceOwnerKind?: 'university' | 'company' | 'research_institute' | 'government' | 'publisher_media' | 'platform' | 'other';
}

export interface SourceDistributionGroup {
  key: SourceDistributionGroupKey;
  label: string;
  sourceCount: number;
  sourcePercent: number;
  mediaCount: number;
  mediaPercent: number;
}

export interface SourceDistributionSummary {
  totalSources: number;
  totalMedia: number;
  unmatchedMedia: number;
  groups: SourceDistributionGroup[];
}

export const SOURCE_DISTRIBUTION_GROUPS: Array<{ key: SourceDistributionGroupKey; label: string }> = [
  { key: 'domestic_university', label: '中国高校' },
  { key: 'international_university', label: '国外高校' },
  { key: 'enterprise', label: '企业' },
  { key: 'research_institute', label: '科研机构/实验室' },
  { key: 'journal_media', label: '期刊/媒体' },
  { key: 'gallery_open', label: '图库/开放资源' },
  { key: 'other', label: '其他' },
];

const GROUP_KEYS = new Set(SOURCE_DISTRIBUTION_GROUPS.map(group => group.key));

export function isSourceDistributionGroupKey(value: string): value is SourceDistributionGroupKey {
  return GROUP_KEYS.has(value as SourceDistributionGroupKey);
}

function normalizeDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^www\./, '').split('/')[0];
  }
}

export function classifySourceDistributionGroup(source: SourceDistributionSource): SourceDistributionGroupKey {
  if (source.sourceOwnerKind) {
    if (source.sourceOwnerKind === 'university') {
      const domain = normalizeDomain(source.url);
      const category = source.category.trim().toUpperCase();
      return category === 'H' || category === 'SJTU' || category === '00-CHANGXING' || domain.endsWith('.edu.cn')
        ? 'domestic_university'
        : 'international_university';
    }
    if (source.sourceOwnerKind === 'company') return 'enterprise';
    if (source.sourceOwnerKind === 'research_institute' || source.sourceOwnerKind === 'government') return 'research_institute';
    if (source.sourceOwnerKind === 'publisher_media') return 'journal_media';
    if (source.sourceOwnerKind === 'platform') return 'gallery_open';
  }
  const type = source.sourceType.trim().toLowerCase();
  const category = source.category.trim().toUpperCase();
  const domain = normalizeDomain(source.url);

  const isUniversity = type.startsWith('university_')
    || type === 'university'
    || type === 'medical_school';
  if (isUniversity) {
    const isDomestic = category === 'H'
      || category === 'SJTU'
      || category === '00-CHANGXING'
      || domain.endsWith('.edu.cn');
    return isDomestic ? 'domestic_university' : 'international_university';
  }

  if (category === 'ENT' || type.startsWith('enterprise') || type === 'rd_center') return 'enterprise';

  if (/(gallery|photo|image|collection|repository|library|archive|museum|botanic_garden|data_visualization_reports)/.test(type)) {
    return 'gallery_open';
  }

  if (/(journal|publisher|science_media|news_aggregator|news_portal|professional_society|academic_org|science_engagement)/.test(type)) {
    return 'journal_media';
  }

  if (/(institute|laboratory|(^|_)lab($|_)|research_cent|national_|government_research|engineering_center|major_infrastructure|collaborative_innovation|international_cooperation|who_center)/.test(type)) {
    return 'research_institute';
  }

  return 'other';
}

function percent(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

export function calculateSourceDistribution(
  sources: SourceDistributionSource[],
  mediaByDomain: Array<{ sourceDomain: string; count: number }>,
): SourceDistributionSummary {
  const rows = new Map<SourceDistributionGroupKey, SourceDistributionGroup>(
    SOURCE_DISTRIBUTION_GROUPS.map(group => [group.key, { ...group, sourceCount: 0, sourcePercent: 0, mediaCount: 0, mediaPercent: 0 }]),
  );
  const domainVotes = new Map<string, Map<SourceDistributionGroupKey, number>>();
  const ownersByGroup = new Map<SourceDistributionGroupKey, Set<string>>(
    SOURCE_DISTRIBUTION_GROUPS.map(group => [group.key, new Set<string>()]),
  );

  for (const source of sources) {
    const key = classifySourceDistributionGroup(source);
    ownersByGroup.get(key)!.add(source.sourceOwnerKey || normalizeDomain(source.url) || source.url);
    const domain = normalizeDomain(source.url);
    if (!domain) continue;
    const votes = domainVotes.get(domain) || new Map<SourceDistributionGroupKey, number>();
    votes.set(key, (votes.get(key) || 0) + 1);
    domainVotes.set(domain, votes);
  }

  for (const [key, owners] of ownersByGroup) rows.get(key)!.sourceCount = owners.size;

  const groupOrder = new Map(SOURCE_DISTRIBUTION_GROUPS.map((group, index) => [group.key, index]));
  const domainGroups = new Map<string, SourceDistributionGroupKey>();
  for (const [domain, votes] of domainVotes) {
    const winner = [...votes.entries()].sort((a, b) =>
      b[1] - a[1] || (groupOrder.get(a[0]) || 0) - (groupOrder.get(b[0]) || 0),
    )[0]?.[0];
    if (winner) domainGroups.set(domain, winner);
  }

  let totalMedia = 0;
  let unmatchedMedia = 0;
  for (const item of mediaByDomain) {
    const count = Math.max(0, item.count);
    const key = domainGroups.get(normalizeDomain(item.sourceDomain));
    if (!key) {
      unmatchedMedia += count;
      continue;
    }
    rows.get(key)!.mediaCount += count;
    totalMedia += count;
  }

  const totalSources = new Set(sources.map(source => source.sourceOwnerKey || normalizeDomain(source.url) || source.url)).size;
  const groups = SOURCE_DISTRIBUTION_GROUPS.map(({ key }) => rows.get(key)!).map(group => ({
    ...group,
    sourcePercent: percent(group.sourceCount, totalSources),
    mediaPercent: percent(group.mediaCount, totalMedia),
  }));

  return { totalSources, totalMedia, unmatchedMedia, groups };
}
