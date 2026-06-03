import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from './prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const OCR_BINARY = path.join(SERVER_ROOT, '.tmp', 'ocr_image');
const OCR_SWIFT_SCRIPT = path.join(SERVER_ROOT, 'scripts', 'ocr_image.swift');
const MODEL = process.env.OCR_VISION_MODEL || 'qwen/qwen3-vl-8b-instruct';
const LIMIT = Number.parseInt(process.env.LIMIT || '0', 10);
const DEBUG = process.env.DEBUG_OCR === '1';
const execFileAsync = promisify(execFile);

function getVisionConfig() {
  return {
    url: process.env.VISION_API_URL || '',
    key: process.env.VISION_API_KEY || '',
  };
}

function mimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

function localPathFromWebPath(webPath: string): string {
  if (webPath.startsWith('/uploads/')) {
    return path.join(SERVER_ROOT, webPath.replace(/^\//, ''));
  }
  if (webPath.startsWith('/journal_covers/')) {
    return path.join(REPO_ROOT, webPath.replace(/^\//, ''));
  }
  return '';
}

async function imageToInput(c: { imagePath: string; thumbnailPath: string; imageUrl: string }) {
  const localCandidates = [c.imagePath, c.thumbnailPath]
    .filter(Boolean)
    .map(localPathFromWebPath)
    .filter(Boolean);

  for (const filePath of localCandidates) {
    try {
      const buffer = await fs.readFile(filePath);
      return `data:${mimeType(filePath)};base64,${buffer.toString('base64')}`;
    } catch {
      // Try the next candidate, then remote URL.
    }
  }

  return c.imageUrl || '';
}

async function firstExistingLocalImage(c: { imagePath: string; thumbnailPath: string }) {
  const localCandidates = [c.imagePath, c.thumbnailPath]
    .filter(Boolean)
    .map(localPathFromWebPath)
    .filter(Boolean);

  for (const filePath of localCandidates) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Try the next candidate.
    }
  }

  return '';
}

function cleanOcrText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, block => block.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''))
    .replace(/^["']|["']$/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function ocrImage(imageInput: string, context: string): Promise<string> {
  const { url, key } = getVisionConfig();
  if (!url || !key || key.includes('your-')) {
    throw new Error('VISION_API_URL / VISION_API_KEY is not configured');
  }
  if (!imageInput) return '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an OCR engine. Extract visible text from the image. Return plain text only. Keep line breaks where useful. Do not describe the image. If there is no readable text, return an empty string.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all visible text from this Nature / Nature-family cover image.${context ? `\nContext: ${context}` : ''}`,
            },
            { type: 'image_url', image_url: { url: imageInput } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Vision OCR API ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
  };
  if (DEBUG) {
    const msg = data.choices?.[0]?.message;
    console.log('[nature-ocr] raw message:', JSON.stringify({
      content: msg?.content,
      reasoning: msg?.reasoning,
    }, null, 2).slice(0, 1200));
  }
  const text = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.message?.reasoning
    || '';
  return cleanOcrText(text);
}

async function ocrLocalImage(filePath: string): Promise<string> {
  try {
    await fs.access(OCR_BINARY);
    const { stdout } = await execFileAsync(OCR_BINARY, [filePath], {
      maxBuffer: 1024 * 1024 * 4,
    });
    return cleanOcrText(stdout);
  } catch (binaryError) {
    if (DEBUG) console.warn('[nature-ocr] binary OCR failed, trying swift:', binaryError);
    const { stdout } = await execFileAsync('swift', [OCR_SWIFT_SCRIPT, filePath], {
      maxBuffer: 1024 * 1024 * 4,
    });
    return cleanOcrText(stdout);
  }
}

async function main() {
  const where = {
    sourceDomain: { contains: 'nature.com' },
    ocrText: '',
  };
  const total = await prisma.visualCase.count({ where });
  const take = LIMIT > 0 ? Math.min(LIMIT, total) : total;
  const cases = await prisma.visualCase.findMany({
    where,
    take,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      pageTitle: true,
      caseTitle: true,
      imagePath: true,
      thumbnailPath: true,
      imageUrl: true,
      contextText: true,
    },
  });

  console.log(`[nature-ocr] ${total} Nature cases need OCR. Processing ${cases.length}.`);
  let updated = 0;
  let empty = 0;
  let failed = 0;

  for (let i = 0; i < cases.length; i += 1) {
    const c = cases[i];
    const label = c.caseTitle || c.pageTitle || c.title || c.id;
    try {
      const context = [c.caseTitle, c.pageTitle, c.contextText].filter(Boolean).join('\n').slice(0, 1200);
      const localImage = await firstExistingLocalImage(c);
      const text = localImage
        ? await ocrLocalImage(localImage)
        : await ocrImage(await imageToInput(c), context);
      if (text) {
        await prisma.visualCase.update({
          where: { id: c.id },
          data: { ocrText: text },
        });
        updated += 1;
      } else {
        empty += 1;
      }
      console.log(`[nature-ocr] ${i + 1}/${cases.length} ${text ? 'updated' : 'empty'} ${label}`);
    } catch (error) {
      failed += 1;
      console.error(`[nature-ocr] ${i + 1}/${cases.length} failed ${label}:`, error);
    }
  }

  console.log(`[nature-ocr] done. updated=${updated} empty=${empty} failed=${failed}`);
}

main()
  .catch(error => {
    console.error('[nature-ocr] fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
