import { Router } from 'express';
import { sendInternalError } from '../middleware/requestContext.js';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../prisma.js';
import { backupDatabase } from '../utils/backup.js';
import { analyzeImage, classifyMediaType } from '../services/vision.js';
import { normalizeTaxonomyValue } from '../services/taxonomy.js';
import { normalizeCaseIds } from '../services/processingInput.js';
import {
  cancelOcrJob,
  createOcrJob,
  findLocalImage,
  getLatestOcrJob,
  getOcrJob,
  isActiveOcrStatus,
} from '../services/ocrJobs.js';
import {
  cancelAnalysisJob,
  createAnalysisJob,
  getAnalysisJob,
  getLatestAnalysisJob,
} from '../services/analysisJobs.js';

export const processingRouter = Router();

// POST /api/processing/quality-check
processingRouter.post('/processing/quality-check', async (req, res) => {
  try {
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    if (!caseIds) return res.status(400).json({ success: false, error: 'caseIds 必须是不超过 200 项的有效字符串数组' });
    await backupDatabase();

    let cases: Array<{ id: string; imagePath: string; thumbnailPath: string; imageUrl: string }>;

    if (caseIds?.length) {
      cases = await prisma.visualCase.findMany({
        where: { id: { in: caseIds } },
        select: { id: true, imagePath: true, thumbnailPath: true, imageUrl: true },
      });
    } else {
      cases = await prisma.visualCase.findMany({
        where: {
          reviewStatus: { notIn: ['rejected'] },
        },
        select: { id: true, imagePath: true, thumbnailPath: true, imageUrl: true },
        take: 500,
      });
    }

    let ok = 0, broken = 0, lowQuality = 0;

    for (const c of cases) {
      const localFile = await findLocalImage(c);

      if (!localFile) {
        if (!c.imageUrl) {
          await prisma.visualCase.update({
            where: { id: c.id },
            data: { manualNotes: `[质量检查] 图片缺失: 无本地文件且无远程URL` },
          }).catch(() => {});
          broken++;
          continue;
        }
        ok++;
        continue;
      }

      try {
        const metadata = await sharp(localFile).metadata();
        const stats = await fs.promises.stat(localFile);

        if (!metadata.width || !metadata.height || !metadata.format) {
          await prisma.visualCase.update({
            where: { id: c.id },
            data: { manualNotes: `[质量检查] 图片损坏: 无法读取元数据` },
          }).catch(() => {});
          broken++;
          continue;
        }

        if (metadata.width < 100 || metadata.height < 100) {
          await prisma.visualCase.update({
            where: { id: c.id },
            data: { manualNotes: `[质量检查] 图片过小: ${metadata.width}x${metadata.height}` },
          }).catch(() => {});
          lowQuality++;
          continue;
        }

        if (stats.size < 10 * 1024) {
          await prisma.visualCase.update({
            where: { id: c.id },
            data: { manualNotes: `[质量检查] 文件过小: ${Math.round(stats.size / 1024)}KB` },
          }).catch(() => {});
          lowQuality++;
          continue;
        }

        ok++;
      } catch {
        await prisma.visualCase.update({
          where: { id: c.id },
          data: { manualNotes: `[质量检查] 图片损坏: sharp 无法打开` },
        }).catch(() => {});
        broken++;
      }
    }

    res.json({
      success: true,
      backupCreated: true,
      summary: { total: cases.length, ok, broken, lowQuality },
    });
  } catch (err: unknown) {
    sendInternalError(req, res, 'image quality processing', err);
  }
});

// POST /api/processing/ocr/jobs - starts a durable background OCR job.
processingRouter.post('/processing/ocr/jobs', async (req, res) => {
  try {
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    if (!caseIds) return res.status(400).json({ success: false, error: 'caseIds 必须是不超过 200 项的有效字符串数组' });
    const result = await createOcrJob(caseIds);
    return res.status(result.created ? 202 : 200).json({ success: true, data: result.job, existing: !result.created });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'start OCR job', err);
  }
});

// GET /api/processing/ocr/jobs/latest - restores progress after navigation or refresh.
processingRouter.get('/processing/ocr/jobs/latest', async (req, res) => {
  try {
    return res.json({ success: true, data: await getLatestOcrJob() });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'get latest OCR job', err);
  }
});

processingRouter.get('/processing/ocr/jobs/:jobId', async (req, res) => {
  try {
    const job = await getOcrJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'OCR 任务不存在' });
    return res.json({ success: true, data: job });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'get OCR job', err);
  }
});

processingRouter.post('/processing/ocr/jobs/:jobId/cancel', async (req, res) => {
  try {
    const job = await cancelOcrJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'OCR 任务不存在' });
    return res.json({ success: true, data: job });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'cancel OCR job', err);
  }
});

// Legacy synchronous endpoint. It now uses the same durable worker and active-job lock.
processingRouter.post('/processing/ocr', async (req, res) => {
  try {
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    if (!caseIds) return res.status(400).json({ success: false, error: 'caseIds 必须是不超过 200 项的有效字符串数组' });
    const result = await createOcrJob(caseIds);
    if (!result.created && isActiveOcrStatus(result.job.status)) {
      return res.status(409).json({ success: false, error: '已有 OCR 任务正在运行', data: result.job });
    }

    let job = result.job;
    while (isActiveOcrStatus(job.status)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const latest = await getOcrJob(job.id);
      if (!latest) return res.status(500).json({ success: false, error: 'OCR 任务状态丢失' });
      job = latest;
    }
    if (job.status === 'failed') return res.status(500).json({ success: false, error: job.error || 'OCR 任务失败' });
    return res.json({
      success: true,
      backupCreated: true,
      summary: { total: job.total, updated: job.updated, skipped: job.skipped, failed: job.failed },
    });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'OCR processing', err);
  }
});

// Durable Qwen image-understanding jobs. OCR text is optional context, never a prerequisite.
processingRouter.post('/processing/analysis/jobs', async (req, res) => {
  try {
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    if (!caseIds) return res.status(400).json({ success: false, error: 'caseIds 必须是不超过 200 项的有效字符串数组' });
    const result = await createAnalysisJob(caseIds);
    return res.status(result.created ? 202 : 200).json({ success: true, data: result.job, existing: !result.created });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'start Qwen analysis job', err);
  }
});

processingRouter.get('/processing/analysis/jobs/latest', async (req, res) => {
  try {
    return res.json({ success: true, data: await getLatestAnalysisJob() });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'get latest Qwen analysis job', err);
  }
});

processingRouter.get('/processing/analysis/jobs/:jobId', async (req, res) => {
  try {
    const job = await getAnalysisJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Qwen 分析任务不存在' });
    return res.json({ success: true, data: job });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'get Qwen analysis job', err);
  }
});

processingRouter.post('/processing/analysis/jobs/:jobId/cancel', async (req, res) => {
  try {
    const job = await cancelAnalysisJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Qwen 分析任务不存在' });
    return res.json({ success: true, data: job });
  } catch (err: unknown) {
    return sendInternalError(req, res, 'cancel Qwen analysis job', err);
  }
});

// POST /api/processing/classify
processingRouter.post('/processing/classify', async (req, res) => {
  try {
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    if (!caseIds) return res.status(400).json({ success: false, error: 'caseIds 必须是不超过 200 项的有效字符串数组' });
    await backupDatabase();

    let cases: Array<{
      id: string;
      imagePath: string;
      thumbnailPath: string;
      imageUrl: string;
      ocrText: string;
      pageTitle: string;
      sourceUrl: string;
      contextText: string;
    }>;

    if (caseIds?.length) {
      cases = await prisma.visualCase.findMany({
        where: { id: { in: caseIds } },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          ocrText: true, pageTitle: true, sourceUrl: true, contextText: true,
        },
      });
    } else {
      cases = await prisma.visualCase.findMany({
        where: {
          ocrText: { not: '' },
          reviewStatus: { in: ['pending_ai_analysis', 'needs_review', 'low_confidence_review', 'analysis_failed'] },
        },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          ocrText: true, pageTitle: true, sourceUrl: true, contextText: true,
        },
        take: 50,
      });
    }

    let classified = 0, skipped = 0, failed = 0;

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      try {
        const imagePath = c.imagePath || c.thumbnailPath || c.imageUrl;

        const result = await analyzeImage({
          imagePath,
          ocrText: c.ocrText || '',
          pageTitle: c.pageTitle || '',
          sourceUrl: c.sourceUrl || '',
          contextText: c.contextText || '',
        });

        const isAnalysisFailure = result.confidence <= 0 && /失败|无法读取|等待AI分析/.test(result.ai_summary || '');
        const reviewStatus = isAnalysisFailure
          ? 'analysis_failed'
          : result.confidence >= 0.8
            ? 'needs_review'
            : 'low_confidence_review';

        await prisma.visualCase.update({
          where: { id: c.id },
          data: {
            mediaType: result.media_type,
            contentType: result.content_type,
            discipline: result.discipline,
            technicalMethod: result.technical_method,
            composition: result.composition,
            colorTone: result.color_tone,
            useCase: JSON.stringify(result.use_case),
            functionalPurpose: result.functional_purpose || undefined,
            distributionMedium: result.distribution_medium || undefined,
            aiSummary: result.ai_summary,
            caseTitle: result.case_title,
            borrowablePoints: JSON.stringify(result.borrowable_points),
            riskNotes: JSON.stringify(result.risk_notes),
            confidence: result.confidence,
            reviewStatus: c.sourceUrl ? reviewStatus : 'source_missing',
          },
        });
        classified++;
      } catch (err) {
        console.error(`[processing:classify] failed for ${c.id}:`, err);
        failed++;
      }
    }

    res.json({
      success: true,
      backupCreated: true,
      summary: { total: cases.length, classified, skipped, failed },
    });
  } catch (err: unknown) {
    sendInternalError(req, res, 'classification processing', err);
  }
});

// POST /api/processing/reclassify-media-type
processingRouter.post('/processing/reclassify-media-type', async (req, res) => {
  try {
    const caseIds = normalizeCaseIds(req.body?.caseIds);
    if (!caseIds) return res.status(400).json({ success: false, error: 'caseIds 必须是不超过 200 项的有效字符串数组' });
    const limit = Math.min(Math.max(Number(req.body?.limit) || 100, 1), 500);

    let cases: Array<{
      id: string;
      imagePath: string;
      thumbnailPath: string;
      imageUrl: string;
      ocrText: string;
      pageTitle: string;
      contextText: string;
    }>;

    if (caseIds?.length) {
      cases = await prisma.visualCase.findMany({
        where: { id: { in: caseIds } },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          ocrText: true, pageTitle: true, contextText: true,
        },
      });
    } else {
      cases = await prisma.visualCase.findMany({
        where: { mediaType: '不确定', sourceDomain: 'www.nature.com', technicalMethod: '绘设', imageUrl: { not: '' } },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          ocrText: true, pageTitle: true, contextText: true,
        },
        take: Math.min(limit, 500),
      });
    }

    let updated = 0, skipped = 0, failed = 0;

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      try {
        let rawType = await classifyMediaType({
          imagePath: c.imagePath || c.thumbnailPath || c.imageUrl,
          ocrText: c.ocrText || '',
          pageTitle: c.pageTitle || '',
          contextText: c.contextText || '',
        });

        if (rawType === '不确定' && c.imageUrl && c.imageUrl.startsWith('http')) {
          rawType = await classifyMediaType({
            imagePath: c.imageUrl,
            ocrText: c.ocrText || '',
            pageTitle: c.pageTitle || '',
            contextText: c.contextText || '',
          });
        }

        const mediaType = normalizeTaxonomyValue('mediaType', rawType);

        await prisma.visualCase.update({
          where: { id: c.id },
          data: { mediaType },
        });
        updated++;
      } catch (err) {
        console.error(`[processing:reclassify] failed for ${c.id}:`, err);
        failed++;
      }
    }

    res.json({
      success: true,
      summary: { total: cases.length, updated, skipped, failed },
    });
  } catch (err: unknown) {
    sendInternalError(req, res, 'media type reclassification', err);
  }
});

// GET /api/processing/queue-status - returns counts for kanban panels
processingRouter.get('/processing/queue-status', async (req, res) => {
  try {
    const [
      pendingQuality,
      pendingOcr,
      pendingClassify,
      needsReview,
      lowConfidence,
      approved,
      failed,
    ] = await Promise.all([
      prisma.visualCase.count({ where: { reviewStatus: 'pending_ai_analysis' } }),
      prisma.visualCase.count({ where: { ocrText: '', reviewStatus: { notIn: ['rejected'] } } }),
      prisma.visualCase.count({
        where: {
          reviewStatus: { in: ['pending_ai_analysis', 'analysis_failed'] },
          OR: [{ imagePath: { not: '' } }, { thumbnailPath: { not: '' } }, { imageUrl: { not: '' } }],
        },
      }),
      prisma.visualCase.count({ where: { reviewStatus: 'needs_review' } }),
      prisma.visualCase.count({ where: { reviewStatus: 'low_confidence_review' } }),
      prisma.visualCase.count({ where: { reviewStatus: 'approved' } }),
      prisma.visualCase.count({ where: { reviewStatus: { in: ['analysis_failed', 'source_missing'] } } }),
    ]);

    res.json({
      success: true,
      data: {
        panels: [
          { key: 'pending_quality', label: '待质量检查', count: pendingQuality, description: '新采集但未确认图片是否可用' },
          { key: 'pending_ocr', label: '待 OCR', count: pendingOcr, description: '图片可用，但 OCR 文本为空' },
          { key: 'pending_classify', label: '待 Qwen 分析', count: pendingClassify, description: '直接理解图片内容；OCR 文字仅作辅助' },
          { key: 'needs_review', label: '待确认', count: needsReview, description: 'AI 分析完成，等待人工确认' },
          { key: 'low_confidence', label: '需人工判断', count: lowConfidence, description: 'AI 结果不确定，需要人看' },
          { key: 'approved', label: '已入库', count: approved, description: '已通过审核，案例库可见' },
          { key: 'failed', label: '处理失败', count: failed, description: '图片损坏、下载失败或分析失败' },
        ],
      },
    });
  } catch (err: unknown) {
    sendInternalError(req, res, 'processing queue status', err);
  }
});
