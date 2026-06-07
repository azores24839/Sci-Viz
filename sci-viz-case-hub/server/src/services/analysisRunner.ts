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

    const isAnalysisFailure = visionResult.confidence <= 0
      && /失败|无法读取|等待AI分析/.test(visionResult.ai_summary || '');
    const reviewStatus = isAnalysisFailure
      ? 'analysis_failed'
      : visionResult.confidence >= 0.8
        ? 'needs_review'
        : 'low_confidence_review';

    await prisma.visualCase.update({
      where: { id: caseId },
      data: {
        mediaType: visionResult.media_type,
        contentType: visionResult.content_type,
        discipline: visionResult.discipline,
        technicalMethod: visionResult.technical_method,
        composition: visionResult.composition,
        colorTone: visionResult.color_tone,
        useCase: JSON.stringify(visionResult.use_case),
        functionalPurpose: visionResult.functional_purpose || undefined,
        distributionMedium: visionResult.distribution_medium || undefined,
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
