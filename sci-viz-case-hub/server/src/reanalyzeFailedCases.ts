import { PrismaClient } from '@prisma/client';
import { runAnalysis } from './services/analysisRunner.js';

const prisma = new PrismaClient();
const CONCURRENCY = 3;

function argValue(name: string): string {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : '';
}

const LIMIT = parseInt(argValue('limit'), 10) || 0;
const EXCLUDE_DOMAIN = argValue('exclude-source-domain');

async function main() {
  const extra = [
    LIMIT ? `limit=${LIMIT}` : '',
    EXCLUDE_DOMAIN ? `exclude=${EXCLUDE_DOMAIN}` : '',
  ].filter(Boolean).join(' ');
  console.log(`[reanalyze] Fetching cases with AI分析失败 ${extra}`.trim());

  const where: Record<string, unknown> = { aiSummary: 'AI分析失败' };
  if (EXCLUDE_DOMAIN) where.sourceDomain = { not: EXCLUDE_DOMAIN };

  const failedCases = await prisma.visualCase.findMany({
    where,
    select: {
      id: true,
      imagePath: true,
      pageTitle: true,
      sourceUrl: true,
      contextText: true,
    },
    take: LIMIT || undefined,
  });

  console.log(`[reanalyze] Found ${failedCases.length} cases to re-analyze`);

  const withImage = failedCases.filter(c => c.imagePath);
  console.log(`[reanalyze] ${withImage.length} cases have image paths`);

  let completed = 0;
  let errors = 0;

  async function processOne(c: typeof withImage[number]) {
    try {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { reviewStatus: 'pending_ai_analysis', confidence: 0 },
      });
      await runAnalysis(c.id, c.imagePath, c.pageTitle, c.sourceUrl, c.contextText);
      completed++;
    } catch (err) {
      console.error(`[reanalyze] Error for ${c.id}:`, err);
      errors++;
    }
  }

  for (let i = 0; i < withImage.length; i += CONCURRENCY) {
    const batch = withImage.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processOne));
    console.log(`[reanalyze] Progress: ${i + batch.length}/${withImage.length} (completed=${completed}, errors=${errors})`);
  }

  const withoutImage = failedCases.filter(c => !c.imagePath);
  if (withoutImage.length > 0) {
    console.log(`[reanalyze] ${withoutImage.length} cases have no image path, marking as analysis_failed`);
    for (const c of withoutImage) {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { reviewStatus: 'analysis_failed' },
      });
    }
  }

  console.log(`[reanalyze] Done! Completed: ${completed}, Errors: ${errors}, No image: ${withoutImage.length}`);

  const statusCounts = await prisma.visualCase.groupBy({
    by: ['reviewStatus'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });
  console.log('\n[reanalyze] Status distribution after re-analysis:');
  for (const row of statusCounts) {
    console.log(`  ${row.reviewStatus}: ${row._count.id}`);
  }

  const remainingFailed = await prisma.visualCase.count({
    where: { aiSummary: 'AI分析失败' },
  });
  console.log(`\n[reanalyze] Remaining 'AI分析失败' cases: ${remainingFailed}`);
}

main()
  .catch((err) => {
    console.error('[reanalyze] Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });