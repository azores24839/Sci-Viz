import { describe, expect, it } from 'vitest';
import { assertPublicUrl, canonicalizeUrl } from './webFetcher.js';

describe('web source safety', () => {
  it('removes fragments and common tracking parameters', () => {
    expect(canonicalizeUrl('https://example.com/research?utm_source=x&id=7#results')).toBe('https://example.com/research?id=7');
  });

  it('rejects loopback addresses', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/private')).rejects.toThrow('WEB_PRIVATE_ADDRESS');
  });

  it('rejects embedded credentials and non-http protocols', async () => {
    await expect(assertPublicUrl('https://user:pass@example.com')).rejects.toThrow('WEB_CREDENTIALS_NOT_ALLOWED');
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow('WEB_PROTOCOL_NOT_ALLOWED');
  });
});
