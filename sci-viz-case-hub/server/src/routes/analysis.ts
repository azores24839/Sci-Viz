import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { runAnalysis } from '../services/analysisRunner.js';

export const analysisRouter = Router();

analysisRouter.post('/cases/batch/analyze', async (req: Request, res: Response) => {
  try {
    const { statuses, limit } = req.body;
    const where: Record<string, unknown> = {};
    if (Array.isArray(statuses) && statuses.length > 0) {
      where.reviewStatus = { in: statuses };
    }
    const maxLimit = Math.min(parseInt(limit) || 50, 200);

    const cases = await prisma.visualCase.findMany({
      where,
      take: maxLimit,
      orderBy: { createdAt: 'asc' },
    });

    const queued: string[] = [];
    for (const c of cases) {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { reviewStatus: 'pending_ai_analysis' },
      });
      if (c.imagePath) {
        runAnalysis(c.id, c.imagePath, c.pageTitle, c.sourceUrl, c.contextText);
      }
      queued.push(c.id);
    }

    res.json({ success: true, total: cases.length, queued: queued.length });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
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

    await prisma.visualCase.update({
      where: { id: req.params.id },
      data: { reviewStatus: 'pending_ai_analysis' },
    });

    res.json({ success: true, message: 'Re-analysis queued' });

    if (caseEntry.imagePath) {
      runAnalysis(
        caseEntry.id,
        caseEntry.imagePath,
        caseEntry.pageTitle,
        caseEntry.sourceUrl,
        caseEntry.contextText,
      );
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
