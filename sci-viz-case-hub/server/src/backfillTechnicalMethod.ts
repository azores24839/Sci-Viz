import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MEDIA_TYPE_TO_TECHNICAL_METHOD: Record<string, string> = {
  '摄影': '拍摄',
  '显微图': '成像',
  '手绘图': '绘设',
  '信息图': '绘设',
  '3D渲染': '渲染',
  '数据可视化': '数据',
  '混合媒介': '绘设',
};

const VALID_METHODS = new Set(['拍摄', '成像', '绘设', '数据', '渲染', '生成']);

async function main() {
  const all = await prisma.visualCase.findMany({
    select: { id: true, technicalMethod: true, mediaType: true, contentType: true, caseTitle: true, pageTitle: true, contextText: true },
  });

  console.log(`Total cases: ${all.length}`);

  const needsUpdate = all.filter(c => !VALID_METHODS.has(c.technicalMethod));
  console.log(`Cases with non-standard technicalMethod: ${needsUpdate.length}`);

  let updated = 0;
  const methodCounts: Record<string, number> = {};

  for (const c of needsUpdate) {
    let method = MEDIA_TYPE_TO_TECHNICAL_METHOD[c.mediaType];

    if (!method) {
      const text = [c.caseTitle, c.pageTitle, c.contextText].filter(Boolean).join(' ');
      if (/3D|渲染|三维|建模|仿真|render|modeling|simulation/i.test(text)) method = '渲染';
      else if (/显微|电镜|SEM|TEM|成像|microscopy/i.test(text)) method = '成像';
      else if (/数据|图表|可视化|chart|graph|data/i.test(text)) method = '数据';
      else if (/AI|生成|AIGC|diffusion|generative/i.test(text)) method = '生成';
      else method = '拍摄';
    }

    await prisma.visualCase.update({
      where: { id: c.id },
      data: { technicalMethod: method },
    });

    methodCounts[method] = (methodCounts[method] || 0) + 1;
    updated++;
    if (updated % 500 === 0) console.log(`  Updated ${updated}/${needsUpdate.length}...`);
  }

  console.log(`\nBackfill complete: ${updated} cases updated`);
  console.log('\nNew technicalMethod distribution:');
  for (const [method, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${method}: ${count}`);
  }

  const verify = await prisma.visualCase.groupBy({
    by: ['technicalMethod'],
    _count: { _all: true },
  });
  console.log('\nDB verification (all cases):');
  for (const row of verify.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.technicalMethod || '(empty)'}: ${row._count._all}`);
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
