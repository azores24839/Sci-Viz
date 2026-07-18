const PUBLIC_CASE_FIELDS = [
  'id', 'title', 'sourceUrl', 'sourceDomain', 'pageTitle', 'caseTitle',
  'imageUrl', 'imagePath', 'thumbnailPath',
  'videoUrl', 'videoPlatform', 'videoDuration',
  'captureType', 'mediaType', 'contentType', 'discipline', 'technicalMethod',
  'composition', 'colorTone', 'useCase', 'functionalPurpose', 'distributionMedium',
  'mediaSubType', 'contentSubType', 'aiSummary', 'borrowablePoints', 'rating',
  'createdAt', 'updatedAt',
] as const;

export type PublicCaseDto = Partial<Record<(typeof PUBLIC_CASE_FIELDS)[number], unknown>>;

export function toPublicCaseDto(source: Record<string, unknown>): PublicCaseDto {
  const result: PublicCaseDto = {};
  for (const field of PUBLIC_CASE_FIELDS) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result;
}
