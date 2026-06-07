import { prisma } from '../prisma.js';

interface BackfillStats {
  functionalPurpose: { updated: number; skipped: number };
  distributionMedium: { updated: number; skipped: number };
  mediaSubType: { updated: number; skipped: number };
  contentSubType: { updated: number; skipped: number };
}

function inferFunctionalPurpose(
  mediaType: string,
  contentType: string,
  technicalMethod: string,
  sourceDomain: string
): string {
  const ct = contentType.trim();
  const tm = technicalMethod.trim();
  const mt = mediaType.trim();
  const sd = sourceDomain.trim().toLowerCase();

  // Priority 1: contentType (strongest signal for function)
  if (ct === '科普传播') return '传播';
  if (ct === '机制模型') return '解释';
  if (ct === '数据结果') return '数据';
  if (ct === '微观样本') return '数据';
  if (ct === '单人肖像' || ct === '群体肖像' || ct === '绘画肖像') return '记录';
  if (ct === '团队场景') return '记录';
  if (ct === '实验过程') return '记录';
  if (ct === '实验设备') return '记录';
  if (ct === '空间环境') return '记录';

  // Priority 2: mediaType + sourceDomain (Nature covers → 传播/展示)
  if (sd.includes('nature.com')) {
    if (mt === '3D渲染') return '展示';
    if (mt === '数据可视化') return '数据';
    if (mt === '信息图') return '解释';
    return '传播';
  }

  // Priority 3: technicalMethod with nuance (NOT blanket mapping)
  if (tm === '数据') return '数据';
  if (tm === '成像') return '数据';
  if (tm === '生成') return '展示';

  // Priority 4: mediaType fallback
  if (mt === '数据可视化') return '数据';
  if (mt === '3D渲染') return '展示';
  if (mt === '信息图') return '解释';
  if (mt === '显微图') return '数据';
  if (mt === '手绘图') return '解释';

  // Photography: depends on context
  if (tm === '拍摄' || mt === '摄影') return '记录';

  return '不确定';
}

function inferDistributionMedium(
  mediaType: string,
  sourceDomain: string,
  technicalMethod: string,
  captureType: string,
  videoUrl: string
): string {
  const mt = mediaType.trim();
  const sd = sourceDomain.trim().toLowerCase();
  const cap = captureType.trim();
  const vu = videoUrl.trim();

  if (cap === 'video' || vu) return '视频';

  // Information graphics and data visualization from Nature are typically multi-panel figures
  if (sd.includes('nature.com')) {
    if (mt === '信息图' || mt === '数据可视化') return '图组';
  }

  // Information graphics are typically image sets
  if (mt === '信息图') return '图组';

  return '静图';
}

function inferMediaSubType(
  mediaType: string,
  discipline: string,
  technicalMethod: string
): string {
  const mt = mediaType.trim();
  const tm = technicalMethod.trim();
  const d = discipline.trim();

  switch (mt) {
    case '3D渲染':
      if (tm === '绘设') return '3D机制图';
      if (['材料', '工程', '物理'].includes(d)) return '3D机制图';
      return '3D产品渲染';
    case '摄影':
      return '纪实摄影';
    case '显微图':
      return '光学显微';
    case '信息图':
      return '科学插画';
    case '数据可视化':
      return '统计图表';
    case '手绘图':
      return '科学插画';
    case '混合媒介':
      return '';
    case 'PDF/文档':
      return '';
    case '不确定':
      return '';
    default:
      return '';
  }
}

function inferContentSubType(contentType: string): string {
  const ct = contentType.trim();

  const map: Record<string, string> = {
    '单人肖像': '个人肖像',
    '群体肖像': '群体肖像',
    '绘画肖像': '绘画肖像',
    '团队场景': '群体团队',
    '实验过程': '实验过程',
    '实验设备': '设备空间',
    '微观样本': '实验过程',
    '机制模型': '机制图解',
    '数据结果': '实验结果',
    '空间环境': '现场环境',
    '科普传播': '科普传播',
    '不确定': '',
  };

  return map[ct] ?? '';
}

async function main() {
  const allCases = await prisma.visualCase.findMany({
    select: {
      id: true,
      mediaType: true,
      contentType: true,
      technicalMethod: true,
      discipline: true,
      sourceDomain: true,
      captureType: true,
      videoUrl: true,
      functionalPurpose: true,
      distributionMedium: true,
      mediaSubType: true,
      contentSubType: true,
    },
  });

  const stats: BackfillStats = {
    functionalPurpose: { updated: 0, skipped: 0 },
    distributionMedium: { updated: 0, skipped: 0 },
    mediaSubType: { updated: 0, skipped: 0 },
    contentSubType: { updated: 0, skipped: 0 },
  };

  const fpDist: Record<string, number> = {};
  const dmDist: Record<string, number> = {};
  const mstDist: Record<string, number> = {};
  const cstDist: Record<string, number> = {};

  const BATCH_SIZE = 100;
  const updates: Array<{
    id: string;
    data: Record<string, string>;
  }> = [];

  async function flush() {
    if (updates.length === 0) return;
    const batch = updates.splice(0);
    for (const { id, data } of batch) {
      try {
        await prisma.visualCase.update({ where: { id }, data });
      } catch (err) {
        console.warn(`[backfillSubTypes] update failed ${id}: ${(err as Error).message}`);
      }
    }
  }

  for (const entry of allCases) {
    const data: Record<string, string> = {};

    // functionalPurpose
    const existingFp = (entry.functionalPurpose || '').trim();
    if (!existingFp) {
      const fp = inferFunctionalPurpose(
        entry.mediaType,
        entry.contentType,
        entry.technicalMethod,
        entry.sourceDomain || ''
      );
      data.functionalPurpose = fp;
      stats.functionalPurpose.updated++;
      fpDist[fp] = (fpDist[fp] || 0) + 1;
    } else {
      stats.functionalPurpose.skipped++;
      fpDist[existingFp] = (fpDist[existingFp] || 0) + 1;
    }

    // distributionMedium
    const existingDm = (entry.distributionMedium || '').trim();
    if (!existingDm) {
      const dm = inferDistributionMedium(
        entry.mediaType,
        entry.sourceDomain || '',
        entry.technicalMethod,
        entry.captureType || '',
        entry.videoUrl || ''
      );
      data.distributionMedium = dm;
      stats.distributionMedium.updated++;
      dmDist[dm] = (dmDist[dm] || 0) + 1;
    } else {
      stats.distributionMedium.skipped++;
      dmDist[existingDm] = (dmDist[existingDm] || 0) + 1;
    }

    // mediaSubType
    const existingMst = (entry.mediaSubType || '').trim();
    if (!existingMst) {
      const mst = inferMediaSubType(
        entry.mediaType,
        entry.discipline || '',
        entry.technicalMethod
      );
      if (mst) {
        data.mediaSubType = mst;
        stats.mediaSubType.updated++;
        mstDist[mst] = (mstDist[mst] || 0) + 1;
      } else {
        stats.mediaSubType.skipped++;
      }
    } else {
      stats.mediaSubType.skipped++;
      mstDist[existingMst] = (mstDist[existingMst] || 0) + 1;
    }

    // contentSubType
    const existingCst = (entry.contentSubType || '').trim();
    if (!existingCst) {
      const cst = inferContentSubType(entry.contentType);
      if (cst) {
        data.contentSubType = cst;
        stats.contentSubType.updated++;
        cstDist[cst] = (cstDist[cst] || 0) + 1;
      } else {
        stats.contentSubType.skipped++;
      }
    } else {
      stats.contentSubType.skipped++;
      cstDist[existingCst] = (cstDist[existingCst] || 0) + 1;
    }

    if (Object.keys(data).length > 0) {
      updates.push({ id: entry.id, data });
      if (updates.length >= BATCH_SIZE) {
        await flush();
      }
    }
  }

  await flush();

  console.log(`\n[backfillSubTypes] Total cases: ${allCases.length}`);
  console.log(`  functionalPurpose: updated=${stats.functionalPurpose.updated} skipped=${stats.functionalPurpose.skipped}`);
  console.log(`  distributionMedium: updated=${stats.distributionMedium.updated} skipped=${stats.distributionMedium.skipped}`);
  console.log(`  mediaSubType:       updated=${stats.mediaSubType.updated} skipped=${stats.mediaSubType.skipped}`);
  console.log(`  contentSubType:     updated=${stats.contentSubType.updated} skipped=${stats.contentSubType.skipped}`);

  printDist('functionalPurpose', fpDist);
  printDist('distributionMedium', dmDist);
  printDist('mediaSubType', mstDist);
  printDist('contentSubType', cstDist);
}

function printDist(title: string, dist: Record<string, number>) {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  console.log(`\n--- ${title} ---`);
  for (const [label, count] of entries) {
    console.log(`  ${label || '(empty)'}: ${count}`);
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
