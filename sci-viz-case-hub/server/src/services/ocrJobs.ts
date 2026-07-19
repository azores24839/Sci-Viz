import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Prisma, type OcrJob } from '@prisma/client';
import { prisma } from '../prisma.js';
import { backupDatabase } from '../utils/backup.js';
import { getVisionConfig, getVisionHeaders } from './visionConfig.js';
import { resolveVisionConfig } from './userApiCredentials.js';
import { isAppleVisionOcrEnabled } from './ocrPolicy.js';
import type { VisionApiConfig } from './visionConfig.js';
import { dedupeCaseIdsByImageHash } from './processingInput.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.join(__dirname, '..', '..');
const WORKSPACE_ROOT = path.join(SERVER_ROOT, '..', '..');
const OCR_BINARY = path.join(SERVER_ROOT, '.tmp', 'ocr_image');
const OCR_SWIFT_SCRIPT = path.join(SERVER_ROOT, 'scripts', 'ocr_image.swift');
const execFileAsync = promisify(execFile);

const ACTIVE_KEY = 'global';
const ACTIVE_STATUSES = ['queued', 'running', 'cancelling'];
const MAX_ERROR_DETAILS = 25;
const APPLE_VISION_OCR_ENABLED = isAppleVisionOcrEnabled();

export interface OcrJobErrorDetail {
  caseId: string;
  caseTitle: string;
  code: string;
  message: string;
}

export interface OcrJobSnapshot {
  id: string;
  status: string;
  stage: string;
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  progress: number;
  currentCaseId: string;
  currentCaseTitle: string;
  currentMethod: string;
  errors: OcrJobErrorDetail[];
  error: string;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  finishedAt: string | null;
}

class PublicOcrError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
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

function safeLocalPath(root: string, webPath: string): string {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, webPath.replace(/^\//, ''));
  return candidate.startsWith(`${resolvedRoot}${path.sep}`) ? candidate : '';
}

export function localPathFromWebPath(webPath: string): string {
  if (!webPath) return '';
  if (webPath.startsWith('/uploads/')) {
    return safeLocalPath(SERVER_ROOT, webPath);
  }
  if (webPath.startsWith('/journal_covers/')) {
    return safeLocalPath(WORKSPACE_ROOT, webPath);
  }
  return '';
}

export async function findLocalImage(c: { imagePath: string; thumbnailPath: string }): Promise<string> {
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

async function ocrLocalImage(filePath: string): Promise<string> {
  let binaryExists = true;
  try {
    await fs.promises.access(OCR_BINARY);
  } catch {
    binaryExists = false;
  }

  try {
    const command = binaryExists ? OCR_BINARY : 'swift';
    const args = binaryExists ? [filePath] : [OCR_SWIFT_SCRIPT, filePath];
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024 * 4,
      timeout: 30_000,
    });
    return cleanOcrText(stdout);
  } catch (error) {
    const code = error instanceof Error && error.message.toLowerCase().includes('timed out')
      ? 'LOCAL_TIMEOUT'
      : 'LOCAL_OCR_ERROR';
    throw new PublicOcrError(code, code === 'LOCAL_TIMEOUT' ? '本地 OCR 超时' : '本地 OCR 执行失败');
  }
}

function localImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function localImageToDataUrl(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  return `data:${localImageMimeType(filePath)};base64,${buffer.toString('base64')}`;
}

async function ocrRemoteImage(imageUrl: string, context: string, configOverride?: VisionApiConfig): Promise<string> {
  const config = configOverride ?? getVisionConfig();
  if (!config.url || !config.key || config.key.includes('your-')) {
    throw new PublicOcrError('REMOTE_CONFIG_MISSING', '远程 OCR 尚未配置');
  }

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      signal: AbortSignal.timeout(45_000),
      headers: { ...getVisionHeaders(config.key) },
      body: JSON.stringify({
        model: config.ocrModel,
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
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new PublicOcrError(timedOut ? 'REMOTE_TIMEOUT' : 'REMOTE_NETWORK_ERROR', timedOut ? '远程 OCR 超时' : '远程 OCR 连接失败');
  }

  if (!response.ok) {
    throw new PublicOcrError('REMOTE_HTTP_ERROR', `远程 OCR 返回 HTTP ${response.status}`);
  }
  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return cleanOcrText(data.choices?.[0]?.message?.content || '');
}

function errorDetail(error: unknown, caseId: string, caseTitle: string): OcrJobErrorDetail {
  const publicError = error instanceof PublicOcrError
    ? error
    : new PublicOcrError('OCR_ERROR', 'OCR 处理异常');
  return {
    caseId,
    caseTitle: caseTitle.slice(0, 120),
    code: publicError.code,
    message: publicError.message.slice(0, 240),
  };
}

export function toOcrJobSnapshot(job: OcrJob): OcrJobSnapshot {
  const total = job.totalCount;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    total,
    processed: job.processedCount,
    updated: job.updatedCount,
    skipped: job.skippedCount,
    failed: job.failedCount,
    progress: total === 0 ? 100 : Math.min(100, Math.round((job.processedCount / total) * 100)),
    currentCaseId: job.currentCaseId,
    currentCaseTitle: job.currentCaseTitle,
    currentMethod: job.currentMethod,
    errors: parseJsonArray<OcrJobErrorDetail>(job.errorsJson),
    error: job.error,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

async function finishJob(jobId: string, status: 'completed' | 'cancelled' | 'failed', error = ''): Promise<void> {
  await prisma.ocrJob.update({
    where: { id: jobId },
    data: {
      status,
      stage: 'finished',
      activeKey: null,
      currentCaseId: '',
      currentCaseTitle: '',
      currentMethod: '',
      error,
      heartbeatAt: new Date(),
      finishedAt: new Date(),
    },
  });
}

async function recordFailure(job: OcrJob, index: number, detail: OcrJobErrorDetail): Promise<void> {
  const errors = parseJsonArray<OcrJobErrorDetail>(job.errorsJson);
  if (errors.length < MAX_ERROR_DETAILS) errors.push(detail);
  await prisma.ocrJob.update({
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

async function runOcrJob(jobId: string): Promise<void> {
  let job = await prisma.ocrJob.findUnique({ where: { id: jobId } });
  if (!job || !ACTIVE_STATUSES.includes(job.status)) return;
  if (job.cancelRequested || job.status === 'cancelling') {
    await finishJob(job.id, 'cancelled');
    return;
  }

  try {
    const visionConfig = await resolveVisionConfig(job.ownerUserId);
    job = await prisma.ocrJob.update({
      where: { id: job.id },
      data: {
        status: 'running',
        stage: job.backupPath ? 'ocr' : 'backing_up',
        startedAt: job.startedAt ?? new Date(),
        heartbeatAt: new Date(),
      },
    });

    if (!job.backupPath) {
      const backupPath = await backupDatabase();
      job = await prisma.ocrJob.update({
        where: { id: job.id },
        data: { backupPath, stage: 'ocr', heartbeatAt: new Date() },
      });
    }

    const caseIds = parseJsonArray<string>(job.caseIdsJson);
    for (let index = job.nextIndex; index < caseIds.length; index += 1) {
      job = await prisma.ocrJob.findUniqueOrThrow({ where: { id: job.id } });
      if (job.cancelRequested || job.status === 'cancelling') {
        await finishJob(job.id, 'cancelled');
        return;
      }

      const caseId = caseIds[index];
      const visualCase = await prisma.visualCase.findUnique({
        where: { id: caseId },
        select: {
          id: true, imagePath: true, thumbnailPath: true, imageUrl: true,
          pageTitle: true, caseTitle: true, title: true, contextText: true, ocrText: true, reviewStatus: true,
        },
      });
      const caseTitle = visualCase?.caseTitle || visualCase?.title || visualCase?.pageTitle || `案例 ${index + 1}`;
      await prisma.ocrJob.update({
        where: { id: job.id },
        data: {
          currentCaseId: caseId,
          currentCaseTitle: caseTitle.slice(0, 160),
          currentMethod: 'locating',
          heartbeatAt: new Date(),
        },
      });

      if (!visualCase) {
        const detail = errorDetail(new PublicOcrError('CASE_MISSING', '案例已不存在'), caseId, caseTitle);
        await recordFailure(job, index, detail);
        continue;
      }

      // A restarted worker may revisit the one item whose OCR write committed just before shutdown.
      if (visualCase.ocrText) {
        await prisma.$transaction([
          prisma.visualCase.update({
            where: { id: visualCase.id },
            data: {
              ocrProcessedAt: new Date(),
              ...(visualCase.reviewStatus === 'pending_ocr' ? { reviewStatus: 'needs_review' } : {}),
            },
          }),
          prisma.ocrJob.update({
            where: { id: job.id },
            data: {
              nextIndex: index + 1,
              processedCount: { increment: 1 },
              updatedCount: { increment: 1 },
              currentMethod: 'existing',
              heartbeatAt: new Date(),
            },
          }),
        ]);
        continue;
      }

      try {
        const localImage = await findLocalImage(visualCase);
        let text = '';
        let method = '';
        const context = [visualCase.caseTitle, visualCase.pageTitle, visualCase.contextText].filter(Boolean).join('\n').slice(0, 1200);
        if (APPLE_VISION_OCR_ENABLED && localImage) {
          method = 'local';
          await prisma.ocrJob.update({ where: { id: job.id }, data: { currentMethod: method, heartbeatAt: new Date() } });
          try {
            text = await ocrLocalImage(localImage);
          } catch (localError) {
            if (!visualCase.imageUrl) throw localError;
            method = 'remote_fallback';
            await prisma.ocrJob.update({ where: { id: job.id }, data: { currentMethod: method, heartbeatAt: new Date() } });
            text = await ocrRemoteImage(visualCase.imageUrl, context, visionConfig);
          }
        } else if (visualCase.imageUrl || localImage) {
          method = 'remote';
          await prisma.ocrJob.update({ where: { id: job.id }, data: { currentMethod: method, heartbeatAt: new Date() } });
          const imageInput = visualCase.imageUrl || await localImageToDataUrl(localImage);
          text = await ocrRemoteImage(imageInput, context, visionConfig);
        } else {
          throw new PublicOcrError('NO_IMAGE', '没有可用于 OCR 的图片');
        }

        if (text) {
          await prisma.$transaction([
            prisma.visualCase.update({
              where: { id: visualCase.id },
              data: {
                ocrText: text,
                ocrProcessedAt: new Date(),
                ...(visualCase.reviewStatus === 'pending_ocr' ? { reviewStatus: 'needs_review' } : {}),
              },
            }),
            prisma.ocrJob.update({
              where: { id: job.id },
              data: {
                nextIndex: index + 1,
                processedCount: { increment: 1 },
                updatedCount: { increment: 1 },
                currentMethod: method,
                heartbeatAt: new Date(),
              },
            }),
          ]);
        } else {
          await prisma.$transaction([
            prisma.visualCase.update({
              where: { id: visualCase.id },
              data: {
                ocrProcessedAt: new Date(),
                ...(visualCase.reviewStatus === 'pending_ocr' ? { reviewStatus: 'needs_review' } : {}),
              },
            }),
            prisma.ocrJob.update({
              where: { id: job.id },
              data: {
                nextIndex: index + 1,
                processedCount: { increment: 1 },
                skippedCount: { increment: 1 },
                currentMethod: method,
                heartbeatAt: new Date(),
              },
            }),
          ]);
        }
      } catch (error) {
        console.error(`[ocr-job:${job.id}] case ${caseId} failed`, error);
        job = await prisma.ocrJob.findUniqueOrThrow({ where: { id: job.id } });
        await recordFailure(job, index, errorDetail(error, caseId, caseTitle));
      }
    }

    await finishJob(job.id, 'completed');
  } catch (error) {
    console.error(`[ocr-job:${jobId}] worker failed`, error);
    const message = error instanceof Error ? error.message.slice(0, 240) : 'OCR 任务异常终止';
    await finishJob(jobId, 'failed', message).catch(finishError => {
      console.error(`[ocr-job:${jobId}] could not persist failure`, finishError);
    });
  }
}

let activeRunner: Promise<void> | null = null;
let activeRunnerJobId = '';

export function launchOcrJob(jobId: string): void {
  if (activeRunner) {
    if (activeRunnerJobId !== jobId) console.warn(`[ocr-job:${jobId}] runner already active for ${activeRunnerJobId}`);
    return;
  }
  activeRunnerJobId = jobId;
  activeRunner = runOcrJob(jobId).finally(() => {
    activeRunner = null;
    activeRunnerJobId = '';
  });
}

export async function createOcrJob(caseIds: string[], ownerUserId = '', statuses?: string[]): Promise<{ job: OcrJobSnapshot; created: boolean }> {
  const existing = await prisma.ocrJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
  if (existing) return { job: toOcrJobSnapshot(existing), created: false };

  const candidates = caseIds.length > 0
    ? await prisma.visualCase.findMany({
        where: { id: { in: caseIds } },
        select: { id: true, imageHash: true },
      })
    : await prisma.visualCase.findMany({
        where: {
          ocrText: '',
          ocrProcessedAt: null,
          reviewStatus: statuses?.length ? { in: statuses } : { notIn: ['rejected'] },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, imageHash: true },
        take: 2000,
      });
  const frozenIds = dedupeCaseIdsByImageHash(candidates, caseIds.length > 0 ? caseIds : undefined);

  try {
    const created = await prisma.ocrJob.create({
      data: {
        activeKey: frozenIds.length > 0 ? ACTIVE_KEY : null,
        caseIdsJson: JSON.stringify(frozenIds),
        totalCount: frozenIds.length,
        status: frozenIds.length > 0 ? 'queued' : 'completed',
        stage: frozenIds.length > 0 ? 'preparing' : 'finished',
        processedCount: 0,
        ownerUserId,
        finishedAt: frozenIds.length > 0 ? null : new Date(),
      },
    });
    if (frozenIds.length > 0) launchOcrJob(created.id);
    return { job: toOcrJobSnapshot(created), created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const active = await prisma.ocrJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
      if (active) return { job: toOcrJobSnapshot(active), created: false };
    }
    throw error;
  }
}

export async function getOcrJob(jobId: string): Promise<OcrJobSnapshot | null> {
  const job = await prisma.ocrJob.findUnique({ where: { id: jobId } });
  return job ? toOcrJobSnapshot(job) : null;
}

export async function getLatestOcrJob(): Promise<OcrJobSnapshot | null> {
  const active = await prisma.ocrJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
  const job = active ?? await prisma.ocrJob.findFirst({ orderBy: { createdAt: 'desc' } });
  return job ? toOcrJobSnapshot(job) : null;
}

export async function cancelOcrJob(jobId: string): Promise<OcrJobSnapshot | null> {
  const job = await prisma.ocrJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (!ACTIVE_STATUSES.includes(job.status)) return toOcrJobSnapshot(job);
  const updated = await prisma.ocrJob.update({
    where: { id: jobId },
    data: { status: 'cancelling', cancelRequested: true, heartbeatAt: new Date() },
  });
  return toOcrJobSnapshot(updated);
}

export async function recoverOcrJobs(): Promise<void> {
  const active = await prisma.ocrJob.findUnique({ where: { activeKey: ACTIVE_KEY } });
  if (!active) return;
  if (!ACTIVE_STATUSES.includes(active.status)) {
    await prisma.ocrJob.update({ where: { id: active.id }, data: { activeKey: null } });
    return;
  }
  if (active.cancelRequested || active.status === 'cancelling') {
    await finishJob(active.id, 'cancelled');
    return;
  }
  await prisma.ocrJob.update({
    where: { id: active.id },
    data: { status: 'queued', stage: active.backupPath ? 'ocr' : 'preparing', currentMethod: '', heartbeatAt: new Date() },
  });
  launchOcrJob(active.id);
}

export function isActiveOcrStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status);
}
