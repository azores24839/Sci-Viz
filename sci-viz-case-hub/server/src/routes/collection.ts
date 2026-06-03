import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { ensureDefaultCollectionKpis, getCollectionKpiProgress, getMostNeededKpis } from '../services/collectionKpi.js';
import { isKpiDimension } from '../services/taxonomy.js';
import { clampInt, toTrimmedString } from '../utils/httpSafety.js';

export const collectionRouter = Router();

collectionRouter.post('/collection/kpis/init', async (_req: Request, res: Response) => {
  try {
    await ensureDefaultCollectionKpis();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

collectionRouter.get('/collection/kpis', async (_req: Request, res: Response) => {
  try {
    const progress = await getCollectionKpiProgress();
    res.json({ success: true, data: progress });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

collectionRouter.get('/collection/kpis/needed', async (req: Request, res: Response) => {
  try {
    const limit = clampInt(req.query.limit, 10, 1, 50);
    const needed = await getMostNeededKpis(limit);
    res.json({ success: true, data: needed });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

collectionRouter.patch('/collection/kpis/:id', async (req: Request, res: Response) => {
  try {
    const id = clampInt(req.params.id, 0, 1, Number.MAX_SAFE_INTEGER);
    if (!id) {
      res.status(400).json({ success: false, error: 'Invalid KPI id' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (req.body.targetCount !== undefined) {
      updateData.targetCount = clampInt(req.body.targetCount, 0, 0, 100000);
    }
    if (req.body.priority !== undefined) {
      updateData.priority = clampInt(req.body.priority, 50, 0, 100);
    }
    if (req.body.enabled !== undefined) {
      updateData.enabled = req.body.enabled === true;
    }
    if (req.body.notes !== undefined) {
      updateData.notes = toTrimmedString(req.body.notes, 1000);
    }

    const kpi = await prisma.collectionKpi.update({
      where: { id },
      data: updateData,
    });
    res.json({ success: true, data: kpi });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

collectionRouter.post('/collection/kpis', async (req: Request, res: Response) => {
  try {
    const dimension = toTrimmedString(req.body.dimension, 50);
    const category = toTrimmedString(req.body.category, 100);
    if (!isKpiDimension(dimension) || !category) {
      res.status(400).json({ success: false, error: 'dimension and category are required' });
      return;
    }

    const kpi = await prisma.collectionKpi.upsert({
      where: {
        dimension_category: {
          dimension,
          category,
        },
      },
      update: {
        targetCount: clampInt(req.body.targetCount, 100, 0, 100000),
        priority: clampInt(req.body.priority, 50, 0, 100),
        enabled: req.body.enabled !== false,
        notes: toTrimmedString(req.body.notes, 1000),
      },
      create: {
        dimension,
        category,
        targetCount: clampInt(req.body.targetCount, 100, 0, 100000),
        priority: clampInt(req.body.priority, 50, 0, 100),
        enabled: req.body.enabled !== false,
        notes: toTrimmedString(req.body.notes, 1000),
      },
    });
    res.json({ success: true, data: kpi });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
