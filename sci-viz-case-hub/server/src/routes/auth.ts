import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import type { AuthUser } from '../middleware/auth.js';
import { authCookieOptions, getJwtSecret, isAcceptablePassword, isPublicRegistrationEnabled, normalizeUsername } from '../config/security.js';
import { asyncRoute } from '../middleware/asyncRoute.js';

const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function signToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, username: user.username }, getJwtSecret(), { expiresIn: '7d' });
}

export const authRouter = Router();

authRouter.get('/check', (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.json({ success: false, error: '未登录' });
  }
  try {
    const user = jwt.verify(token, getJwtSecret()) as AuthUser;
    return res.json({ success: true, data: { id: user.id, username: user.username } });
  } catch {
    return res.json({ success: false, error: '登录已过期' });
  }
});

authRouter.post('/login', asyncRoute(async (req: Request, res: Response) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  if (!username || !isAcceptablePassword(password)) {
    return res.status(400).json({ success: false, error: '请输入用户名和密码' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }

  const token = signToken({ id: user.id, username: user.username });
  res.cookie('token', token, {
    ...authCookieOptions(),
    maxAge: TOKEN_MAX_AGE,
  });
  return res.json({ success: true, data: { id: user.id, username: user.username } });
}));

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', authCookieOptions());
  return res.json({ success: true });
});

authRouter.post('/register', asyncRoute(async (req: Request, res: Response) => {
  if (!isPublicRegistrationEnabled()) {
    return res.status(404).json({ success: false, error: '注册功能未开放' });
  }
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  if (!username || !isAcceptablePassword(password)) {
    return res.status(400).json({ success: false, error: '请输入用户名和密码' });
  }
  if (!isAcceptablePassword(password, true)) {
    return res.status(400).json({ success: false, error: '密码至少10位' });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return res.status(409).json({ success: false, error: '用户名已存在' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash },
    select: { id: true, username: true },
  });

  return res.status(201).json({ success: true, data: user });
}));
