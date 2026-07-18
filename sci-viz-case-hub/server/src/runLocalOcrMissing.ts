import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getVisionConfig, getVisionHeaders } from './services/visionConfig.js';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');
const UPLOADS_ROOT = path.join(SERVER_ROOT, 'uploads');

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

function localPathFromWebPath(webPath: string): string {
  if (webPath.startsWith('/uploads/')) {
    return path.join(SERVER_ROOT, webPath.replace(/^\//, ''));
  }
  return '';
}

function mimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function imageToBase64(webPath: string): Promise<string> {
  const local = localPathFromWebPath(webPath);
  if (!local) return '';
  try {
    const buffer = await fs.readFile(local);
    return `data:${mimeType(local)};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function runCloudOcr(webPath: string, context: string): Promise<string> {
  const { url, key, ocrModel } = getVisionConfig();
  if (!url || !key || key.includes('your-')) {
    console.warn('[ocr-cloud] config missing');
    return '';
  }
  const imageInput = await imageToBase64(webPath);
  if (!imageInput) {
    console.warn('[ocr-cloud] imageToBase64 failed for', webPath.slice(0, 80));
    return '';
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: getVisionHeaders(key),
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: ocrModel,
        messages: [
          {
            role: 'system',
            content: 'You are an OCR engine. Extract visible text from the image. Return plain text only. Keep line breaks where useful. Do not describe the image. If there is no readable text, return an empty string.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Extract all visible text.${context ? `\nContext: ${context}` : ''}` },
              { type: 'image_url', image_url: { url: imageInput } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn(`[ocr-cloud] API ${response.status}: ${errBody.slice(0, 200)}`);
      return '';
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || '';
    return cleanOcrText(text);
  } catch (e: any) {
    console.warn(`[ocr-cloud] fetch error: ${e.message}`);
    return '';
  }
}

async function main() {
  const startedAt = new Date();
  const args = process.argv.slice(2);
  const domainFilter = args.length > 0 ? args : null;

  const where: any = {
    OR: [
      { ocrText: '' },
      { ocrText: '[无可读文字]' },
    ],
    imagePath: { startsWith: '/uploads/originals/' },
    reviewStatus: { not: 'rejected' },
  };
  if (domainFilter) {
    where.sourceDomain = { in: domainFilter };
    console.log(`Filtering by domains: ${domainFilter.join(', ')}`);
  }

  const cases = await prisma.visualCase.findMany({
    where,
    select: { id: true, sourceDomain: true, imagePath: true, thumbnailPath: true, manualNotes: true, contextText: true, caseTitle: true, pageTitle: true },
  });

  let cloudUpdated = 0;
  let noText = 0;
  let failed = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (i % 10 === 0) {
      console.log(`[ocr] ${i + 1}/${cases.length} (cloud=${cloudUpdated} noText=${noText} failed=${failed})`);
    }
    const filePath = uploadPathToFilePath(c.imagePath) || uploadPathToFilePath(c.thumbnailPath);
    if (!filePath) {
      failed++;
      continue;
    }

    const context = [c.caseTitle, c.pageTitle, c.contextText].filter(Boolean).join('\n').slice(0, 1200);

    try {
      const text = await runCloudOcr(c.imagePath, context);
      if (text) {
        await prisma.visualCase.update({
          where: { id: c.id },
          data: { ocrText: text },
        });
        cloudUpdated++;
        continue;
      }

      await prisma.visualCase.update({
        where: { id: c.id },
        data: {
          ocrText: '[无可读文字]',
          manualNotes: [
            c.manualNotes,
            'Qwen VL OCR：无可读文字',
          ].filter(Boolean).join('\n'),
        },
      });
      noText++;
    } catch {
      await prisma.visualCase.update({
        where: { id: c.id },
        data: {
          ocrText: '[OCR失败]',
          manualNotes: [
            c.manualNotes,
            'Qwen VL OCR：执行失败',
          ].filter(Boolean).join('\n'),
        },
      }).catch(() => {});
      failed++;
    }
  }

  const remaining = await prisma.visualCase.count({ where: { OR: [{ ocrText: '' }, { ocrText: '[无可读文字]' }] } });
  const domainLabel = domainFilter ? ` (${domainFilter.join(', ')})` : '';
  const lines = [
    '# 本地 OCR 补跑报告' + domainLabel,
    '',
    `开始时间：${startedAt.toISOString()}`,
    `结束时间：${new Date().toISOString()}`,
    '',
    `待 OCR 本地图：${cases.length}`,
    `云 OCR 识别：${cloudUpdated}`,
    `无可读文字：${noText}`,
    `失败：${failed}`,
    `全库 OCR 仍为空：${remaining}`,
    '',
    '说明：使用 OpenRouter Qwen VL 视觉模型进行 OCR 提取。',
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
