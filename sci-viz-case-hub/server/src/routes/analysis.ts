import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { enqueueAnalysis } from '../services/analysisRunner.js';
import { sendInternalError } from '../middleware/requestContext.js';
import { clampInt } from '../utils/httpSafety.js';

export const analysisRouter = Router();

analysisRouter.post('/cases/batch/analyze', async (req: Request, res: Response) => {
  try {
    const { statuses, limit } = req.body;
    const where: Record<string, unknown> = {};
    if (Array.isArray(statuses) && statuses.length > 0) {
      where.reviewStatus = { in: statuses };
    }
    const maxLimit = clampInt(limit, 50, 1, 200);

    const cases = await prisma.visualCase.findMany({
      where,
      take: maxLimit,
      orderBy: { createdAt: 'asc' },
    });

    let queued = 0;
    let deferred = 0;
    let duplicate = 0;
    let missingImage = 0;
    for (const c of cases) {
      if (!c.imagePath) {
        missingImage += 1;
        continue;
      }
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { reviewStatus: 'pending_ai_analysis' },
      });
      const status = enqueueAnalysis(c.id, c.imagePath, c.pageTitle, c.sourceUrl, c.contextText);
      if (status === 'queued') queued += 1;
      else if (status === 'duplicate') duplicate += 1;
      else deferred += 1;
    }

    res.status(202).json({ success: true, total: cases.length, queued, duplicate, deferred, missingImage });
  } catch (error) {
    sendInternalError(req, res, 'batch analysis', error);
  }
});

analysisRouter.post('/cases/:id/analyze', async (req: Request, res: Response) => {
  try {
    const caseEntry = await prisma.visualCase.findUnique({
      where: { id: req.params.id },
    });

    if (!caseEntry) {
      res.status(404).json({ success: false, error: 'Case not found' });
      return;
    }
    if (!caseEntry.imagePath) {
      res.status(422).json({ success: false, error: '该案例没有可分析的本地图片' });
      return;
    }

    await prisma.visualCase.update({
      where: { id: req.params.id },
      data: { reviewStatus: 'pending_ai_analysis' },
    });

    const status = enqueueAnalysis(
      caseEntry.id,
      caseEntry.imagePath,
      caseEntry.pageTitle,
      caseEntry.sourceUrl,
      caseEntry.contextText,
    );
    if (status === 'full') {
      res.status(503).json({ success: false, error: '分析队列已满，请稍后重试' });
      return;
    }
    res.status(202).json({ success: true, status });
  } catch (error) {
    sendInternalError(req, res, 'case analysis', error);
  }
});
