import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

export interface AuthUser {
  id: string;
  username: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const PUBLIC_PATHS = ['/health', '/api/health'];
const PUBLIC_READ_PATTERNS = [
  /^\/cases$/,
  /^\/cases\/facet-counts$/,
  /^\/cases\/[^/]+$/,
  /^\/insights\/summary$/,
  /^\/insights\/comparison$/,
  /^\/insights\/three-axis-spectrum$/,
  /^\/pool\/sources$/,
];

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }

  if (req.method === 'GET' && PUBLIC_READ_PATTERNS.some(pattern => pattern.test(req.path))) {
    return next();
  }

  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ success: false, error: '未登录' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: '登录已过期' });
  }
}
