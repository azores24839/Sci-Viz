import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../prisma.js';
import { deleteSavedImage, saveImage, saveImageFromUrl, type SavedImage } from '../services/image.js';
import { runAnalysis } from '../services/analysisRunner.js';
import { findDuplicateCase } from '../services/dedupe.js';
import { normalizeHttpUrl, toTrimmedString } from '../utils/httpSafety.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
export const capturesRouter = Router();

capturesRouter.post('/captures', upload.single('image_file'), async (req: Request, res: Response) => {
  try {
    const sourceUrl = normalizeHttpUrl(req.body.source_url) || '';
    const imageUrl = normalizeHttpUrl(req.body.image_url) || '';
    const pageTitle = toTrimmedString(req.body.page_title, 500);
    const contextText = toTrimmedString(req.body.context_text, 5000);
    const captureType = toTrimmedString(req.body.capture_type, 50) || 'image';

    let imageResult: SavedImage | null = null;

    if (req.file) {
      imageResult = await saveImage(req.file.buffer, req.file.originalname.split('.').pop() || 'jpg');
    } else if (imageUrl) {
      try {
        imageResult = await saveImageFromUrl(imageUrl);
      } catch (err) {
        console.warn('[captures] Failed to download image from URL:', (err as Error).message);
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
        res.json({
          success: true,
          duplicate: true,
          matchType: duplicate.matchType,
          distance: duplicate.distance,
          data: duplicate.caseEntry,
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
        reviewStatus: 'pending_ai_analysis',
      },
    });

    res.json({ success: true, data: caseEntry });

    // Fire-and-forget: OCR + Vision analysis runs in background
    if (imageResult?.imagePath) {
      runAnalysis(caseEntry.id, imageResult.imagePath, pageTitle, sourceUrl, contextText);
    }
  } catch (error) {
    console.error('[captures] Error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
