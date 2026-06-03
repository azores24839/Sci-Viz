import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { prisma } from '../prisma.js';
import { backupDatabase } from '../utils/backup.js';
import { analyzeImage, classifyMediaType } from '../services/vision.js';
import { normalizeTaxonomyValue } from '../services/taxonomy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const OCR_BINARY = path.join(SERVER_ROOT, '.tmp', 'ocr_image');
const OCR_SWIFT_SCRIPT = path.join(SERVER_ROOT, 'scripts', 'ocr_image.swift');
const execFileAsync = promisify(execFile);

export const processingRouter = Router();

function localPathFromWebPath(webPath: string): string {
  if (!webPath) return '';
  if (webPath.startsWith('/uploads/')) {
    return path.join(SERVER_ROOT, webPath.replace(/^\//, ''));
  }
  if (webPath.startsWith('/journal_covers/')) {
    return path.join(REPO_ROOT, webPath.replace(/^\//, ''));
  }
  return '';
}

function mimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function cleanOcrText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, block => block.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
    .replace(/^["']|["']$/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function ocrLocalImage(filePath: string): Promise<string> {
  try {
    await fs.promises.access(OCR_BINARY);
    const { stdout } = await execFileAsync(OCR_BINARY, [filePath], {
      maxBuffer: 1024 * 1024 * 4,
      timeout: 30000,
    });
    return cleanOcrText(stdout);
  } catch {
    const { stdout } = await execFileAsync('swift', [OCR_SWIFT_SCRIPT, filePath], {
      maxBuffer: 1024 * 1024 * 4,
      timeout: 30000,
    });
    return cleanOcrText(stdout);
  }
}

async function ocrRemoteImage(imageUrl: string, context: string): Promise<string> {
  const config = getVisionConfig();
  if (!config.url || !config.key || config.key.includes('your-')) {
    return '';
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: process.env.OCR_VISION_MODEL || 'qwen/qwen3-vl-8b-instruct',
      messages: [
        {
          role: 'system',
          content: 'You are an OCR engine. Extract visible text from the image. Return plain text only. Keep line breaks where useful. Do not describe the image. If there is no readable text, return an empty string.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extract all visible text from this image.${context ? `\nContext: ${context}` : ''}` },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!response.ok) return '';
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
  };
  return cleanOcrText(data.choices?.[0]?.message?.content || '');
}

function getVisionConfig() {
  return {
    url: process.env.VISION_API_URL || '',
    key: process.env.VISION_API_KEY || '',
  };
}

async function findLocalImage(c: { imagePath: string; thumbnailPath: string }): Promise<string> {
  for (const webPath of [c.imagePath, c.thumbnailPath]) {
    if (!webPath) continue;
    const filePath = localPathFromWebPath(webPath);
    if (!filePath) continue;
    try {
      await fs.promises.access(filePath);
      return filePath;
    } catch {}
  }
  return '';
}

// POST /api/processing/quality-check
processingRouter.post('/processing/quality-check', async (req, res) => {
  try {
    const { scope, caseIds } = req.body;
    const backupPath = backupDatabase();

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
      backupPath,
      summary: { total: cases.length, ok, broken, lowQuality },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/processing/ocr
processingRouter.post('/processing/ocr', async (req, res) => {
  try {
    const { scope, caseIds } = req.body;
    const backupPath = backupDatabase();

    let cases: Array<{
      id: string;
      imagePath: string;
      thumbnailPath: string;
      imageUrl: string;
      pageTitle: string;
      caseTitle: string;
      contextText: string;
    }>;

    if (caseIds?.length) {
      cases = await prisma.visualCase.findMany({
        where: { id: { in: caseIds } },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          pageTitle: true, caseTitle: true, contextText: true,
        },
      });
    } else {
      cases = await prisma.visualCase.findMany({
        where: {
          ocrText: '',
          reviewStatus: { notIn: ['rejected'] },
        },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          pageTitle: true, caseTitle: true, contextText: true,
        },
        take: 200,
      });
    }

    let updated = 0, skipped = 0, failed = 0;

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      try {
        const localImage = await findLocalImage(c);
        if (localImage) {
          const text = await ocrLocalImage(localImage);
          if (text) {
            await prisma.visualCase.update({
              where: { id: c.id },
              data: { ocrText: text },
            });
            updated++;
          } else {
            skipped++;
          }
        } else if (c.imageUrl) {
          const context = [c.caseTitle, c.pageTitle, c.contextText].filter(Boolean).join('\n').slice(0, 1200);
          const text = await ocrRemoteImage(c.imageUrl, context);
          if (text) {
            await prisma.visualCase.update({
              where: { id: c.id },
              data: { ocrText: text },
            });
            updated++;
          } else {
            skipped++;
          }
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    res.json({
      success: true,
      backupPath,
      summary: { total: cases.length, updated, skipped, failed },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/processing/classify
processingRouter.post('/processing/classify', async (req, res) => {
  try {
    const { scope, caseIds } = req.body;
    const backupPath = backupDatabase();

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

        const reviewStatus = result.confidence >= 0.8
          ? 'needs_review'
          : 'low_confidence_review';

        await prisma.visualCase.update({
          where: { id: c.id },
          data: {
            mediaType: result.media_type,
            contentType: result.content_type,
            discipline: result.discipline,
            visualStyle: result.visual_style,
            composition: result.composition,
            colorTone: result.color_tone,
            useCase: JSON.stringify(result.use_case),
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
      backupPath,
      summary: { total: cases.length, classified, skipped, failed },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/processing/reclassify-media-type
processingRouter.post('/processing/reclassify-media-type', async (req, res) => {
  try {
    const { caseIds, limit = 100 } = req.body;

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
        where: { mediaType: '不确定', sourceDomain: 'www.nature.com', visualStyle: '顶刊封面', imageUrl: { not: '' } },
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/processing/queue-status - returns counts for kanban panels
processingRouter.get('/processing/queue-status', async (_req, res) => {
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
          ocrText: { not: '' },
          reviewStatus: { in: ['pending_ai_analysis', 'needs_review', 'low_confidence_review'] },
          OR: [
            { mediaType: '' },
            { mediaType: '不确定' },
          ],
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
          { key: 'pending_classify', label: '待分类', count: pendingClassify, description: '有图片和 OCR，但 AI 分类不完整' },
          { key: 'needs_review', label: '待确认', count: needsReview, description: 'AI 分析完成，等待人工确认' },
          { key: 'low_confidence', label: '需人工判断', count: lowConfidence, description: 'AI 结果不确定，需要人看' },
          { key: 'approved', label: '已入库', count: approved, description: '已通过审核，案例库可见' },
          { key: 'failed', label: '处理失败', count: failed, description: '图片损坏、下载失败或分析失败' },
        ],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
