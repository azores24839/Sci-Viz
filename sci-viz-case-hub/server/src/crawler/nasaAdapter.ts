import { prisma } from '../prisma.js';
import { saveImageFromUrl } from '../services/image.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { runAnalysis } from '../services/analysisRunner.js';

const NASA_SEARCH_URL = 'https://images-api.nasa.gov/search';
const NASA_KEYWORDS = ['space', 'telescope', 'galaxy', 'experiment', 'laboratory', 'earth science', 'microscopy', 'satellite', 'climate', 'physics'];

interface NasaItem {
  data: Array<{
    nasa_id: string;
    title: string;
    description: string;
    date_created: string;
    keywords?: string[];
    center?: string;
    secondary_creator?: string;
  }>;
  links?: Array<{ href: string; rel: string; render?: string }>;
}

export interface NasaImageResult {
  nasaId: string;
  title: string;
  description: string;
  dateCreated: string;
  keywords: string[];
  center: string;
  imageUrl: string;
  pageUrl: string;
}

async function searchNasa(query: string, count: number): Promise<NasaImageResult[]> {
  const results: NasaImageResult[] = [];
  const seen = new Set<string>();
  let page = 1;

  while (results.length < count && page <= 5) {
    const url = `${NASA_SEARCH_URL}?q=${encodeURIComponent(query)}&media_type=image&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const body = await res.json() as { collection?: { items?: NasaItem[]; metadata?: { total_hits: number } } };
    const items = body.collection?.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      if (results.length >= count) break;

      const data = item.data?.[0];
      if (!data?.nasa_id) continue;

      const nasaId = data.nasa_id;
      if (seen.has(nasaId)) continue;
      seen.add(nasaId);

      const imageUrl = `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~large.jpg`;
      const pageUrl = `https://images.nasa.gov/details/${nasaId}`;

      results.push({
        nasaId,
        title: data.title || '',
        description: (data.description || '').substring(0, 2000),
        dateCreated: data.date_created || '',
        keywords: data.keywords || [],
        center: data.center || '',
        imageUrl,
        pageUrl,
      });
    }

    page++;
  }

  return results;
}

export async function discoverNasaImages(maxPerKeyword: number = 10): Promise<NasaImageResult[]> {
  const allResults: NasaImageResult[] = [];
  const seenIds = new Set<string>();

  for (const keyword of NASA_KEYWORDS) {
    const results = await searchNasa(keyword, maxPerKeyword);
    for (const r of results) {
      if (!seenIds.has(r.nasaId)) {
        seenIds.add(r.nasaId);
        allResults.push(r);
      }
    }
  }

  return allResults;
}

function mapToContext(result: NasaImageResult): string {
  const parts = [
    result.title,
    result.description?.substring(0, 500),
    result.keywords?.join(', '),
    result.center ? `NASA Center: ${result.center}` : '',
  ].filter(Boolean);
  return parts.join(' | ').substring(0, 1500);
}

export async function ingestNasaImage(
  result: NasaImageResult,
  sourceName: string,
  sourceType: string,
): Promise<number> {
  const existingByUrl = await prisma.visualCase.findFirst({
    where: { sourceUrl: result.pageUrl },
    select: { id: true },
  });
  if (existingByUrl) return 0;

  const sizeSuffixes = ['~large.jpg', '~medium.jpg', '~orig.jpg'];
  let imageResult: Awaited<ReturnType<typeof saveImageFromUrl>> | null = null;

  for (const suffix of sizeSuffixes) {
    const url = `https://images-assets.nasa.gov/image/${result.nasaId}/${result.nasaId}${suffix}`;
    try {
      imageResult = await saveImageFromUrl(url);
      break;
    } catch {
      continue;
    }
  }

  if (!imageResult) return 0;

  const duplicate = await findDuplicateCase(imageResult.imageHash);
  if (duplicate) return 0;

  const contextText = mapToContext(result);

  const caseEntry = await prisma.visualCase.create({
    data: {
      sourceUrl: result.pageUrl,
      sourceDomain: 'images.nasa.gov',
      pageTitle: result.title,
      imageUrl: result.imageUrl,
      imagePath: imageResult.imagePath,
      thumbnailPath: imageResult.thumbnailPath,
      imageHash: imageResult.imageHash,
      contextText,
      captureType: 'crawler',
      userHint: `${sourceName} / ${sourceType}`,
      reviewStatus: 'pending_ai_analysis',
    },
  });

  runAnalysis(caseEntry.id, imageResult.imagePath, result.title, result.pageUrl, contextText);

  return 1;
}
