/**
 * 将爬取的 Nature 封面 + AI 分析结果导入到科研视觉案例库
 * 
 * 用法: cd server && npx tsx src/importNatureCovers.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './prisma.js';
import { saveImage } from './services/image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NATURE_COVERS_DIR = path.join(__dirname, '..', '..', '..', 'nature_covers');
const ANALYSIS_FILE  = path.join(__dirname, '..', '..', '..', 'nature_analysis_results.json');

interface AnalysisResult {
  filename: string;
  original_title: string;
  volume: number;
  issue: number;
  date: string;
  description: string;
  analysis: {
    media_type: string;
    content_type: string;
    discipline: string;
    visual_style: string;
    composition: string;
    color_tone: string;
    use_case: string[];
    ai_summary: string;
    case_title: string;
    borrowable_points: string[];
    risk_notes: string[];
    confidence: number;
  };
}

async function importNatureCovers() {
  let analysisData: AnalysisResult[] = [];
  try {
    analysisData = JSON.parse(await fs.readFile(ANALYSIS_FILE, 'utf-8'));
    console.log(`加载分析结果: ${analysisData.length} 条`);
  } catch {
    console.log('分析结果文件不存在，将使用默认值导入');
  }

  const analysisMap = new Map<string, AnalysisResult>();
  for (const item of analysisData) {
    analysisMap.set(item.filename, item);
  }

  const files = (await fs.readdir(NATURE_COVERS_DIR))
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

  if (files.length === 0) {
    console.log('nature_covers 目录中没有图片文件');
    return;
  }

  console.log(`发现 ${files.length} 张封面图片\n`);

  let imported = 0, skipped = 0, failed = 0;

  for (const filename of files) {
    const imgPath = path.join(NATURE_COVERS_DIR, filename);
    const analysis = analysisMap.get(filename);

    if (!analysis) {
      console.log(`  [跳过] 无分析数据: ${filename}`);
      skipped++;
      continue;
    }

    // 检查是否已导入
    const existing = await prisma.visualCase.findFirst({
      where: {
        sourceDomain: 'nature.com',
        title: `Nature Volume ${analysis.volume}, Issue ${analysis.issue}`,
      },
    });
    if (existing) {
      console.log(`  [跳过] 已存在: ${analysis.analysis.case_title}`);
      skipped++;
      continue;
    }

    try {
      const buffer = await fs.readFile(imgPath);
      const ext = path.extname(filename).slice(1);
      const { imagePath, thumbnailPath, imageHash } = await saveImage(buffer, ext);

      const a = analysis.analysis;
      const reviewStatus = a.confidence >= 0.8 ? 'approved' : 'low_confidence_review';

      await prisma.visualCase.create({
        data: {
          title: `Nature Volume ${analysis.volume}, Issue ${analysis.issue}`,
          sourceUrl: `https://www.nature.com/nature/volumes/${analysis.volume}/issues/${analysis.issue}`,
          sourceDomain: 'nature.com',
          pageTitle: `Nature - Vol.${analysis.volume} Iss.${analysis.issue} (${analysis.date})`,
          caseTitle: a.case_title || '',
          imageUrl: '',
          imagePath,
          thumbnailPath,
          imageHash,
          contextText: (analysis.description || '').slice(0, 2000),
          captureType: 'crawler',
          mediaType: a.media_type || '不确定',
          contentType: a.content_type || '不确定',
          discipline: a.discipline || '不确定',
          visualStyle: a.visual_style || '不确定',
          composition: a.composition || '不确定',
          colorTone: a.color_tone || '不确定',
          useCase: JSON.stringify(a.use_case || []),
          aiSummary: a.ai_summary || '',
          borrowablePoints: JSON.stringify(a.borrowable_points || []),
          riskNotes: JSON.stringify(a.risk_notes || []),
          confidence: a.confidence,
          reviewStatus,
          rating: 5,
        },
      });

      imported++;
      console.log(`  [导入] ${a.case_title.padEnd(20)} | ${a.discipline} | ${a.media_type} | ${reviewStatus}`);
    } catch (err: any) {
      failed++;
      console.log(`  [失败] ${filename}: ${err.message}`);
    }
  }

  console.log(`\n导入完成: 成功=${imported}  跳过=${skipped}  失败=${failed}`);
}

importNatureCovers()
  .catch((e) => {
    console.error('导入出错:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
