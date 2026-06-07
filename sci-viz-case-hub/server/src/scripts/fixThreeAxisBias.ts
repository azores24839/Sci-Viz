import { prisma } from '../prisma.js';

async function main() {
  console.log('[fixVideoMedium] Fixing distributionMedium for video cases...\n');

  // Step 1: Fix cases with videoUrl but distributionMedium != '视频'
  const videoCases = await prisma.visualCase.findMany({
    where: {
      OR: [
        { videoUrl: { not: '' } },
        { captureType: 'video' },
      ],
    },
    select: { id: true, videoUrl: true, captureType: true, distributionMedium: true },
  });

  console.log(`Found ${videoCases.length} cases with video markers`);

  let fixedVideo = 0;
  for (const c of videoCases) {
    if (c.distributionMedium !== '视频') {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { distributionMedium: '视频' },
      });
      fixedVideo++;
    }
  }
  console.log(`Fixed ${fixedVideo} cases to distributionMedium='视频'\n`);

  // Step 2: Fix cases where mediaType='信息图' but distributionMedium is empty or '静图'
  const infoGraphCases = await prisma.visualCase.findMany({
    where: {
      mediaType: '信息图',
      distributionMedium: { in: ['', '静图'] },
    },
    select: { id: true, distributionMedium: true },
  });

  console.log(`Found ${infoGraphCases.length} 信息图 cases with empty or '静图' medium`);

  let fixedInfoGraph = 0;
  for (const c of infoGraphCases) {
    await prisma.visualCase.update({
      where: { id: c.id },
      data: { distributionMedium: '图组' },
    });
    fixedInfoGraph++;
  }
  console.log(`Fixed ${fixedInfoGraph} 信息图 cases to distributionMedium='图组'\n`);

  // Step 3: Re-apply improved functionalPurpose inference for empty values
  const emptyFpCases = await prisma.visualCase.findMany({
    where: {
      OR: [
        { functionalPurpose: '' },
        { functionalPurpose: '不确定' },
      ],
    },
    select: {
      id: true,
      mediaType: true,
      contentType: true,
      technicalMethod: true,
      sourceDomain: true,
    },
  });

  console.log(`Found ${emptyFpCases.length} cases with empty/uncertain functionalPurpose`);

  function inferFp(mt: string, ct: string, tm: string, sd: string): string {
    const trimmedCt = ct.trim();
    const trimmedTm = tm.trim();
    const trimmedMt = mt.trim();
    const trimmedSd = sd.trim().toLowerCase();

    if (trimmedCt === '科普传播') return '传播';
    if (trimmedCt === '机制模型') return '解释';
    if (trimmedCt === '数据结果') return '数据';
    if (trimmedCt === '微观样本') return '数据';
    if (['单人肖像', '群体肖像', '绘画肖像', '团队场景', '实验过程', '实验设备', '空间环境'].includes(trimmedCt)) return '记录';

    if (trimmedSd.includes('nature.com')) {
      if (trimmedMt === '3D渲染') return '展示';
      if (trimmedMt === '数据可视化') return '数据';
      if (trimmedMt === '信息图') return '解释';
      return '传播';
    }

    if (trimmedTm === '数据') return '数据';
    if (trimmedTm === '成像') return '数据';
    if (trimmedTm === '生成') return '展示';

    if (trimmedMt === '数据可视化') return '数据';
    if (trimmedMt === '3D渲染') return '展示';
    if (trimmedMt === '信息图') return '解释';
    if (trimmedMt === '显微图') return '数据';
    if (trimmedMt === '手绘图') return '解释';

    if (trimmedTm === '拍摄' || trimmedMt === '摄影') return '记录';

    return '不确定';
  }

  let fixedFp = 0;
  const fpDist: Record<string, number> = {};

  for (const c of emptyFpCases) {
    const fp = inferFp(c.mediaType, c.contentType, c.technicalMethod, c.sourceDomain);
    if (fp && fp !== '不确定') {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { functionalPurpose: fp },
      });
      fixedFp++;
      fpDist[fp] = (fpDist[fp] || 0) + 1;
    }
  }
  console.log(`Fixed ${fixedFp} cases with improved functionalPurpose inference`);
  console.log('New functionalPurpose distribution:');
  for (const [label, count] of Object.entries(fpDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label}: ${count}`);
  }

  // Step 4: Summary
  const totalCases = await prisma.visualCase.count();
  const emptyFpRemaining = await prisma.visualCase.count({
    where: { OR: [{ functionalPurpose: '' }, { functionalPurpose: '不确定' }] },
  });
  const emptyDmRemaining = await prisma.visualCase.count({
    where: { OR: [{ distributionMedium: '' }, { distributionMedium: '不确定' }] },
  });

  console.log(`\n=== Fix Summary ===`);
  console.log(`Total cases: ${totalCases}`);
  console.log(`Remaining empty/uncertain functionalPurpose: ${emptyFpRemaining}`);
  console.log(`Remaining empty/uncertain distributionMedium: ${emptyDmRemaining}`);
  console.log(`Video medium fixes: ${fixedVideo}`);
  console.log(`Information graph medium fixes: ${fixedInfoGraph}`);
  console.log(`Functional purpose inference fixes: ${fixedFp}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });