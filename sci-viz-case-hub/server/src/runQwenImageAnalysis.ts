import { prisma } from './prisma.js';
import { runAnalysis } from './services/analysisRunner.js';

const DEFAULT_STATUSES = ['pending_ai_analysis', 'analysis_failed', 'low_confidence_review'];
const DEFAULT_LIMIT = 10;
const DEFAULT_CONCURRENCY = 2;

function argValue(name: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function intArg(name: string, fallback: number, max: number): number {
  const raw = argValue(name) || process.env[name.toUpperCase()] || '';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function statusesArg(): string[] {
  const raw = argValue('statuses') || process.env.STATUSES || DEFAULT_STATUSES.join(',');
  return raw
    .split(',')
    .map(status => status.trim())
    .filter(Boolean);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`) || process.env[name.toUpperCase()] === '1';
}

function sourceDomainsArg(): string[] {
  const raw = argValue('source-domains') || process.env.SOURCE_DOMAINS || '';
  return raw.split(',').map(d => d.trim()).filter(Boolean);
}

async function main() {
  const limit = intArg('limit', DEFAULT_LIMIT, 200);
  const concurrency = intArg('concurrency', DEFAULT_CONCURRENCY, 5);
  const statuses = statusesArg();
  const sourceDomains = sourceDomainsArg();
  const autoApprove = hasFlag('approve');
  const dryRun = hasFlag('dry-run');
  const missingCoreOnly = hasFlag('missing-core');
  const approveThreshold = Number.parseFloat(argValue('approve-threshold') || process.env.APPROVE_THRESHOLD || '0.9');

  const cases = await prisma.visualCase.findMany({
    where: {
      AND: [
        { reviewStatus: { in: statuses } },
        sourceDomains.length > 0 ? { sourceDomain: { in: sourceDomains } } : {},
        missingCoreOnly
          ? {
              OR: [
                { mediaType: '' },
                { mediaType: '不确定' },
                { contentType: '' },
                { contentType: '不确定' },
                { discipline: '' },
                { discipline: '不确定' },
                { technicalMethod: '' },
                { technicalMethod: '不确定' },
                { functionalPurpose: '' },
                { distributionMedium: '' },
                { confidence: 0 },
              ],
            }
          : {},
      ],
      OR: [
        { imagePath: { not: '' } },
        { thumbnailPath: { not: '' } },
        { imageUrl: { not: '' } },
      ],
    },
    select: {
      id: true,
      imagePath: true,
      thumbnailPath: true,
      imageUrl: true,
      pageTitle: true,
      sourceUrl: true,
      contextText: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  console.log(`[qwen-analysis] model=${process.env.VISION_MODEL || 'qwen/qwen2.5-vl-72b-instruct'} statuses=${statuses.join(',')} limit=${limit} concurrency=${concurrency} missingCoreOnly=${missingCoreOnly}`);
  console.log(`[qwen-analysis] selected=${cases.length}`);

  if (dryRun) {
    for (const entry of cases) {
      const title = entry.pageTitle || entry.sourceUrl || entry.id;
      console.log(`  ${entry.id} ${title.slice(0, 100)}`);
    }
    return;
  }

  let completed = 0;
  let approved = 0;
  let failed = 0;

  async function processOne(entry: typeof cases[number]) {
    const imagePath = entry.imagePath || entry.thumbnailPath || entry.imageUrl;
    if (!imagePath) {
      failed++;
      return;
    }

    try {
      await prisma.visualCase.update({
        where: { id: entry.id },
        data: { reviewStatus: 'pending_ai_analysis', confidence: 0 },
      });

      await runAnalysis(
        entry.id,
        imagePath,
        entry.pageTitle,
        entry.sourceUrl,
        entry.contextText,
      );

      const updated = await prisma.visualCase.findUnique({
        where: { id: entry.id },
        select: { aiSummary: true, confidence: true, reviewStatus: true },
      });

      if (updated?.reviewStatus === 'analysis_failed' || /失败|无法读取|等待AI分析/.test(updated?.aiSummary || '')) {
        failed++;
        return;
      }

      if (autoApprove && updated?.reviewStatus === 'needs_review' && updated.confidence >= approveThreshold) {
        await prisma.visualCase.update({
          where: { id: entry.id },
          data: { reviewStatus: 'approved' },
        });
        approved++;
      }

      completed++;
    } catch (err) {
      failed++;
      console.error(`[qwen-analysis] failed ${entry.id}: ${(err as Error).message}`);
    }
  }

  for (let i = 0; i < cases.length; i += concurrency) {
    const batch = cases.slice(i, i + concurrency);
    await Promise.all(batch.map(processOne));
    console.log(`[qwen-analysis] progress=${Math.min(i + batch.length, cases.length)}/${cases.length} completed=${completed} approved=${approved} failed=${failed}`);
  }

  const statusCounts = await prisma.visualCase.groupBy({
    by: ['reviewStatus'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('[qwen-analysis] status distribution:');
  for (const row of statusCounts) {
    console.log(`  ${row.reviewStatus}: ${row._count.id}`);
  }
}

main()
  .catch((err) => {
    console.error('[qwen-analysis] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
