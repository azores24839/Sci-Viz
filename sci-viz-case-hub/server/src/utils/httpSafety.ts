import { lookup } from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);
const MAX_TEXT_RESPONSE_BYTES = 5 * 1024 * 1024;

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number'
    ? value
    : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function toTrimmedString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.');
}

function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const normalized = normalizeHttpUrl(rawUrl);
  if (!normalized) {
    throw new Error('URL must be a valid http/https URL without credentials');
  }

  const parsed = new URL(normalized);
  const hostname = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    throw new Error('Private or local hostnames are not allowed');
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily && isPrivateAddress(hostname)) {
    throw new Error('Private or reserved IP addresses are not allowed');
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(entry => isPrivateAddress(entry.address))) {
      throw new Error('URL resolves to a private or reserved network address');
    }
  } catch (err) {
    if ((err as Error).message.includes('private or reserved')) throw err;
    throw new Error(`Could not resolve URL hostname: ${(err as Error).message}`);
  }

  return parsed;
}

export function assertSameOriginUrl(candidateUrl: string, baseUrl: string): string | null {
  try {
    const candidate = new URL(candidateUrl);
    const base = new URL(baseUrl);
    return candidate.origin === base.origin ? candidate.href : null;
  } catch {
    return null;
  }
}

export async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error(`Response too large: ${contentLength} bytes (max ${maxBytes})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`Response too large: ${buffer.length} bytes (max ${maxBytes})`);
    }
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`Response too large: ${total} bytes (max ${maxBytes})`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readTextWithLimit(response: Response, maxBytes = MAX_TEXT_RESPONSE_BYTES): Promise<string> {
  const buffer = await readResponseWithLimit(response, maxBytes);
  return buffer.toString('utf8');
}
