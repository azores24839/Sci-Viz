import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureUploadDirs } from './services/image.js';
import { seedVideos } from './services/videoSeed.js';
import { startAnalysisRecovery, stopAnalysisRecovery } from './services/analysisRecovery.js';
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
  const app = express();
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  const localDevOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
  const tryCloudflarePattern = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || localDevOriginPattern.test(origin) || origin.startsWith('chrome-extension://') || tryCloudflarePattern.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS'));
    },
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  app.use('/journal_covers', express.static(path.join(__dirname, '..', '..', '..', 'journal_covers')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', authMiddleware);
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

  ensureUploadDirs();

  startAnalysisRecovery();

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] Received ${signal}, shutting down...`);
    stopAnalysisRecovery();
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
