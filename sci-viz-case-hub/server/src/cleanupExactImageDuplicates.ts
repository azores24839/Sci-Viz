import { prisma } from './prisma.js';
import { deleteSavedImage } from './services/image.js';

const STATUS_PRIORITY: Record<string, number> = {
  approved: 7,
  needs_review: 6,
  low_confidence_review: 5,
  pending_ocr: 4,
  pending_ai_analysis: 3,
  source_missing: 2,
  analysis_failed: 1,
  rejected: 0,
};

function dataQualityScore(entry: {
  reviewStatus: string;
  ocrText: string;
  aiSummary: string;
  contextText: string;
  confidence: number;
}): number {
  return (STATUS_PRIORITY[entry.reviewStatus] ?? 0) * 1_000_000
    + Math.round(entry.confidence * 10_000)
    + Math.min(entry.ocrText.length, 10_000)
    + Math.min(entry.aiSummary.length, 5_000)
    + Math.min(entry.contextText.length, 2_000);
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const groups = await prisma.visualCase.groupBy({
    by: ['imageHash'],
    where: { imageHash: { not: '' } },
    having: { id: { _count: { gt: 1 } } },
    _count: { id: true },
  });

  const losers: Array<{ id: string; imagePath: string; thumbnailPath: string }> = [];
  for (const group of groups) {
    const entries = await prisma.visualCase.findMany({ where: { imageHash: group.imageHash } });
    entries.sort((a, b) => dataQualityScore(b) - dataQualityScore(a)
      || a.createdAt.getTime() - b.createdAt.getTime()
      || a.id.localeCompare(b.id));
    const keeper = entries[0];
    for (const entry of entries.slice(1)) {
      losers.push({
        id: entry.id,
        imagePath: entry.imagePath === keeper.imagePath ? '' : entry.imagePath,
        thumbnailPath: entry.thumbnailPath === keeper.thumbnailPath ? '' : entry.thumbnailPath,
      });
    }
  }

  console.log(`[exact-dedupe] groups=${groups.length} duplicateRows=${losers.length} mode=${execute ? 'execute' : 'dry-run'}`);
  if (!execute || losers.length === 0) return;

  await prisma.visualCase.deleteMany({ where: { id: { in: losers.map(item => item.id) } } });
  await Promise.all(losers.map(item => deleteSavedImage(item.imagePath, item.thumbnailPath)));
  console.log(`[exact-dedupe] deleted=${losers.length}`);
}

main()
  .catch(error => {
    console.error('[exact-dedupe] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
