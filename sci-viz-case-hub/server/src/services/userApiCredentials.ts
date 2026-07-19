import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { getJwtSecret } from '../config/security.js';
import { assertPublicHttpUrl, readTextWithLimit, toTrimmedString } from '../utils/httpSafety.js';
import { getVisionConfig, getVisionHeaders, type VisionApiConfig } from './visionConfig.js';

export type VisionProvider = 'openrouter' | 'dashscope' | 'custom';

export interface UserApiConfigInput {
  provider: VisionProvider;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface UserApiConfigStatus {
  configured: boolean;
  provider: VisionProvider;
  endpoint: string;
  model: string;
  keyHint: string;
  source: 'personal' | 'server' | 'none';
}

const PROVIDERS = new Set<VisionProvider>(['openrouter', 'dashscope', 'custom']);
const MAX_API_RESPONSE_BYTES = 512 * 1024;

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(`case-hub-user-api-key:${getJwtSecret()}`).digest();
}

function encryptApiKey(value: string): { encryptedKey: string; keyIv: string; keyTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    encryptedKey: encrypted.toString('base64'),
    keyIv: iv.toString('base64'),
    keyTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptApiKey(encryptedKey: string, keyIv: string, keyTag: string): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(keyIv, 'base64'));
  decipher.setAuthTag(Buffer.from(keyTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedKey, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function normalizeProvider(value: unknown): VisionProvider {
  return PROVIDERS.has(value as VisionProvider) ? value as VisionProvider : 'custom';
}

async function normalizeInput(value: Partial<UserApiConfigInput>): Promise<UserApiConfigInput> {
  const provider = normalizeProvider(value.provider);
  const endpoint = toTrimmedString(value.endpoint, 500);
  const model = toTrimmedString(value.model, 160);
  if (!endpoint || !model) throw new Error('请填写 API 地址和模型名称');
  const parsed = await assertPublicHttpUrl(endpoint);
  if (parsed.protocol !== 'https:') throw new Error('API 地址必须使用 HTTPS');
  return { provider, endpoint: parsed.href, model, apiKey: toTrimmedString(value.apiKey, 500) };
}

export async function getUserApiConfigStatus(userId: string): Promise<UserApiConfigStatus> {
  const saved = await prisma.userApiCredential.findUnique({ where: { userId } });
  if (saved) {
    return {
      configured: true,
      provider: normalizeProvider(saved.provider),
      endpoint: saved.endpoint,
      model: saved.model,
      keyHint: saved.keyHint,
      source: 'personal',
    };
  }
  const server = getVisionConfig();
  return {
    configured: Boolean(server.key && !server.key.includes('your-')),
    provider: normalizeProvider(server.provider),
    endpoint: server.url,
    model: server.ocrModel,
    keyHint: server.key ? `••••${server.key.slice(-4)}` : '',
    source: server.key ? 'server' : 'none',
  };
}

export async function saveUserApiConfig(userId: string, value: Partial<UserApiConfigInput>): Promise<UserApiConfigStatus> {
  const input = await normalizeInput(value);
  const existing = await prisma.userApiCredential.findUnique({ where: { userId } });
  const apiKey = input.apiKey || (existing ? decryptApiKey(existing.encryptedKey, existing.keyIv, existing.keyTag) : '');
  if (!apiKey || apiKey.includes('your-')) throw new Error('请填写有效的 API Key');
  const encrypted = encryptApiKey(apiKey);
  await prisma.userApiCredential.upsert({
    where: { userId },
    create: {
      userId,
      provider: input.provider,
      endpoint: input.endpoint,
      model: input.model,
      ...encrypted,
      keyHint: `••••${apiKey.slice(-4)}`,
    },
    update: {
      provider: input.provider,
      endpoint: input.endpoint,
      model: input.model,
      ...encrypted,
      keyHint: `••••${apiKey.slice(-4)}`,
    },
  });
  return getUserApiConfigStatus(userId);
}

export async function deleteUserApiConfig(userId: string): Promise<void> {
  await prisma.userApiCredential.deleteMany({ where: { userId } });
}

export async function resolveVisionConfig(userId?: string): Promise<VisionApiConfig> {
  if (!userId) return getVisionConfig();
  const saved = await prisma.userApiCredential.findUnique({ where: { userId } });
  if (!saved) return getVisionConfig();
  return {
    url: saved.endpoint,
    key: decryptApiKey(saved.encryptedKey, saved.keyIv, saved.keyTag),
    model: saved.model,
    ocrModel: saved.model,
    provider: saved.provider,
  };
}

export async function testUserApiConfig(userId: string): Promise<{ message: string }> {
  const config = await resolveVisionConfig(userId);
  if (!config.key) throw new Error('尚未配置 API Key');
  const response = await fetch(config.url, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: getVisionHeaders(config.key),
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: 'Reply with OK only.' }],
      temperature: 0,
      max_tokens: 8,
    }),
  });
  const body = await readTextWithLimit(response, MAX_API_RESPONSE_BYTES).catch(() => '');
  if (!response.ok) throw new Error(`连接失败（HTTP ${response.status}）${body ? `：${body.slice(0, 160)}` : ''}`);
  return { message: '连接成功，Key 与模型可以正常使用' };
}
