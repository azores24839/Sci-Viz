import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.requestId = resolveRequestId(req.header('x-request-id'));
  res.setHeader('x-request-id', req.requestId);
  next();
}

export function sendInternalError(req: Request, res: Response, context: string, error: unknown) {
  console.error(`[${req.requestId}] ${context} failed`, error);
  return res.status(500).json({ success: false, error: '请求处理失败，请稍后重试', requestId: req.requestId });
}
