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

// A byte-size floor only catches truncated/non-image payloads. Real safety and
// usefulness are determined below from decoded format and pixel dimensions.
const MIN_IMAGE_SIZE = 256;
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 20_000;
const SKIP_CONTENT_TYPES = ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'];
const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'heic', 'avif']);

export interface SavedImage {
  imagePath: string;
  thumbnailPath: string;
  imageHash: string;
  ossImageUrl?: string;
  ossThumbUrl?: string;
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
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

  let thumbBuffer: Buffer;
  try {
    thumbBuffer = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
      .resize(300, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    await fs.writeFile(thumbnailPath, thumbBuffer);
  } catch (error) {
    await fs.unlink(imagePath).catch(() => {});
    await fs.unlink(thumbnailPath).catch(() => {});
    throw error;
  }

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
    throw new ImageValidationError(`Image too small: ${buffer.length} bytes (min ${MIN_IMAGE_SIZE})`);
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new ImageValidationError(`Image too large: ${buffer.length} bytes (max ${MAX_IMAGE_SIZE})`);
  }
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new ImageValidationError('Invalid or unsafe image data');
  }
  if (!metadata.format || !ALLOWED_IMAGE_FORMATS.has(metadata.format)) {
    throw new ImageValidationError(`Unsupported image format: ${metadata.format || 'unknown'}`);
  }
  if (!metadata.width || !metadata.height) {
    throw new ImageValidationError('Could not determine image dimensions');
  }
  const area = metadata.width * metadata.height;
  if ((metadata.width < 96 && metadata.height < 96) || area < 8_000) {
    throw new ImageValidationError(`Image dimensions too small: ${metadata.width}x${metadata.height}`);
  }
  if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new ImageValidationError(`Image dimensions are too large: ${metadata.width}x${metadata.height}`);
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

export async function saveImageFromUrl(imageUrl: string, externalSignal?: AbortSignal): Promise<SavedImage> {
  let parsedUrl = await assertPublicHttpUrl(imageUrl);
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount < 5; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const fetchSignal = externalSignal
        ? AbortSignal.any([externalSignal, controller.signal])
        : controller.signal;
      response = await fetch(parsedUrl.href, {
        signal: fetchSignal,
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
