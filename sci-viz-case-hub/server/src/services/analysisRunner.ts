import { prisma } from '../prisma.js';
import { performOCR } from './ocr.js';
import { analyzeImage } from './vision.js';

export async function runAnalysis(
  caseId: string,
  imagePath: string,
  pageTitle: string,
  sourceUrl: string,
  contextText: string,
) {
  try {
    const ocrResult = await performOCR(imagePath);
    await prisma.visualCase.update({
      where: { id: caseId },
      data: { ocrText: ocrResult.ocr_text },
    });

    const visionResult = await analyzeImage({
      imagePath,
      ocrText: ocrResult.ocr_text,
      pageTitle,
      sourceUrl,
      contextText,
    });

    const reviewStatus = visionResult.confidence >= 0.8
      ? 'needs_review'
      : 'low_confidence_review';

    await prisma.visualCase.update({
      where: { id: caseId },
      data: {
        mediaType: visionResult.media_type,
        contentType: visionResult.content_type,
        discipline: visionResult.discipline,
        visualStyle: visionResult.visual_style,
        composition: visionResult.composition,
        colorTone: visionResult.color_tone,
        useCase: JSON.stringify(visionResult.use_case),
        aiSummary: visionResult.ai_summary,
        caseTitle: visionResult.case_title,
        borrowablePoints: JSON.stringify(visionResult.borrowable_points),
        riskNotes: JSON.stringify(visionResult.risk_notes),
        confidence: visionResult.confidence,
        reviewStatus: sourceUrl ? reviewStatus : 'source_missing',
      },
    });

    console.log(`[analysis] Case ${caseId} analysis complete`);
  } catch (err) {
    console.error(`[analysis] Error for case ${caseId}:`, err);
    await prisma.visualCase.update({
      where: { id: caseId },
      data: { reviewStatus: 'analysis_failed' },
    }).catch(() => {});
  }
}
