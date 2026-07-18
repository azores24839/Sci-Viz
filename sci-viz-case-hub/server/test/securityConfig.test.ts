import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSecurityConfig,
  authCookieOptions,
  getJwtSecret,
  isAcceptablePassword,
  isPublicRegistrationEnabled,
  normalizeUsername,
} from '../src/config/security.js';

test('production rejects missing, weak, placeholder, or insecure security configuration', () => {
  assert.throws(() => assertSecurityConfig({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => assertSecurityConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'change-me-in-production-change-me',
    CORS_ORIGINS: 'https://example.com',
    STUDIO_SERVICE_KEY: 'a-studio-service-secret-that-is-long-enough',
  }), /JWT_SECRET/);
  assert.throws(() => assertSecurityConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-secure-production-secret-with-32-chars',
    CORS_ORIGINS: 'http://example.com',
    STUDIO_SERVICE_KEY: 'a-studio-service-secret-that-is-long-enough',
  }), /HTTPS/);
  assert.throws(() => assertSecurityConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-secure-production-secret-with-32-chars',
    CORS_ORIGINS: 'https://example.com/sciviz',
    STUDIO_SERVICE_KEY: 'a-studio-service-secret-that-is-long-enough',
  }), /HTTPS/);
  assert.throws(() => assertSecurityConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-secure-production-secret-with-32-chars',
    CORS_ORIGINS: 'https://example.com',
    STUDIO_SERVICE_KEY: 'short',
  }), /STUDIO_SERVICE_KEY/);
});

test('production accepts an explicit strong secret and HTTPS origins', () => {
  const env = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-secure-production-secret-with-32-chars',
    CORS_ORIGINS: 'https://example.com,https://admin.example.com',
    STUDIO_SERVICE_KEY: 'a-studio-service-secret-that-is-long-enough',
  };
  assert.doesNotThrow(() => assertSecurityConfig(env));
  assert.equal(getJwtSecret(env), env.JWT_SECRET);
});

test('public registration is always disabled in production', () => {
  assert.equal(isPublicRegistrationEnabled({ NODE_ENV: 'production', ALLOW_PUBLIC_REGISTRATION: 'true' }), false);
  assert.equal(isPublicRegistrationEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isPublicRegistrationEnabled({ NODE_ENV: 'development', ALLOW_PUBLIC_REGISTRATION: 'false' }), false);
});

test('authentication cookies are secure only in production and share a stable path', () => {
  assert.deepEqual(authCookieOptions({ NODE_ENV: 'production' }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  assert.equal(authCookieOptions({ NODE_ENV: 'development' }).secure, false);
});

test('credentials reject invalid types, control characters, and unbounded passwords', () => {
  assert.equal(normalizeUsername(' admin.user '), 'admin.user');
  assert.equal(normalizeUsername('ab'), null);
  assert.equal(normalizeUsername('admin\nforged'), null);
  assert.equal(isAcceptablePassword('valid-login-password'), true);
  assert.equal(isAcceptablePassword('short', true), false);
  assert.equal(isAcceptablePassword('x'.repeat(129)), false);
});
