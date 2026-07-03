import { describe, expect, it } from 'vitest';
import { assertProductionAuth, defaultProjectId, getAuthMode } from './auth.js';

describe('auth configuration', () => {
  it('uses mock auth locally and Clerk in production', () => {
    expect(getAuthMode({ NODE_ENV: 'development' })).toBe('mock');
    expect(getAuthMode({ NODE_ENV: 'production' })).toBe('clerk');
  });

  it('refuses an unsafe production configuration', () => {
    expect(() => assertProductionAuth({ NODE_ENV: 'production', AUTH_MODE: 'mock' })).toThrow('AUTH_MODE=clerk');
    expect(() => assertProductionAuth({ NODE_ENV: 'production', AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk' })).toThrow('AUTH_PROJECT_SECRET');
    expect(() => assertProductionAuth({ NODE_ENV: 'production', AUTH_MODE: 'clerk', CLERK_SECRET_KEY: 'sk', AUTH_PROJECT_SECRET: 'secret' })).not.toThrow();
  });

  it('creates stable, user-specific project ids without exposing the Clerk id', () => {
    const env = { AUTH_PROJECT_SECRET: 'secret' };
    const first = defaultProjectId('user_a', env);
    expect(first).toBe(defaultProjectId('user_a', env));
    expect(first).not.toBe(defaultProjectId('user_b', env));
    expect(first).not.toContain('user_a');
  });
});
