import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { assertPublicHttpUrl, readResponseWithLimit } from '../utils/httpSafety.js';
import { isOssEnabled, uploadBufferToOss, makeOssKey, getOssPublicUrl } from './oss.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const ORIGINALS_DIR = path.join(UPLOAD_DIR, 'originals');
const THUMBNAILS_DIR = path.join(UPLOAD_DIR, 'thumbnails');

const MIN_IMAGE_SIZE = 10 * 1024;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const SKIP_CONTENT_TYPES = ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

export interface SavedImage {
  imagePath: string;
  thumbnailPath: string;
  imageHash: string;
  ossImageUrl?: string;
  ossThumbUrl?: string;
}

export async function ensureUploadDirs() {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
}

export async function saveImage(
  buffer: Buffer,
  ext: string = 'jpg'
): Promise<SavedImage> {
  await validateImageBuffer(buffer);
  const imageHash = createImageHash(buffer);

  const id = uuid();
  const timestamp = Date.now();
  const safeExt = normalizeFileExt(ext);
  const filename = `case_${id}_${timestamp}.${safeExt}`;
  const thumbFilename = `case_${id}_${timestamp}_thumb.jpg`;

  const imagePath = path.join(ORIGINALS_DIR, filename);
  const thumbnailPath = path.join(THUMBNAILS_DIR, thumbFilename);

  await fs.writeFile(imagePath, buffer);

  const thumbBuffer = await sharp(buffer)
    .resize(300, 200, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();
  await fs.writeFile(thumbnailPath, thumbBuffer);

  const result: SavedImage = {
    imagePath: `/uploads/originals/${filename}`,
    thumbnailPath: `/uploads/thumbnails/${thumbFilename}`,
    imageHash,
  };

  // Background: upload to OSS if configured
  if (isOssEnabled()) {
    Promise.all([
      uploadBufferToOss(buffer, makeOssKey('originals', filename), `image/${safeExt}`).catch(() => null),
      uploadBufferToOss(thumbBuffer, makeOssKey('thumbnails', thumbFilename), 'image/jpeg').catch(() => null),
    ]).then(([ossImage, ossThumb]) => {
      if (ossImage) result.ossImageUrl = ossImage;
      if (ossThumb) result.ossThumbUrl = ossThumb;
    }).catch(() => {});
  }

  return result;
}

export function createImageHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function uploadPathToFilePath(webPath: string): string | null {
  if (!webPath.startsWith('/uploads/')) return null;
  const relative = webPath.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOAD_DIR, relative);
  return filePath.startsWith(UPLOAD_DIR) ? filePath : null;
}

export async function deleteSavedImage(imagePath: string, thumbnailPath: string): Promise<void> {
  const paths = [imagePath, thumbnailPath]
    .map(uploadPathToFilePath)
    .filter((filePath): filePath is string => Boolean(filePath));

  await Promise.all(paths.map(filePath => fs.unlink(filePath).catch(() => {})));
}

export async function validateImageBuffer(buffer: Buffer): Promise<{ width: number; height: number }> {
  if (buffer.length < MIN_IMAGE_SIZE) {
    throw new Error(`Image too small: ${buffer.length} bytes (min ${MIN_IMAGE_SIZE})`);
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${buffer.length} bytes (max ${MAX_IMAGE_SIZE})`);
  }
  const metadata = await sharp(buffer).metadata();
  if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
    throw new Error(`Unsupported image format: ${metadata.format || 'unknown'}`);
  }
  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions');
  }
  if (metadata.width < 100 || metadata.height < 100) {
    throw new Error(`Image dimensions too small: ${metadata.width}x${metadata.height}`);
  }
  return { width: metadata.width, height: metadata.height };
}

function normalizeFileExt(ext: string): string {
  const lower = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['jpg', 'jpeg'].includes(lower)) return 'jpg';
  if (['png', 'webp', 'gif'].includes(lower)) return lower;
  return 'jpg';
}

function normalizeExt(contentType: string): string {
  const subType = (contentType.split(';')[0] || '').split('/')[1] || '';
  switch (subType) {
    case 'jpeg': return 'jpg';
    case 'png': return 'png';
    case 'webp': return 'webp';
    case 'gif': return 'gif';
    case 'svg+xml': return 'svg';
    default: return 'jpg';
  }
}

export async function saveImageFromUrl(imageUrl: string): Promise<SavedImage> {
  let parsedUrl = await assertPublicHttpUrl(imageUrl);
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      response = await fetch(parsedUrl.href, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      parsedUrl = await assertPublicHttpUrl(new URL(location, parsedUrl.href).href);
      continue;
    }

    break;
  }

  if (!response) {
    throw new Error('Failed to fetch image: no response');
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch image: HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.split(';')[0].startsWith('image/')) {
    throw new Error(`Not an image: content-type is "${contentType}"`);
  }
  if (SKIP_CONTENT_TYPES.some(t => contentType.includes(t))) {
    throw new Error(`Unsupported image type: ${contentType}`);
  }

  const buffer = await readResponseWithLimit(response, MAX_IMAGE_SIZE);

  await validateImageBuffer(buffer);

  const ext = normalizeExt(contentType);
  return saveImage(buffer, ext);
}
