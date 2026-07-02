import { PrismaClient } from '@prisma/client';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.join(SERVER_ROOT, 'uploads');
const OCR_BINARY = path.join(SERVER_ROOT, '.tmp', 'ocr_image');
const OCR_SWIFT_SCRIPT = path.join(SERVER_ROOT, 'scripts', 'ocr_image.swift');

function uploadPathToFilePath(webPath: string): string {
  if (!webPath.startsWith('/uploads/')) return '';
  const relative = webPath.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOADS_ROOT, relative);
  return filePath.startsWith(UPLOADS_ROOT) ? filePath : '';
}

function cleanOcrText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function runLocalOcr(filePath: string) {
  const binaryExists = await fs.access(OCR_BINARY).then(() => true).catch(() => false);
  if (binaryExists) {
    const { stdout } = await execFileAsync(OCR_BINARY, [filePath], {
      maxBuffer: 1024 * 1024 * 4,
      timeout: 30000,
    });
    return cleanOcrText(stdout);
  }
  const { stdout } = await execFileAsync('swift', [OCR_SWIFT_SCRIPT, filePath], {
    maxBuffer: 1024 * 1024 * 4,
    timeout: 30000,
  });
  return cleanOcrText(stdout);
}

async function main() {
  const startedAt = new Date();
  const args = process.argv.slice(2);
  const domainFilter = args.length > 0 ? args : null;

  const where: any = {
    ocrText: '',
    imagePath: { startsWith: '/uploads/originals/' },
    reviewStatus: { not: 'rejected' },
  };
  if (domainFilter) {
    where.sourceDomain = { in: domainFilter };
    console.log(`Filtering by domains: ${domainFilter.join(', ')}`);
  }

  const cases = await prisma.visualCase.findMany({
    where,
    select: { id: true, sourceDomain: true, imagePath: true, thumbnailPath: true, manualNotes: true },
  });

  let updated = 0;
  let noText = 0;
  let failed = 0;

  for (const c of cases) {
    const filePath = uploadPathToFilePath(c.imagePath) || uploadPathToFilePath(c.thumbnailPath);
    if (!filePath) {
      failed++;
      continue;
    }

    try {
      const text = await runLocalOcr(filePath);
      if (text) {
        await prisma.visualCase.update({
          where: { id: c.id },
          data: { ocrText: text },
        });
        updated++;
      } else {
        await prisma.visualCase.update({
          where: { id: c.id },
          data: {
            ocrText: '[无可读文字]',
            manualNotes: [
              c.manualNotes,
              '本地 Apple Vision OCR：无可读文字',
            ].filter(Boolean).join('\n'),
          },
        });
        noText++;
      }
    } catch {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: {
          ocrText: '[本地OCR失败]',
          manualNotes: [
            c.manualNotes,
            '本地 Apple Vision OCR：执行失败',
          ].filter(Boolean).join('\n'),
        },
      }).catch(() => {});
      failed++;
    }
  }

  const remaining = await prisma.visualCase.count({ where: { ocrText: '' } });
  const domainLabel = domainFilter ? ` (${domainFilter.join(', ')})` : '';
  const lines = [
    '# 本地 OCR 补跑报告' + domainLabel,
    '',
    `开始时间：${startedAt.toISOString()}`,
    `结束时间：${new Date().toISOString()}`,
    '',
    `待 OCR 本地图：${cases.length}`,
    `识别并写入：${updated}`,
    `无可读文字：${noText}`,
    `失败：${failed}`,
    `全库 OCR 仍为空：${remaining}`,
    '',
    '说明：本轮只调用本机 Apple Vision OCR，不调用云 OCR 或外部视觉 API。',
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', `local-ocr-missing-report-${startedAt.toISOString().slice(0,10)}.md`);
  await fs.writeFile(reportPath, `${lines.join('\n')}\n`);
  console.log(`Local OCR report written to ${reportPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
