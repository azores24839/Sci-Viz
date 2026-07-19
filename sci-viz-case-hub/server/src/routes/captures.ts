import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../prisma.js';
import { deleteSavedImage, ImageValidationError, saveImage, saveImageFromUrl, type SavedImage } from '../services/image.js';
import { enqueueAnalysis } from '../services/analysisRunner.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { normalizeHttpUrl, toTrimmedString } from '../utils/httpSafety.js';
import { remapImagePath } from '../services/oss.js';
import { sendInternalError } from '../middleware/requestContext.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 12 } });
export const capturesRouter = Router();

capturesRouter.post('/captures', upload.single('image_file'), async (req: Request, res: Response) => {
  let imageResult: SavedImage | null = null;
  try {
    const sourceUrl = normalizeHttpUrl(req.body.source_url) || '';
    const imageUrl = normalizeHttpUrl(req.body.image_url) || '';
    const pageTitle = toTrimmedString(req.body.page_title, 500);
    const contextText = toTrimmedString(req.body.context_text, 5000);
    const captureType = toTrimmedString(req.body.capture_type, 50) || 'image';
    const videoUrl = toTrimmedString(req.body.video_url, 500) || '';
    const videoPlatform = toTrimmedString(req.body.video_platform, 50) || '';
    const videoDuration = parseInt(req.body.video_duration) || 0;

    if (req.file) {
      imageResult = await saveImage(req.file.buffer, req.file.originalname.split('.').pop() || 'jpg');
    } else if (imageUrl) {
      try {
        imageResult = await saveImageFromUrl(imageUrl);
      } catch (err) {
        console.warn(`[${req.requestId}] [captures] Failed to download image from URL:`, err);
        res.status(422).json({ success: false, error: '无法安全下载或解析该远程图片', requestId: req.requestId });
        return;
      }
    }

    if (!req.file && req.body.image_url && !imageUrl) {
      res.status(400).json({ success: false, error: 'image_url must be a valid public http/https URL' });
      return;
    }

    const sourceDomain = sourceUrl ? new URL(sourceUrl).hostname : '';

    if (imageResult) {
      const duplicate = await findDuplicateCase(imageResult.imageHash);
      if (duplicate) {
        await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
        if (duplicate.matchType === 'deleted') {
          res.status(409).json({ success: false, duplicate: true, matchType: 'deleted', error: '这张图片此前已在预审中删除，不会重新采集' });
          return;
        }
        res.json({
          success: true,
          duplicate: true,
          matchType: duplicate.matchType,
          distance: duplicate.distance,
          data: {
            ...duplicate.caseEntry,
            imagePath: remapImagePath(duplicate.caseEntry.imagePath),
            thumbnailPath: remapImagePath(duplicate.caseEntry.thumbnailPath),
          },
        });
        return;
      }
    }

    const caseEntry = await prisma.visualCase.create({
      data: {
        sourceUrl,
        sourceDomain,
        pageTitle,
        imageUrl,
        imagePath: imageResult?.imagePath || '',
        thumbnailPath: imageResult?.thumbnailPath || '',
        imageHash: imageResult?.imageHash || '',
        contextText,
        captureType,
        videoUrl,
        videoPlatform,
        videoDuration,
        reviewStatus: 'pending_ai_analysis',
      },
    });

    res.json({
      success: true,
      data: {
        ...caseEntry,
        imagePath: remapImagePath(caseEntry.imagePath),
        thumbnailPath: remapImagePath(caseEntry.thumbnailPath),
      },
    });

    // Fire-and-forget: OCR + Vision analysis runs in background
    if (imageResult?.imagePath) {
      if (enqueueAnalysis(caseEntry.id, imageResult.imagePath, pageTitle, sourceUrl, contextText) === 'full') {
        console.warn(`[${req.requestId}] [captures] Analysis queue is full; case ${caseEntry.id} will be recovered later`);
      }
    }
  } catch (error) {
    if (imageResult) {
      await deleteSavedImage(imageResult.imagePath, imageResult.thumbnailPath);
    }
    if (error instanceof ImageValidationError) {
      res.status(400).json({ success: false, error: '上传的图片无效、格式不受支持或尺寸超出限制' });
      return;
    }
    sendInternalError(req, res, 'capture creation', error);
  }
});
