import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureUploadDirs } from './services/image.js';
import { seedVideos } from './services/videoSeed.js';
import { prisma } from './prisma.js';
import { authRouter } from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import { capturesRouter } from './routes/captures.js';
import { casesRouter } from './routes/cases.js';
import { analysisRouter } from './routes/analysis.js';
import { crawlRouter } from './routes/crawl.js';
import { poolRouter } from './routes/pool.js';
import { collectionRouter } from './routes/collection.js';
import { processingRouter } from './routes/processing.js';
import { insightsRouter } from './routes/insights.js';
import { studioRouter } from './routes/studio.js';
import { assertSecurityConfig, isProduction } from './config/security.js';
import { requestContext, sendInternalError } from './middleware/requestContext.js';
import { createConcurrencyLimit } from './middleware/concurrencyLimit.js';
import { markInterruptedCrawlJobs } from './crawler/sourceJobRunner.js';
import { recoverOcrJobs } from './services/ocrJobs.js';
import { recoverAnalysisJobs } from './services/analysisJobs.js';
import { ensureImageDedupeSchema } from './services/dedupe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.argv.includes('--seed-videos')) {
  const dryRun = process.argv.includes('--dry-run');
  ensureUploadDirs().then(() =>
    seedVideos(dryRun).then((result) => {
      console.log(`Done: ${result.seeded} seeded, ${result.skipped} skipped, ${result.errors.length} errors`);
      if (result.errors.length > 0) {
        result.errors.forEach(e => console.error(e));
        process.exit(1);
      }
      process.exit(0);
    }).catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    })
  );
  // Do not start the HTTP server for CLI commands
} else {
  assertSecurityConfig();
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const allowDevelopmentOrigins = !isProduction();
  const localDevOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
  const tryCloudflarePattern = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

  if (isProduction()) app.set('trust proxy', 1);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: isProduction() ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    } : false,
  }));
  app.use(requestContext);

  app.use(cors({
    origin(origin, callback) {
      const allowedDevelopmentOrigin = allowDevelopmentOrigins && (
        localDevOriginPattern.test(origin ?? '')
        || origin?.startsWith('chrome-extension://')
        || tryCloudflarePattern.test(origin ?? '')
      );
      if (!origin || allowedOrigins.includes(origin) || allowedDevelopmentOrigin) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS'));
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: '请求过于频繁，请稍后重试' },
  });
  const studioRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: { code: 'STUDIO_API_RATE_LIMITED', message: 'Too many Studio requests.' } },
  });
  const authStatusRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: '请求过于频繁，请稍后重试' },
  });
  const apiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: '请求过于频繁，请稍后重试' },
  });
  const captureRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: '上传请求过于频繁，请稍后重试' },
  });
  const captureConcurrencyLimit = createConcurrencyLimit(2);
  const expensiveTaskRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: '高负载任务请求过于频繁，请稍后重试' },
  });
  const processingConcurrencyLimit = createConcurrencyLimit(1);
  const crawlConcurrencyLimit = createConcurrencyLimit(1);

  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  app.use('/journal_covers', express.static(path.join(__dirname, '..', '..', '..', 'journal_covers')));

  app.get('/api/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error(`[health] database readiness failed requestId=${req.requestId ?? 'unknown'}`);
      res.status(503).json({ status: 'not_ready', requestId: req.requestId });
    }
  });

  app.use('/api/auth/login', authRateLimit);
  app.use('/api/auth/register', authRateLimit);
  app.use('/api/auth', authStatusRateLimit, authRouter);
  app.use('/api/studio', studioRateLimit, studioRouter);
  app.use('/api', apiRateLimit);
  app.use('/api', authMiddleware);
  app.use('/api/captures', captureRateLimit, captureConcurrencyLimit);
  app.use('/api/processing', (req, res, next) => {
    if (req.method === 'GET') {
      next();
      return;
    }
    expensiveTaskRateLimit(req, res, () => processingConcurrencyLimit(req, res, next));
  });
  app.use('/api/crawl', (req, res, next) => {
    if (req.method === 'GET') {
      next();
      return;
    }
    expensiveTaskRateLimit(req, res, () => crawlConcurrencyLimit(req, res, next));
  });
  app.use('/api', capturesRouter);
  app.use('/api', casesRouter);
  app.use('/api', analysisRouter);
  app.use('/api', crawlRouter);
  app.use('/api', poolRouter);
  app.use('/api', collectionRouter);
  app.use('/api', processingRouter);
  app.use('/api', insightsRouter);

  // Production: serve built frontend static files
  const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res, next) => {
    // Skip API routes
    if (_req.path.startsWith('/api/') || _req.path.startsWith('/uploads/') || _req.path.startsWith('/journal_covers/')) {
      return next();
    }
    res.sendFile(path.join(webDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    if (error instanceof Error && error.message === 'Origin is not allowed by CORS') {
      return res.status(403).json({ success: false, error: '请求来源不被允许', requestId: req.requestId });
    }
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ success: false, error: '上传请求不符合文件大小或数量限制', requestId: req.requestId });
    }
    return sendInternalError(req, res, 'unhandled request', error);
  });

  await ensureUploadDirs();
  await ensureImageDedupeSchema();

  void markInterruptedCrawlJobs().catch(error => {
    console.error('[crawl-recovery] failed to mark interrupted jobs', error);
  });
  void recoverOcrJobs().catch(error => {
    console.error('[ocr-recovery] failed to recover OCR job', error);
  });
  void recoverAnalysisJobs().catch(error => {
    console.error('[analysis-recovery] failed to recover Qwen analysis job', error);
  });
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] Received ${signal}, shutting down...`);
    server.closeAllConnections();
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      console.log('[server] Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      console.warn('[server] Shutdown timed out, forcing exit');
      process.exit(1);
    }, 4000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export default undefined as unknown;
