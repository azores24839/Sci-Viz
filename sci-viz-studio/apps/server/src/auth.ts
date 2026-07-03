import crypto from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest { authUserId: string }
}

export function getAuthMode(env: NodeJS.ProcessEnv) {
  return env.AUTH_MODE ?? (env.NODE_ENV === 'production' ? 'clerk' : 'mock');
}

export function assertProductionAuth(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === 'production' && getAuthMode(env) !== 'clerk') throw new Error('Production requires AUTH_MODE=clerk');
  if (getAuthMode(env) === 'clerk' && !env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY) throw new Error('Clerk auth requires CLERK_SECRET_KEY or CLERK_JWT_KEY');
  if (env.NODE_ENV === 'production' && !env.AUTH_PROJECT_SECRET) throw new Error('Production requires AUTH_PROJECT_SECRET');
}

export function defaultProjectId(userId: string, env: NodeJS.ProcessEnv) {
  const secret = env.AUTH_PROJECT_SECRET ?? 'local-development-only';
  const digest = crypto.createHmac('sha256', secret).update(userId).digest('hex').slice(0, 24);
  return `demo-changxing-${digest}`;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply, env: NodeJS.ProcessEnv) {
  if (getAuthMode(env) === 'mock') { request.authUserId = env.MOCK_USER_ID ?? 'user_local_development'; return; }
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply.code(401).send({ success: false, error: { code: 'AUTH_REQUIRED', message: '请先登录。' } });
  try {
    const payload = await verifyToken(token, {
      ...(env.CLERK_JWT_KEY ? { jwtKey: env.CLERK_JWT_KEY } : { secretKey: env.CLERK_SECRET_KEY }),
      authorizedParties: (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    });
    request.authUserId = payload.sub;
  } catch {
    return reply.code(401).send({ success: false, error: { code: 'AUTH_SESSION_EXPIRED', message: '登录状态已失效，请重新登录。' } });
  }
}

export function ownsDefaultProject(request: FastifyRequest, projectId: string, env: NodeJS.ProcessEnv) {
  return projectId === defaultProjectId(request.authUserId, env);
}
