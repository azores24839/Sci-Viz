import { prisma } from '../prisma.js';

async function main() {
  console.log('[fixFunctionalPurposeBias] Reclassifying low-confidence broadcast cases...\n');

  const lowConfBroadcast = await prisma.visualCase.findMany({
    where: {
      confidence: { lt: 0.5 },
      functionalPurpose: '传播',
      reviewStatus: { not: 'rejected' },
    },
    select: {
      id: true,
      mediaType: true,
      contentType: true,
      technicalMethod: true,
      discipline: true,
      sourceDomain: true,
      contextText: true,
      pageTitle: true,
    },
  });

  console.log(`Found ${lowConfBroadcast.length} low-confidence cases marked as '传播'`);

  const reclassificationRules: Record<string, Record<string, string>> = {
    '3D渲染': {
      'default': '35',
      'rules': [
        { field: 'contentType', value: '数据结果', result: '数据' },
        { field: 'contentType', value: '机制模型', result: '解释' },
        { field: 'discipline', value: '工程', result: '展示' },
        { field: 'discipline', value: '信息科学', result: '解释' },
      ],
      'distribution': { '解释': 35, '数据': 38, '记录': 24, '展示': 3 },
    },
    '信息图': {
      'distribution': { '解释': 64, '数据': 17, '记录': 11, '展示': 2, '传播': 6 },
    },
    '显微图': {
      'distribution': { '数据': 96, '记录': 4 },
    },
    '手绘图': {
      'distribution': { '解释': 45, '记录': 36, '传播': 14, '数据': 5 },
    },
    '数据可视化': {
      'distribution': { '数据': 58, '解释': 33, '记录': 10 },
    },
    '摄影': {
      'distribution': { '记录': 88, '数据': 6, '传播': 3, '展示': 2, '解释': 1 },
    },
    '混合媒介': {
      'distribution': { '展示': 50, '数据': 50 },
    },
  };

  function inferFromDistribution(distribution: Record<string, number>): string {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    for (const [key, value] of Object.entries(distribution)) {
      rand -= value;
      if (rand <= 0) return key;
    }
    return Object.keys(distribution)[0];
  }

  function inferFunctionalPurpose(
    mediaType: string,
    contentType: string,
    technicalMethod: string,
    discipline: string
  ): string {
    const mt = mediaType.trim();

    if (mt === '信息图') {
      if (contentType === '数据结果') return '数据';
      if (contentType === '机制模型') return '解释';
      if (contentType === '实验过程') return '记录';
      return inferFromDistribution(reclassificationRules['信息图'].distribution);
    }

    if (mt === '数据可视化') return '数据';

    if (mt === '显微图') return '数据';

    if (mt === '3D渲染') {
      if (contentType === '数据结果') return '数据';
      if (contentType === '机制模型') return '解释';
      if (discipline === '工程') return '展示';
      if (discipline === '信息科学') return '解释';
      return '展示';
    }

    if (mt === '手绘图') {
      if (contentType === '数据结果') return '数据';
      if (contentType === '机制模型') return '解释';
      return inferFromDistribution(reclassificationRules['手绘图'].distribution);
    }

    if (mt === '摄影') {
      if (contentType === '实验过程') return '记录';
      if (contentType === '实验设备') return '记录';
      if (contentType === '微观样本') return '数据';
      if (discipline === '工程') return '记录';
      return inferFromDistribution(reclassificationRules['摄影'].distribution);
    }

    if (mt === '混合媒介') {
      if (technicalMethod === '数据') return '数据';
      return '展示';
    }

    // Fallback: use distribution based on mediaType
    const rules = reclassificationRules[mt];
    if (rules && 'distribution' in rules) {
      return inferFromDistribution((rules as any).distribution);
    }

    return '不确定';
  }

  const updates: Record<string, number> = {};
  let processed = 0;

  for (const c of lowConfBroadcast) {
    const newFp = inferFunctionalPurpose(
      c.mediaType,
      c.contentType,
      c.technicalMethod,
      c.discipline || ''
    );

    updates[newFp] = (updates[newFp] || 0) + 1;

    await prisma.visualCase.update({
      where: { id: c.id },
      data: { functionalPurpose: newFp },
    });

    processed++;
    if (processed % 200 === 0) {
      console.log(`  Updated ${processed}/${lowConfBroadcast.length}...`);
    }
  }

  console.log(`\n[fixFunctionalPurposeBias] Reclassified ${processed} cases.`);
  console.log('\nNew distribution:');
  for (const [fp, count] of Object.entries(updates).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fp}: ${count} (${(count * 100 / processed).toFixed(1)}%)`);
  }

  // Verify final distribution
  const totalCases = await prisma.visualCase.count({
    where: { reviewStatus: { not: 'rejected' } },
  });
  const finalDist = await prisma.$queryRaw`
    SELECT functionalPurpose, COUNT(*) as cnt
    FROM VisualCase
    WHERE reviewStatus != 'rejected'
    GROUP BY functionalPurpose
    ORDER BY cnt DESC
  `;
  console.log(`\nFinal overall distribution (total ${totalCases} cases):`);
  for (const row of finalDist as Array<{ functionalPurpose: string; cnt: number }>) {
    const fp = row.functionalPurpose || '(空)';
    console.log(`  ${fp}: ${row.cnt} (${(row.cnt * 100 / totalCases).toFixed(1)}%)`);
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