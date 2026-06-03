import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OCRResult {
  ocr_text: string;
  raw_response?: unknown;
}

function getOcrConfig() {
  return {
    url: process.env.OCR_API_URL || '',
    key: process.env.OCR_API_KEY || '',
  };
}

function isCloudConfigured(): boolean {
  const { url, key } = getOcrConfig();
  return !!url && !!key
    && !url.includes('your-ocr-api')
    && !key.includes('your-ocr-api');
}

function resolveImagePath(imagePath: string): string {
  const relative = imagePath.replace(/^\/uploads\//, '');
  const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
  return path.join(uploadsDir, relative);
}

function runAppleVisionOCR(imagePath: string): Promise<string> {
  const resolvedPath = resolveImagePath(imagePath);
  const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'ocr_image.swift');
  return new Promise((resolve) => {
    execFile('swift', [scriptPath, resolvedPath], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err || stderr) {
        console.warn(`[OCR] Apple Vision failed: ${stderr || err?.message}`);
        resolve('');
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function performOCR(imagePath: string): Promise<OCRResult> {
  if (isCloudConfigured()) {
    return performCloudOCR(imagePath);
  }
  const text = await runAppleVisionOCR(imagePath);
  return { ocr_text: text };
}

async function performCloudOCR(imagePath: string): Promise<OCRResult> {
  const { url: apiUrl, key: apiKey } = getOcrConfig();

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ image_path: imagePath }),
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.statusText}`);
    }

    const data = await response.json() as OCRResult;
    return data;
  } catch (error) {
    console.error('[OCR] Cloud error:', error);
    return { ocr_text: '' };
  }
}
