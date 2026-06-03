/**
 * 批量导入 Springer Nature 期刊封面到案例库 (直接引用路径版)
 * 用法: cd server && npx tsx src/importAllCovers.ts
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COVERS_ROOT = path.join(__dirname, '..', '..', '..', 'journal_covers');

interface IssueInfo {
  volume: number;
  issue: number;
  date: string;
  description: string;
  issue_url: string;
}

interface JournalConfig {
  name: string;
  id: number;
  path: string;
  discipline: string;
}

const JOURNALS: Record<string, JournalConfig> = {
  nature:    { name: 'Nature',                       id: 41586, path: 'nature',    discipline: '综合交叉' },
  nmat:      { name: 'Nature Materials',             id: 41563, path: 'nmat',      discipline: '材料' },
  nphys:     { name: 'Nature Physics',               id: 41567, path: 'nphys',     discipline: '物理' },
  nchem:     { name: 'Nature Chemistry',             id: 41557, path: 'nchem',     discipline: '化学' },
  ncb:       { name: 'Nature Cell Biology',          id: 41556, path: 'ncb',       discipline: '生命科学' },
  nmeth:     { name: 'Nature Methods',               id: 41592, path: 'nmeth',     discipline: '信息科学' },
  ng:        { name: 'Nature Genetics',              id: 41588, path: 'ng',        discipline: '生命科学' },
  nnano:     { name: 'Nature Nanotechnology',        id: 41565, path: 'nnano',     discipline: '材料' },
  nphoton:   { name: 'Nature Photonics',             id: 41566, path: 'nphoton',   discipline: '物理' },
};

async function importJournal(key: string, cfg: JournalConfig) {
  const cacheFile = path.join(COVERS_ROOT, `.cache_${key}.json`);
  const coverDir = path.join(COVERS_ROOT, key);

  let issues: IssueInfo[] = [];
  try {
    issues = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
  } catch {
    console.log(`  [${cfg.name}] 缓存不存在，跳过`);
    return { imported: 0, skipped: 0 };
  }

  let existingFiles: string[];
  try {
    existingFiles = await fs.readdir(coverDir);
    existingFiles = existingFiles.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  } catch {
    console.log(`  [${cfg.name}] 无图片目录，跳过`);
    return { imported: 0, skipped: 0 };
  }

  let imported = 0, skipped = 0;

  for (const iss of issues) {
    const vol = iss.volume;
    const issNum = iss.issue;
    const imgPattern = new RegExp(`^${cfg.id}_${vol}_${issNum}_`);
    const matchFile = existingFiles.find(f => imgPattern.test(f));
    if (!matchFile) continue;

    // 引用路径 (不复制)
    const imagePath = `/journal_covers/${key}/${matchFile}`;
    const stem = matchFile.replace(/\.[^.]+$/, '');
    const thumbnailPath = `/journal_covers/${key}/thumbnails/${stem}_thumb.jpg`;

    // 检查缩略图是否存在
    try {
      await fs.access(path.join(COVERS_ROOT, key, 'thumbnails', `${stem}_thumb.jpg`));
    } catch {
      continue; // 无缩略图跳过
    }

    // 检查数据库重复
    const exists = await prisma.visualCase.findFirst({
      where: {
        sourceDomain: 'nature.com',
        imagePath,
      },
    });
    if (exists) { skipped++; continue; }

    try {
      await prisma.visualCase.create({
        data: {
          title: `${cfg.name} Volume ${vol}, Issue ${issNum}`,
          sourceUrl: iss.issue_url || `https://www.nature.com/${cfg.path}/volumes/${vol}/issues/${issNum}`,
          sourceDomain: 'nature.com',
          pageTitle: `${cfg.name} - Volume ${vol} Issue ${issNum}`,
          caseTitle: `${cfg.name} 封面 - ${iss.date}`,
          imageUrl: `https://media.springernature.com/full/springer-static/cover-hires/journal/${cfg.id}/${vol}/${issNum}`,
          imagePath,
          thumbnailPath,
          contextText: (iss.description || '').slice(0, 2000),
          captureType: 'crawler',
          mediaType: '不确定',
          contentType: '科普传播',
          discipline: cfg.discipline,
          visualStyle: '顶刊封面',
          aiSummary: (iss.description || '').slice(0, 500),
          reviewStatus: 'approved',
          rating: 5,
        },
      });
      imported++;
    } catch (err: any) {
      if (skipped + imported < 5) console.log(`  [${cfg.name}] DB error: ${err.message}`);
    }

    if (imported > 0 && imported % 200 === 0) {
      console.log(`  [${cfg.name}] ${imported} 已导入...`);
    }
  }

  console.log(`  [${cfg.name}] 导入=${imported} 跳过=${skipped} (已存在)`);
  return { imported, skipped };
}

async function main() {
  console.log('批量导入期刊封面 (直接引用文件路径)...\n');

  let totalImported = 0, totalSkipped = 0;

  for (const [key, cfg] of Object.entries(JOURNALS)) {
    console.log(`--- ${cfg.name} ---`);
    const result = await importJournal(key, cfg);
    totalImported += result.imported;
    totalSkipped += result.skipped;
  }

  console.log(`\n全部完成: 新导入=${totalImported} 已存在=${totalSkipped}`);
}

main()
  .catch(e => { console.error('Fatal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
