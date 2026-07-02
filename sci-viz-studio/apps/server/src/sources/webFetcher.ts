import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';

const MAX_WEB_BYTES = 20 * 1024 * 1024;

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

export async function assertPublicUrl(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('WEB_PROTOCOL_NOT_ALLOWED');
  if (url.username || url.password) throw new Error('WEB_CREDENTIALS_NOT_ALLOWED');
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) throw new Error('WEB_PRIVATE_ADDRESS');
  return url;
}

export function canonicalizeUrl(input: string) {
  const url = new URL(input);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

export async function fetchWebSource(input: string) {
  let url = await assertPublicUrl(input);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'SciAIStudioSourceBot/1.0' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === 5) throw new Error('WEB_TOO_MANY_REDIRECTS');
        url = await assertPublicUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`WEB_HTTP_${response.status}`);
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_WEB_BYTES) throw new Error('WEB_TOO_LARGE');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_WEB_BYTES) throw new Error('WEB_TOO_LARGE');
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
      if (contentType === 'application/pdf') return { type: 'pdf' as const, buffer, finalUrl: url.toString(), contentType };
      if (!contentType.includes('html') && !contentType.startsWith('text/')) throw new Error('WEB_UNSUPPORTED_CONTENT');
      const html = buffer.toString('utf8');
      const $ = cheerio.load(html);
      $('script,style,noscript,nav,footer,header,aside,form,iframe').remove();
      const title = $('meta[property="og:title"]').attr('content')?.trim() || $('title').text().trim() || url.hostname;
      const root = $('article,main,[role="main"]').first();
      const text = (root.length ? root.text() : $('body').text()).replace(/\s+/g, ' ').trim();
      if (text.length < 80) throw new Error('WEB_TEXT_TOO_SHORT');
      return { type: 'html' as const, title, text, finalUrl: url.toString(), contentType };
    } finally { clearTimeout(timer); }
  }
  throw new Error('WEB_TOO_MANY_REDIRECTS');
}
