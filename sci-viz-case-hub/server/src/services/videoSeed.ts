import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';
import { saveImageFromUrl } from './image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_FILE = path.join(__dirname, '..', '..', 'prisma', 'seedVideos.json');

interface VideoEntry {
  title: string;
  caseTitle: string;
  sourceUrl: string;
  sourceDomain: string;
  videoUrl: string;
  videoPlatform: string;
  imageUrl: string;
  captureType: string;
  distributionMedium: string;
  mediaType: string;
  contentType: string;
  discipline: string;
  technicalMethod: string;
  functionalPurpose: string;
  userHint: string;
}

function extractBvid(url: string): string | null {
  const match = url.match(/BV[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function getBilibiliPosterUrl(bvid: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
      {
        headers: {
          'Referer': 'https://www.bilibili.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      }
    );
    if (!response.ok) return null;
    const data = await response.json() as { data?: { pic?: string } };
    return data?.data?.pic || null;
  } catch {
    return null;
  }
}

function getYoutubePosterUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

async function getPosterUrl(entry: VideoEntry): Promise<string | null> {
  if (entry.imageUrl) return entry.imageUrl;

  if (entry.videoPlatform === 'bilibili') {
    const bvid = extractBvid(entry.videoUrl);
    if (!bvid) return null;
    return getBilibiliPosterUrl(bvid);
  }

  if (entry.videoPlatform === 'youtube') {
    const videoId = extractYoutubeId(entry.videoUrl);
    if (!videoId) return null;
    return getYoutubePosterUrl(videoId);
  }

  return null;
}

export async function seedVideos(dryRun?: boolean): Promise<{ seeded: number; skipped: number; errors: string[] }> {
  const data = await fs.readFile(SEED_FILE, 'utf-8');
  const entries: VideoEntry[] = JSON.parse(data);

  let seeded = 0;
  let skipped = 0;
  const errors: string[] = [];

  const log = (msg: string) => {
    const prefix = dryRun ? '[DRY RUN] ' : '';
    console.log(`${prefix}${msg}`);
  };

  for (const entry of entries) {
    try {
      const existing = await prisma.visualCase.findFirst({
        where: { videoUrl: entry.videoUrl },
      });

      if (existing) {
        log(`Skipping existing: ${entry.title} (${entry.videoUrl})`);
        skipped++;
        continue;
      }

      const posterUrl = await getPosterUrl(entry);

      let imagePath = '';
      let thumbnailPath = '';
      let imageHash = '';
      let finalImageUrl = posterUrl || '';

      if (posterUrl && !dryRun) {
        try {
          const saved = await saveImageFromUrl(posterUrl);
          imagePath = saved.imagePath;
          thumbnailPath = saved.thumbnailPath;
          imageHash = saved.imageHash;
          finalImageUrl = posterUrl;
        } catch (err) {
          const msg = `Failed to download poster for "${entry.title}": ${(err as Error).message}`;
          console.warn(msg);
          errors.push(msg);
        }
      } else if (posterUrl && dryRun) {
        log(`Would download poster from: ${posterUrl}`);
      }

      if (!dryRun) {
        await prisma.visualCase.create({
          data: {
            title: entry.title,
            caseTitle: entry.caseTitle,
            sourceUrl: entry.sourceUrl,
            sourceDomain: entry.sourceDomain,
            videoUrl: entry.videoUrl,
            videoPlatform: entry.videoPlatform,
            imageUrl: finalImageUrl,
            imagePath,
            thumbnailPath,
            imageHash,
            captureType: entry.captureType,
            distributionMedium: entry.distributionMedium,
            mediaType: entry.mediaType,
            contentType: entry.contentType,
            discipline: entry.discipline,
            technicalMethod: entry.technicalMethod,
            functionalPurpose: entry.functionalPurpose,
            userHint: entry.userHint,
            reviewStatus: 'approved',
          },
        });
      }

      log(`Seeded: ${entry.title}`);
      seeded++;
    } catch (err) {
      const msg = `Error seeding "${entry.title}": ${(err as Error).message}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return { seeded, skipped, errors };
}
