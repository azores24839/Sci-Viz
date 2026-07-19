import { Prisma, type AnalysisJob } from '@prisma/client';
import { prisma } from '../prisma.js';
import { backupDatabase } from '../utils/backup.js';
import { runVisionAnalysis } from './analysisRunner.js';
import { resolveVisionConfig } from './userApiCredentials.js';
import { dedupeCaseIdsByImageHash } from './processingInput.js';

const ACTIVE_KEY = 'qwen-vision';
const ACTIVE_STATUSES = ['queued', 'running', 'cancelling'];
const MAX_ERROR_DETAILS = 25;

export interface AnalysisJobErrorDetail {
  caseId: string;
  caseTitle: string;
  code: string;
  message: string;
}

export interface AnalysisJobSnapshot {
  id: string;
  status: string;
  stage: string;
  total: number;
  processed: number;
  analyzed: number;
  skipped: number;
  failed: number;
  progress: number;
  currentCaseId: string;
  currentCaseTitle: string;
  errors: AnalysisJobErrorDetail[];
  error: string;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  finishedAt: string | null;
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function toAnalysisJobSnapshot(job: AnalysisJob): AnalysisJobSnapshot {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    total: job.totalCount,
    processed: job.processedCount,
    analyzed: job.analyzedCount,
    skipped: job.skippedCount,
    failed: job.failedCount,
    progress: job.totalCount === 0 ? 100 : Math.min(100, Math.round((job.processedCount / job.totalCount) * 100)),
    currentCaseId: job.currentCaseId,
    currentCaseTitle: job.currentCaseTitle,
    errors: parseJsonArray<AnalysisJobErrorDetail>(job.errorsJson),
    error: job.error,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

function errorDetail(caseId: string, caseTitle: string, code: string, message: string): AnalysisJobErrorDetail {
  return { caseId, caseTitle: caseTitle.slice(0, 120), code, message: message.slice(0, 240) };
}

async function finishJob(jobId: string, status: 'completed' | 'cancelled' | 'failed', error = ''): Promise<void> {
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: {
      status,
      stage: 'finished',
      activeKey: null,
      currentCaseId: '',
      currentCaseTitle: '',
      error,
      heartbeatAt: new Date(),
      finishedAt: new Date(),
    },
  });
}

async function recordFailure(job: AnalysisJob, index: number, detail: AnalysisJobErrorDetail): Promise<void> {
  const errors = parseJsonArray<AnalysisJobErrorDetail>(job.errorsJson);
  if (errors.length < MAX_ERROR_DETAILS) errors.push(detail);
  await prisma.analysisJob.update({
    where: { id: job.id },
    data: {
      nextIndex: index + 1,
      processedCount: { increment: 1 },
      failedCount: { increment: 1 },
      errorsJson: JSON.stringify(errors),
      heartbeatAt: new Date(),
    },
  });
}

async function runAnalysisJob(jobId: string): Promise<void> {
  let job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
  if (!job || !ACTIVE_STATUSES.includes(job.status)) return;
  if (job.cancelRequested || job.status === 'cancelling') {
    await finishJob(job.id, 'cancelled');
    return;
  }

  try {
    const visionConfig = await resolveVisionConfig(job.ownerUserId);
    job = await prisma.analysisJob.update({
      where: { id: job.id },
      data: {
        status: 'running',
        stage: job.backupPath ? 'analyzing' : 'backing_up',
        startedAt: job.startedAt ?? new Date(),
        heartbeatAt: new Date(),
      },
    });

    if (!job.backupPath) {
      const backupPath = await backupDatabase();
      job = await prisma.analysisJob.update({
        where: { id: job.id },
        data: { backupPath, stage: 'analyzing', heartbeatAt: new Date() },
      });
    }

    const caseIds = parseJsonArray<string>(job.caseIdsJson);
    for (let index = job.nextIndex; index < caseIds.length; index += 1) {
      job = await prisma.analysisJob.findUniqueOrThrow({ where: { id: job.id } });
      if (job.cancelRequested || job.status === 'cancelling') {
        await finishJob(job.id, 'cancelled');
        return;
      }

      const caseId = caseIds[index];
      const visualCase = await prisma.visualCase.findUnique({
        where: { id: caseId },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true, ocrText: true,
          pageTitle: true, caseTitle: true, title: true, sourceUrl: true, contextText: true,
          reviewStatus: true, confidence: true, aiSummary: true, functionalPurpose: true,
          distributionMedium: true, technicalMethod: true,
        },
      });
      const caseTitle = visualCase?.caseTitle || visualCase?.title || visualCase?.pageTitle || `案例 ${index + 1}`;
      await prisma.analysisJob.update({
        where: { id: job.id },
        data: { currentCaseId: caseId, currentCaseTitle: caseTitle.slice(0, 160), heartbeatAt: new Date() },
      });

      if (!visualCase) {
        await recordFailure(job, index, errorDetail(caseId, caseTitle, 'CASE_MISSING', '案例已不存在'));
        continue;
      }

      // If the image update committed just before a restart, advance without paying for Qwen twice.
      const alreadyAnalyzed = !['pending_ai_analysis', 'analysis_failed'].includes(visualCase.reviewStatus)
        && visualCase.confidence > 0
        && Boolean(visualCase.aiSummary && visualCase.functionalPurpose && visualCase.distributionMedium && visualCase.technicalMethod);
      if (alreadyAnalyzed) {
        if (visualCase.reviewStatus === 'pending_ocr') {
          await prisma.visualCase.update({ where: { id: caseId }, data: { reviewStatus: 'needs_review' } });
        }
        await prisma.analysisJob.update({
          where: { id: job.id },
          data: { nextIndex: index + 1, processedCount: { increment: 1 }, analyzedCount: { increment: 1 }, heartbeatAt: new Date() },
        });
        continue;
      }

      const imagePath = visualCase.imagePath || visualCase.thumbnailPath || visualCase.imageUrl;
      if (!imagePath) {
        await prisma.visualCase.update({
          where: { id: caseId },
          data: { reviewStatus: 'analysis_failed' },
        });
        await recordFailure(job, index, errorDetail(caseId, caseTitle, 'NO_IMAGE', '没有可供 Qwen 分析的图片'));
        continue;
      }

      try {
        // Keep the durable workflow status while Qwen is running. In particular,
        // a pre-reviewed `pending_ocr` case must not be moved back into the
        // `pending_ai_analysis` preflight pool. The AnalysisJob row already owns
        // the transient running state; runVisionAnalysis atomically writes the
        // terminal review status when the model returns.
        const result = await runVisionAnalysis(
          caseId,
          imagePath,
          visualCase.pageTitle,
          visualCase.sourceUrl,
          visualCase.contextText,
          visualCase.ocrText,
          visionConfig,
        );
        if (result.success) {
          await prisma.analysisJob.update({
            where: { id: job.id },
            data: { nextIndex: index + 1, processedCount: { increment: 1 }, analyzedCount: { increment: 1 }, heartbeatAt: new Date() },
          });
        } else {
          job = await prisma.analysisJob.findUniqueOrThrow({ where: { id: job.id } });
          const message = result.errorMessage
            || (result.reviewStatus === 'source_missing' ? '缺少来源，分析结果待人工处理' : 'Qwen 未返回有效的图片分析结果');
          await recordFailure(job, index, errorDetail(caseId, caseTitle, result.errorCode || 'QWEN_ANALYSIS_FAILED', message));
        }
      } catch (error) {
        console.error(`[analysis-job:${job.id}] case ${caseId} failed`, error);
        await prisma.visualCase.update({ where: { id: caseId }, data: { reviewStatus: 'analysis_failed' } }).catch(() => {});
        job = await prisma.analysisJob.findUniqueOrThrow({ where: { id: job.id } });
        await recordFailure(job, index, errorDetail(caseId, caseTitle, 'QWEN_ANALYSIS_ERROR', 'Qwen 图片分析执行异常'));
      }
    }

    await finishJob(job.id, 'completed');
  } catch (error) {
    console.error(`[analysis-job:${jobId}] worker failed`, error);
    const message = error instanceof Error ? error.message.slice(0, 240) : 'Qwen 分析任务异常终止';
    await finishJob(jobId, 'failed', message).catch(finishError => console.error(`[analysis-job:${jobId}] could not persist failure`, finishError));
  }
}

let activeRunner: Promise<void> | null = null;
let activeRunnerJobId = '';

export function launchAnalysisJob(jobId: string): void {
  if (activeRunner) {
    if (activeRunnerJobId !== jobId) console.warn(`[analysis-job:${jobId}] runner already active for ${activeRunnerJobId}`);
    return;
  }
  activeRunnerJobId = jobId;
  activeRunner = runAnalysisJob(jobId).finally(() => {
    activeRunner = null;
    activeRunnerJobId = '';
  });
}

export async function createAnalysisJob(caseIds: string[], ownerUserId = '', statuses?: string[]): Promise<{ job: AnalysisJobSnapshot; created: boolean }> {
  const existing = await prisma.analysisJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
  if (existing) return { job: toAnalysisJobSnapshot(existing), created: false };

  const candidates = caseIds.length > 0
    ? await prisma.visualCase.findMany({ where: { id: { in: caseIds } }, select: { id: true, imageHash: true } })
    : await prisma.visualCase.findMany({
        where: {
          reviewStatus: { in: statuses?.length ? statuses : ['pending_ai_analysis'] },
          OR: [{ imagePath: { not: '' } }, { thumbnailPath: { not: '' } }, { imageUrl: { not: '' } }],
        },
        orderBy: { updatedAt: 'asc' },
        select: { id: true, imageHash: true },
        take: 2000,
      });
  const frozenIds = dedupeCaseIdsByImageHash(candidates, caseIds.length > 0 ? caseIds : undefined);

  try {
    const created = await prisma.analysisJob.create({
      data: {
        activeKey: frozenIds.length > 0 ? ACTIVE_KEY : null,
        caseIdsJson: JSON.stringify(frozenIds),
        totalCount: frozenIds.length,
        status: frozenIds.length > 0 ? 'queued' : 'completed',
        stage: frozenIds.length > 0 ? 'preparing' : 'finished',
        ownerUserId,
        finishedAt: frozenIds.length > 0 ? null : new Date(),
      },
    });
    if (frozenIds.length > 0) launchAnalysisJob(created.id);
    return { job: toAnalysisJobSnapshot(created), created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const active = await prisma.analysisJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
      if (active) return { job: toAnalysisJobSnapshot(active), created: false };
    }
    throw error;
  }
}

export async function getAnalysisJob(jobId: string): Promise<AnalysisJobSnapshot | null> {
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
  return job ? toAnalysisJobSnapshot(job) : null;
}

export async function getLatestAnalysisJob(): Promise<AnalysisJobSnapshot | null> {
  const active = await prisma.analysisJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
  const job = active ?? await prisma.analysisJob.findFirst({ orderBy: { createdAt: 'desc' } });
  return job ? toAnalysisJobSnapshot(job) : null;
}

export async function cancelAnalysisJob(jobId: string): Promise<AnalysisJobSnapshot | null> {
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (!ACTIVE_STATUSES.includes(job.status)) return toAnalysisJobSnapshot(job);
  const updated = await prisma.analysisJob.update({
    where: { id: jobId },
    data: { status: 'cancelling', cancelRequested: true, heartbeatAt: new Date() },
  });
  return toAnalysisJobSnapshot(updated);
}

export async function recoverAnalysisJobs(): Promise<void> {
  const active = await prisma.analysisJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
  if (!active) return;
  if (!ACTIVE_STATUSES.includes(active.status)) {
    await prisma.analysisJob.update({ where: { id: active.id }, data: { activeKey: null } });
    return;
  }
  if (active.cancelRequested || active.status === 'cancelling') {
    await finishJob(active.id, 'cancelled');
    return;
  }
  await prisma.analysisJob.update({
    where: { id: active.id },
    data: { status: 'queued', stage: active.backupPath ? 'analyzing' : 'preparing', heartbeatAt: new Date() },
  });
  launchAnalysisJob(active.id);
}

export function isActiveAnalysisStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}
