import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function isValidStudioServiceKey(provided: unknown, configured: string): boolean {
  if (typeof provided !== 'string' || !provided || !configured) return false;
  return timingSafeEqual(digest(provided), digest(configured));
}
