import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const OSS: any = require('ali-oss');

let ossClient: any = null;

function getOssConfig(): Record<string, any> | null {
  const region = process.env.OSS_REGION || 'oss-cn-shanghai';
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID || '';
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET || '';
  const bucket = process.env.OSS_BUCKET || 'sisi-oss';

  if (!accessKeyId || !accessKeySecret) return null;

  return {
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
    secure: true,
  };
}

export function getOssClient(): any | null {
  if (ossClient) return ossClient;
  const config = getOssConfig();
  if (!config) return null;
  ossClient = new OSS(config);
  return ossClient;
}

export function isOssEnabled(): boolean {
  return getOssConfig() !== null;
}

export async function uploadToOss(
  localFilePath: string,
  ossKey: string,
  contentType?: string,
): Promise<string> {
  const client = getOssClient();
  if (!client) throw new Error('OSS not configured');

  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;

  const result = await client.put(ossKey, localFilePath, { headers });
  return result.url;
}

export async function uploadBufferToOss(
  buffer: Buffer,
  ossKey: string,
  contentType?: string,
): Promise<string> {
  const client = getOssClient();
  if (!client) throw new Error('OSS not configured');

  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;

  const result = await client.put(ossKey, buffer, { headers });
  return result.url;
}

export function getOssPublicUrl(ossKey: string): string {
  const publicBaseUrl = (process.env.OSS_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (publicBaseUrl) return `${publicBaseUrl}/${ossKey}`;

  const config = getOssConfig();
  if (!config) return '';

  const { region, bucket, secure } = config;
  const protocol = secure ? 'https' : 'http';
  return `${protocol}://${bucket}.${region}.aliyuncs.com/${ossKey}`;
}

export function makeOssKey(dir: string, filename: string): string {
  return path.posix.join(dir, filename).replace(/^\/+/, '');
}

export function remapImagePath(localPath: string): string {
  if (!localPath || !localPath.startsWith('/uploads/')) return localPath;

  // Saving/uploading credentials do not guarantee that an object is publicly
  // readable yet. Keep local URLs by default so a failed or pending OSS upload
  // cannot make newly captured images disappear from review.
  const publicBaseUrl = (process.env.OSS_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (!publicBaseUrl) return localPath;

  const relative = localPath.replace(/^\/uploads\//, '');
  return `${publicBaseUrl}/${relative}`;
}

export async function ossFileExists(ossKey: string): Promise<boolean> {
  const client = getOssClient();
  if (!client) return false;

  try {
    await client.head(ossKey);
    return true;
  } catch {
    return false;
  }
}
