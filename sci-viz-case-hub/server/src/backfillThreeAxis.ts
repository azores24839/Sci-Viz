import { prisma } from './prisma.js';

interface Stats {
  functionalPurpose: Record<string, number>;
  distributionMedium: Record<string, number>;
  technicalMethod: Record<string, number>;
}

async function main() {
  const allCases = await prisma.visualCase.findMany({
    select: {
      id: true,
      mediaType: true,
      contentType: true,
      technicalMethod: true,
      captureType: true,
    },
  });

  const stats: Stats = {
    functionalPurpose: {},
    distributionMedium: {},
    technicalMethod: {},
  };

  let updated = 0;
  let skipped = 0;

  for (const entry of allCases) {
    const mediaType = entry.mediaType || '';
    const contentType = entry.contentType || '';
    const technicalMethod = entry.technicalMethod || '';
    const captureType = entry.captureType || '';

    const fp = inferFunctionalPurpose(mediaType, contentType, technicalMethod);
    const dm = inferDistributionMedium(mediaType, captureType);
    const tm = inferTechnicalMethod(mediaType);

    incrementStats(stats.functionalPurpose, fp);
    incrementStats(stats.distributionMedium, dm);
    incrementStats(stats.technicalMethod, tm);

    if (!fp || (!dm && !fp)) {
      skipped++;
      continue;
    }

    try {
      await prisma.visualCase.update({
        where: { id: entry.id },
        data: {
          functionalPurpose: fp,
          distributionMedium: dm,
        },
      });
      updated++;
    } catch (err) {
      skipped++;
      console.warn(`[backfillThreeAxis] update failed ${entry.id}: ${(err as Error).message}`);
    }
  }

  console.log(`\n[backfillThreeAxis] total=${allCases.length}, updated=${updated}, skipped=${skipped}`);
  printStats('functionalPurpose', stats.functionalPurpose);
  printStats('distributionMedium', stats.distributionMedium);
  printStats('technicalMethod (for reference, not written to DB)', stats.technicalMethod);
}

function inferFunctionalPurpose(mediaType: string, contentType: string, technicalMethod: string): string {
  const mt = mediaType.trim();
  const ct = contentType.trim();
  const tm = technicalMethod.trim();

  if (tm === '绘设') return '传播';
  if (tm === '拍摄') return '记录';
  if (tm === '渲染') return '展示';
  if (ct === '科普传播') return '传播';
  if (ct === '微观样本') return '数据';
  if (ct === '数据结果') return '数据';
  if (ct === '机制模型') return '解释';
  if (ct === '实验设备' || ct === '实验过程' || ct === '空间环境') return '记录';
  if (ct === '单人肖像' || ct === '群体肖像' || ct === '团队场景') return '记录';

  return '';
}

function inferDistributionMedium(mediaType: string, captureType: string): string {
  const cap = captureType.trim();

  if (cap === 'video') return '视频';

  return '静图';
}

function inferTechnicalMethod(mediaType: string): string {
  const mt = mediaType.trim();

  const map: Record<string, string> = {
    '摄影': '拍摄',
    '手绘图': '绘设',
    '3D渲染': '渲染',
    '信息图': '绘设',
    '显微图': '成像',
    '数据可视化': '数据',
    '不确定': '不确定',
  };

  return map[mt] || '';
}

function incrementStats(stats: Record<string, number>, key: string) {
  const label = key || '(empty)';
  stats[label] = (stats[label] || 0) + 1;
}

function printStats(title: string, stats: Record<string, number>) {
  const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  console.log(`\n--- ${title} ---`);
  for (const [label, count] of entries) {
    console.log(`  ${label}: ${count}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
