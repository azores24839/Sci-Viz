import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SJTU_PREFIX = 'SJTU 高质量科研可视化补强批次';
const QUALITY_FOCUS = 'quality_focus: non_news_gallery_or_technical_visual';

const SOURCE_MAPPINGS = [
  {
    school: '环境科学与工程学院',
    discipline: '环境科学',
    sourceName: 'NASA Earth Observatory',
    domain: 'science.nasa.gov',
    crawlSourceName: 'NASA Earth Observatory',
    reviewStatuses: ['approved'],
  },
  {
    school: '环境科学与工程学院',
    discipline: '环境科学',
    sourceName: 'USGS Landsat Multimedia',
    domain: 'www.usgs.gov',
    crawlSourceName: 'USGS Landsat Multimedia',
    reviewStatuses: ['approved'],
  },
  {
    school: '船舶海洋与建筑工程学院',
    discipline: '工程',
    sourceName: 'Kongsberg Maritime',
    domain: 'www.kongsbergmaritime.com',
    crawlSourceName: 'Kongsberg Maritime',
    reviewStatuses: ['approved'],
  },
  {
    school: '船舶海洋与建筑工程学院',
    discipline: '工程',
    sourceName: 'Arup Projects',
    domain: 'www.arup.com',
    crawlSourceName: 'Arup Projects',
    reviewStatuses: ['approved'],
  },
  {
    school: '船舶海洋与建筑工程学院',
    discipline: '工程',
    sourceName: 'Autodesk Newsroom',
    domain: 'adsknews.autodesk.com',
    crawlSourceName: 'Autodesk Newsroom',
    reviewStatuses: ['approved'],
  },
  {
    school: '电气工程学院',
    discipline: '工程',
    sourceName: 'Schneider Electric Newsroom',
    domain: 'www.se.com',
    crawlSourceName: 'Schneider Electric Newsroom',
    reviewStatuses: ['approved'],
  },
  {
    school: '电气工程学院',
    discipline: '工程',
    sourceName: 'Eaton News Releases',
    domain: 'www.eaton.com',
    crawlSourceName: 'Eaton News Releases',
    reviewStatuses: ['approved'],
  },
];

function appendSjtuNotes(existing: string, school: string, sourceName: string) {
  const trimmed = existing.trim();
  const suffix = [
    `${SJTU_PREFIX}：${school}`,
    `source: ${sourceName}`,
    QUALITY_FOCUS,
    'mapping_note: existing approved high-score case reused for SJTU visual supplement',
  ].join('\n');
  return trimmed ? `${trimmed}\n${suffix}` : suffix;
}

async function main() {
  let totalMapped = 0;

  for (const mapping of SOURCE_MAPPINGS) {
    const cases = await prisma.visualCase.findMany({
      where: {
        sourceDomain: mapping.domain,
        collectionScore: { gte: 60 },
        reviewStatus: { in: mapping.reviewStatuses },
        manualNotes: { not: { contains: `${SJTU_PREFIX}：${mapping.school}` } },
      },
      select: {
        id: true,
        manualNotes: true,
      },
    });

    for (const item of cases) {
      await prisma.visualCase.update({
        where: { id: item.id },
        data: {
          discipline: mapping.discipline,
          manualNotes: appendSjtuNotes(item.manualNotes, mapping.school, mapping.sourceName),
        },
      });
    }

    const source = await prisma.crawlSource.findFirst({ where: { name: mapping.crawlSourceName } });
    if (source && !source.notes.includes('program: sjtu_visual_supplement_2026_06')) {
      await prisma.crawlSource.update({
        where: { id: source.id },
        data: {
          crawlStatus: source.crawlStatus === 'dry_run_required' ? 'active_static' : source.crawlStatus,
          notes: [
            source.notes.trim(),
            `target_sjtu_school: ${mapping.school}`,
            'program: sjtu_visual_supplement_2026_06',
            QUALITY_FOCUS,
            'mapping_note: existing approved high-score cases are mapped into the SJTU supplement set',
          ].filter(Boolean).join('\n'),
        },
      });
    }

    totalMapped += cases.length;
    console.log(`${mapping.sourceName}: mapped ${cases.length} existing high-score cases`);
  }

  console.log(`Mapped ${totalMapped} existing high-score engineering/environment cases into SJTU supplement notes.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
