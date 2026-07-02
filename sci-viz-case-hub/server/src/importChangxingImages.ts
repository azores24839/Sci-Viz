/**
 * 将长兴海洋实验室爬取的图片导入到科研视觉案例库
 *
 * 用法: cd server && npx tsx src/importChangxingImages.ts
 */
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './prisma.js';
import { saveImage } from './services/image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMAGES_DIR = path.join(__dirname, '..', '..', '..', 'sjtu_platform_media', 'changxing');
const SOURCES_FILE = path.join(IMAGES_DIR, 'image_sources.json');

interface ImageSources {
  [filename: string]: string;
}

function getExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpeg') return '.jpg';
  return ext;
}

async function importImages() {
  let imageSources: ImageSources = {};
  try {
    imageSources = JSON.parse(await fs.readFile(SOURCES_FILE, 'utf-8'));
    console.log(`加载图片来源映射: ${Object.keys(imageSources).length} 条`);
  } catch {
    console.log('image_sources.json 不存在，将使用默认源URL');
  }

  const files = (await fs.readdir(IMAGES_DIR))
    .filter(f => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f));

  if (files.length === 0) {
    console.log('changxing 目录中没有图片文件');
    return;
  }

  console.log(`发现 ${files.length} 张图片\n`);

  const SKIP_FILES = new Set([
    'event_more2.png',
    'banner_bg.png',
    'banner_xwdt.png',
    'banner_kjgg.png',
    'banner_dj.png',
    'footer_logo.png',
    'weixin.png',
  ]);

  let imported = 0, skipped = 0, failed = 0;

  for (const filename of files) {
    if (SKIP_FILES.has(filename)) {
      skipped++;
      continue;
    }

    const imgPath = path.join(IMAGES_DIR, filename);
    const sourceUrl = imageSources[filename] || 'https://ime.sjtu.edu.cn';

    const stat = fsSync.statSync(imgPath);
    if (stat.size < 500) {
      console.log(`  [跳过] 文件太小: ${filename}`);
      skipped++;
      continue;
    }

    const ext = getExt(filename);

    try {
      const buffer = await fs.readFile(imgPath);
      const result = await saveImage(buffer, ext);

      const parsed = new URL(sourceUrl);

      const exists = await prisma.visualCase.findFirst({
        where: { imageHash: result.imageHash },
      });

      if (exists) {
        console.log(`  [跳过] 重复: ${filename}`);
        skipped++;
        continue;
      }

      await prisma.visualCase.create({
        data: {
          sourceUrl,
          sourceDomain: 'ime.sjtu.edu.cn',
          pageTitle: '',
          imageUrl: sourceUrl,
          imagePath: result.imagePath,
          thumbnailPath: result.thumbnailPath,
          imageHash: result.imageHash,
          captureType: 'crawler',
          reviewStatus: 'pending_ai_analysis',
        },
      });

      imported++;
      if (imported % 20 === 0) {
        console.log(`  已导入 ${imported} 张...`);
      }
    } catch (err: any) {
      console.error(`  [失败] ${filename}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n完成! 导入: ${imported}, 跳过: ${skipped}, 失败: ${failed}`);
}

importImages()
  .then(() => {
    console.log('导入脚本执行完毕');
    process.exit(0);
  })
  .catch((err) => {
    console.error('导入失败:', err);
    process.exit(1);
  });
