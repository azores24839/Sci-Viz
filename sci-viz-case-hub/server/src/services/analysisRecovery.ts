import { prisma } from '../prisma.js';
import { runAnalysis } from './analysisRunner.js';

const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;
const STUCK_THRESHOLD_MINUTES = 10;
const MAX_RETRIES = 3;
const BATCH_SIZE = 20;
const CONCURRENCY = 3;

let timerRef: ReturnType<typeof setInterval> | null = null;
let startupTimerRef: ReturnType<typeof setTimeout> | null = null;

export function startAnalysisRecovery() {
  if (timerRef) return;

  console.log(`[analysis-recovery] Starting recovery timer (interval=${RECOVERY_INTERVAL_MS / 1000}s, threshold=${STUCK_THRESHOLD_MINUTES}min, max-retries=${MAX_RETRIES})`);

  startupTimerRef = setTimeout(() => {
    startupTimerRef = null;
    recoverStuckCases();
    timerRef = setInterval(recoverStuckCases, RECOVERY_INTERVAL_MS);
  }, 30000);
}

export function stopAnalysisRecovery() {
  if (startupTimerRef) {
    clearTimeout(startupTimerRef);
    startupTimerRef = null;
  }
  if (timerRef) {
    clearInterval(timerRef);
    timerRef = null;
  }
  console.log('[analysis-recovery] Stopped');
}

async function recoverStuckCases() {
  try {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

    const stuckCases = await prisma.visualCase.findMany({
      where: {
        reviewStatus: 'pending_ai_analysis',
        updatedAt: { lt: cutoff },
        confidence: 0,
      },
      select: {
        id: true,
        imagePath: true,
        pageTitle: true,
        sourceUrl: true,
        contextText: true,
        updatedAt: true,
        manualNotes: true,
      },
      take: BATCH_SIZE,
      orderBy: { updatedAt: 'asc' },
    });

    if (stuckCases.length === 0) return;

    const eligible = stuckCases.filter(c => {
      const retryCount = parseRetryCount(c.manualNotes);
      if (retryCount >= MAX_RETRIES) return false;
      return true;
    });

    if (eligible.length === 0) return;

    console.log(`[analysis-recovery] Found ${stuckCases.length} stuck case(s), ${eligible.length} eligible for retry`);

    for (let i = 0; i < eligible.length; i += CONCURRENCY) {
      const batch = eligible.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(async (c) => {
        const retryCount = parseRetryCount(c.manualNotes);
        const notes = c.manualNotes
          ? c.manualNotes.replace(/\[自动重试 \d+次\]\s*/g, '').trim()
          : '';
        const newRetryTag = `[自动重试 ${retryCount + 1}次]`;

        await prisma.visualCase.update({
          where: { id: c.id },
          data: {
            manualNotes: [newRetryTag, notes].filter(Boolean).join(' '),
          },
        });

        if (c.imagePath) {
          runAnalysis(c.id, c.imagePath, c.pageTitle, c.sourceUrl, c.contextText);
          console.log(`[analysis-recovery] Retrying analysis for case ${c.id} (attempt ${retryCount + 1})`);
        } else {
          await prisma.visualCase.update({
            where: { id: c.id },
            data: { reviewStatus: 'analysis_failed' },
          });
          console.log(`[analysis-recovery] Case ${c.id} has no imagePath, marking as analysis_failed`);
        }
      }));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.error('[analysis-recovery] Error during recovery:', err);
  }
}

function parseRetryCount(manualNotes: string | null): number {
  if (!manualNotes) return 0;
  const match = manualNotes.match(/\[自动重试 (\d+)次\]/g);
  if (!match) return 0;
  const lastMatch = match[match.length - 1];
  const num = lastMatch.match(/\d+/);
  return num ? parseInt(num[0], 10) : 0;
}
