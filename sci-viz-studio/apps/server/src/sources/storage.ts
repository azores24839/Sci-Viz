import fs from 'node:fs/promises';
import path from 'node:path';
import OSS from 'ali-oss';

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  signedGetUrl(key: string): Promise<string>;
  signedPutUrl(key: string, contentType: string): Promise<string | undefined>;
  mode: 'local' | 'oss';
}

export class LocalObjectStorage implements ObjectStorage {
  mode = 'local' as const;
  constructor(private readonly root: string, private readonly apiBase: string) {}
  private resolve(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) throw new Error('INVALID_OBJECT_KEY');
    return target;
  }
  async put(key: string, body: Buffer) { const target = this.resolve(key); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, body); }
  get(key: string) { return fs.readFile(this.resolve(key)); }
  async remove(key: string) { await fs.rm(this.resolve(key), { force: true }); }
  async signedGetUrl(key: string) { return `${this.apiBase}/api/v1/source-objects/${encodeURIComponent(key)}`; }
  async signedPutUrl() { return undefined; }
}

export class OssObjectStorage implements ObjectStorage {
  mode = 'oss' as const;
  private readonly client: OSS;
  constructor(env: NodeJS.ProcessEnv) {
    this.client = new OSS({
      region: env.OSS_REGION!,
      accessKeyId: env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET!,
      bucket: env.OSS_BUCKET!,
      secure: true,
    });
  }
  async put(key: string, body: Buffer, contentType: string) { await this.client.put(key, body, { headers: { 'Content-Type': contentType } }); }
  async get(key: string) { const result = await this.client.get(key); return Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content); }
  async remove(key: string) { await this.client.delete(key); }
  async signedGetUrl(key: string) { return this.client.signatureUrl(key, { expires: 900, method: 'GET' }); }
  async signedPutUrl(key: string, contentType: string) {
    return this.client.signatureUrl(key, { expires: 900, method: 'PUT', 'Content-Type': contentType });
  }
}

export function createObjectStorage(env: NodeJS.ProcessEnv): ObjectStorage {
  const required = ['OSS_REGION', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_BUCKET'] as const;
  if (required.every((key) => Boolean(env[key]))) return new OssObjectStorage(env);
  const root = path.resolve(process.cwd(), env.SOURCE_STORAGE_PATH ?? '../../data/studio/objects');
  if (env.NODE_ENV === 'production') console.warn('[sources] OSS is not configured; using local disk object storage');
  return new LocalObjectStorage(root, env.PUBLIC_API_URL ?? `http://127.0.0.1:${env.PORT ?? 3011}`);
}
