import { PrismaClient, type VisualCase } from '@prisma/client';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createImageHash } from './services/image.js';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.join(SERVER_ROOT, 'uploads');
const ORIGINALS_DIR = path.join(UPLOADS_ROOT, 'originals');
const THUMBNAILS_DIR = path.join(UPLOADS_ROOT, 'thumbnails');

type CaseLite = Pick<VisualCase,
  'id' | 'imagePath' | 'thumbnailPath' | 'imageHash'
>;

function uploadPathToFilePath(webPath: string): string | null {
  if (!webPath.startsWith('/uploads/')) return null;
  const relative = webPath.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOADS_ROOT, relative);
  return filePath.startsWith(UPLOADS_ROOT) ? filePath : null;
}

function localImagePath(c: Pick<VisualCase, 'imagePath' | 'thumbnailPath'>): string {
  for (const webPath of [c.imagePath, c.thumbnailPath]) {
    const filePath = uploadPathToFilePath(webPath || '');
    if (filePath && fsSync.existsSync(filePath)) return filePath;
  }
  return '';
}

async function auditOrphanOriginals() {
  const files = await fs.readdir(ORIGINALS_DIR).catch(() => []);
  const referenced = new Set(
    (await prisma.visualCase.findMany({
      where: { imagePath: { startsWith: '/uploads/originals/' } },
      select: { imagePath: true },
    })).map(c => c.imagePath)
  );

  return files
    .filter(file => !file.startsWith('.'))
    .map(file => `/uploads/originals/${file}`)
    .filter(webPath => !referenced.has(webPath));
}

async function backfillHashes(cases: CaseLite[]) {
  let updated = 0;
  let skipped = 0;

  for (const c of cases) {
    if (c.imageHash) continue;
    const filePath = localImagePath(c);
    if (!filePath) {
      skipped++;
      continue;
    }

    try {
      const buffer = await fs.readFile(filePath);
      await prisma.visualCase.update({
        where: { id: c.id },
        data: {
          imageHash: createImageHash(buffer),
        },
      });
      updated++;
    } catch {
      skipped++;
    }
  }

  return { updated, skipped };
}

async function ensureThumbnails(cases: CaseLite[]) {
  let created = 0;
  let skipped = 0;

  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  for (const c of cases) {
    if (!c.imagePath.startsWith('/uploads/originals/')) continue;
    const existingThumb = c.thumbnailPath.startsWith('/uploads/thumbnails/')
      ? uploadPathToFilePath(c.thumbnailPath)
      : null;
    if (existingThumb && fsSync.existsSync(existingThumb)) continue;

    const originalPath = uploadPathToFilePath(c.imagePath);
    if (!originalPath || !fsSync.existsSync(originalPath)) {
      skipped++;
      continue;
    }

    try {
      const parsed = path.parse(originalPath);
      const thumbName = `${parsed.name}_thumb.jpg`;
      const thumbPath = path.join(THUMBNAILS_DIR, thumbName);
      await sharp(originalPath)
        .resize(300, 200, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
      await prisma.visualCase.update({
        where: { id: c.id },
        data: { thumbnailPath: `/uploads/thumbnails/${thumbName}` },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  return { created, skipped };
}

async function approveCompleteCases() {
  const result = await prisma.visualCase.updateMany({
    where: {
      reviewStatus: { in: ['needs_review', 'low_confidence_review', 'pending_ai_analysis'] },
      imagePath: { not: '' },
      caseTitle: { not: '' },
      discipline: { notIn: ['', '不确定'] },
      mediaType: { notIn: ['', '不确定'] },
      contentType: { notIn: ['', '不确定'] },
      technicalMethod: { notIn: ['', '不确定'] },
    },
    data: { reviewStatus: 'approved' },
  });
  return result.count;
}

async function finalCounts() {
  const [
    total,
    byStatus,
    missingCore,
    missingHash,
    missingThumbnail,
    missingOcr,
  ] = await Promise.all([
    prisma.visualCase.count(),
    prisma.visualCase.groupBy({ by: ['reviewStatus'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.visualCase.count({
      where: {
        OR: [
          { caseTitle: '' },
          { discipline: { in: ['', '不确定'] } },
          { mediaType: { in: ['', '不确定'] } },
          { contentType: { in: ['', '不确定'] } },
          { technicalMethod: { in: ['', '不确定'] } },
        ],
      },
    }),
    prisma.visualCase.count({
      where: {
        imagePath: { startsWith: '/uploads/originals/' },
        imageHash: '',
      },
    }),
    prisma.visualCase.count({
      where: {
        imagePath: { startsWith: '/uploads/originals/' },
        OR: [{ thumbnailPath: '' }, { thumbnailPath: { not: { startsWith: '/uploads/thumbnails/' } } }],
      },
    }),
    prisma.visualCase.count({ where: { ocrText: '' } }),
  ]);

  return { total, byStatus, missingCore, missingHash, missingThumbnail, missingOcr };
}

async function main() {
  const startedAt = new Date();
  const before = await finalCounts();
  const orphanOriginals = await auditOrphanOriginals();

  const allLocalCases = await prisma.visualCase.findMany({
    where: { imagePath: { startsWith: '/uploads/originals/' } },
    select: {
      id: true,
      imagePath: true,
      thumbnailPath: true,
      imageHash: true,
    },
  });

  const hashResult = await backfillHashes(allLocalCases);
  const thumbnailResult = await ensureThumbnails(allLocalCases);
  const approvedCount = await approveCompleteCases();
  const after = await finalCounts();

  const reportLines = [
    '# 本地图片资产收尾入库报告',
    '',
    `开始时间：${startedAt.toISOString()}`,
    `结束时间：${new Date().toISOString()}`,
    '',
    '## 执行摘要',
    '',
    `- 本地未入库原图：${orphanOriginals.length}`,
    `- 补哈希：updated=${hashResult.updated}, skipped=${hashResult.skipped}`,
    `- 补缩略图：created=${thumbnailResult.created}, skipped=${thumbnailResult.skipped}`,
    `- 本次置为 approved：${approvedCount}`,
    '',
    '## 执行前',
    '',
    `- 总量：${before.total}`,
    `- 缺核心标签：${before.missingCore}`,
    `- 本地图缺哈希：${before.missingHash}`,
    `- 本地图缺缩略图：${before.missingThumbnail}`,
    `- OCR 为空：${before.missingOcr}`,
    '',
    '## 执行后',
    '',
    `- 总量：${after.total}`,
    `- 缺核心标签：${after.missingCore}`,
    `- 本地图缺哈希：${after.missingHash}`,
    `- 本地图缺缩略图：${after.missingThumbnail}`,
    `- OCR 为空：${after.missingOcr}`,
    '',
    '## 状态分布',
    '',
    '| 状态 | 数量 |',
    '|---|---:|',
    ...after.byStatus.map(row => `|${row.reviewStatus || '(空)'}|${row._count.id}|`),
    '',
    '## 未入库原图',
    '',
    orphanOriginals.length ? orphanOriginals.map(file => `- ${file}`).join('\n') : '- 无',
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'finalize-local-image-assets-report-2026-05-31.md');
  await fs.writeFile(reportPath, `${reportLines.join('\n')}\n`);
  console.log(`Local finalize report written to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
