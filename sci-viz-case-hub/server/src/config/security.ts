import type { CookieOptions } from 'express';

const DEVELOPMENT_JWT_SECRET = 'case-hub-local-development-only';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export function assertSecurityConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (!isProduction(env)) return;

  const jwtSecret = env.JWT_SECRET?.trim() ?? '';
  if (jwtSecret.length < MIN_PRODUCTION_SECRET_LENGTH || /change-me|replace-with/i.test(jwtSecret)) {
    throw new Error(`Production JWT_SECRET must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters and must not use a placeholder value`);
  }

  const origins = (env.CORS_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (origins.length === 0) {
    throw new Error('Production CORS_ORIGINS must contain at least one explicit origin');
  }
  if (origins.some(origin => {
    try {
      const url = new URL(origin);
      return origin === '*' || url.protocol !== 'https:' || url.origin !== origin || Boolean(url.username || url.password);
    } catch {
      return true;
    }
  })) {
    throw new Error('Production CORS_ORIGINS must contain only explicit HTTPS origins');
  }

  const studioKey = env.STUDIO_SERVICE_KEY?.trim() ?? '';
  if (studioKey.length < MIN_PRODUCTION_SECRET_LENGTH || /change-me|replace-with/i.test(studioKey)) {
    throw new Error(`Production STUDIO_SERVICE_KEY must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters and must not use a placeholder value`);
  }
}

export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (isProduction(env)) {
    assertSecurityConfig(env);
    return env.JWT_SECRET!.trim();
  }
  return env.JWT_SECRET?.trim() || DEVELOPMENT_JWT_SECRET;
}

export function isPublicRegistrationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProduction(env)) return false;
  return env.ALLOW_PUBLIC_REGISTRATION !== 'false';
}

export function authCookieOptions(env: NodeJS.ProcessEnv = process.env): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(env),
    sameSite: 'lax',
    path: '/',
  };
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim();
  return /^[\p{L}\p{N}_.-]{3,64}$/u.test(username) ? username : null;
}

export function isAcceptablePassword(value: unknown, requireStrong = false): value is string {
  if (typeof value !== 'string' || value.length > 128) return false;
  return requireStrong ? value.length >= 10 : value.length > 0;
}
