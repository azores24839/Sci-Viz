const PUBLIC_SOURCE_FIELDS = [
  'id', 'name', 'url', 'category', 'sourceType', 'sourceDomain',
  'enterpriseCompany', 'enterpriseCompanyKey', 'sourcePageType', 'existingCases',
  'sourceOwnerName', 'sourceOwnerKey', 'sourceOwnerKind', 'sourceOwnerDomain',
  'sourceDistributionGroup',
] as const;

export type PublicSourceDto = Partial<Record<(typeof PUBLIC_SOURCE_FIELDS)[number], unknown>>;

export function toPublicSourceDto(source: Record<string, unknown>): PublicSourceDto {
  const result: PublicSourceDto = {};
  for (const field of PUBLIC_SOURCE_FIELDS) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}
