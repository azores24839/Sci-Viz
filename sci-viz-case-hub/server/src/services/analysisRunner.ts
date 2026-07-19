import { prisma } from '../prisma.js';
import { performOCR } from './ocr.js';
import { analyzeImage } from './vision.js';
import type { VisionApiConfig } from './visionConfig.js';
import { KeyedTaskQueue, type EnqueueStatus } from './taskQueue.js';

const analysisQueue = new KeyedTaskQueue(3, 500, error => {
  console.error('[analysis-queue] Unhandled task failure:', error);
});

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

    await runVisionAnalysis(caseId, imagePath, pageTitle, sourceUrl, contextText, ocrResult.ocr_text);
  } catch (err) {
    console.error(`[analysis] Error for case ${caseId}:`, err);
    await prisma.visualCase.update({
      where: { id: caseId },
      data: { reviewStatus: 'analysis_failed' },
    }).catch(() => {});
  }
}

export async function runVisionAnalysis(
  caseId: string,
  imagePath: string,
  pageTitle: string,
  sourceUrl: string,
  contextText: string,
  ocrText = '',
  configOverride?: VisionApiConfig,
): Promise<{ success: boolean; reviewStatus: string; errorCode?: string; errorMessage?: string }> {
  const visionResult = await analyzeImage({
    imagePath,
    ocrText,
    pageTitle,
    sourceUrl,
    contextText,
  }, configOverride);

  const isAnalysisFailure = Boolean(visionResult.failure) || (visionResult.confidence <= 0
    && /失败|无法读取|等待AI分析/.test(visionResult.ai_summary || ''));
  const reviewStatus = isAnalysisFailure
    ? 'analysis_failed'
    : visionResult.confidence >= 0.8
      ? 'needs_review'
      : 'low_confidence_review';

  const existingCase = await prisma.visualCase.findUnique({
    where: { id: caseId },
    select: { distributionMedium: true, imageUrl: true },
  });
  const preSetDistributionMedium = existingCase?.distributionMedium || '';
  const isGifByUrl = /\.gif(\?|$)/i.test(existingCase?.imageUrl || '');
  const finalDistributionMedium = preSetDistributionMedium === '动图' || isGifByUrl
    ? '动图'
    : (visionResult.distribution_medium || undefined);

  const finalReviewStatus = sourceUrl ? reviewStatus : 'source_missing';
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
      distributionMedium: finalDistributionMedium,
      aiSummary: visionResult.ai_summary,
      caseTitle: visionResult.case_title,
      borrowablePoints: JSON.stringify(visionResult.borrowable_points),
      riskNotes: JSON.stringify(visionResult.risk_notes),
      confidence: visionResult.confidence,
      reviewStatus: finalReviewStatus,
    },
  });

  console.log(`[analysis] Case ${caseId} Qwen vision analysis complete`);
  // Missing provenance is a review issue, not a vision-model failure. The Qwen
  // result is still valid and should count as analyzed in job progress.
  return {
    success: !isAnalysisFailure,
    reviewStatus: finalReviewStatus,
    errorCode: visionResult.failure?.code,
    errorMessage: visionResult.failure?.message,
  };
}

export function enqueueAnalysis(
  caseId: string,
  imagePath: string,
  pageTitle: string,
  sourceUrl: string,
  contextText: string,
): EnqueueStatus {
  return analysisQueue.tryEnqueue(caseId, () => runAnalysis(caseId, imagePath, pageTitle, sourceUrl, contextText));
}
