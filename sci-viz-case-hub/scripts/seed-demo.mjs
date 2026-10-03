import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server/package.json'));
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
try {
  if (await db.visualCase.count() || await db.user.count()) throw new Error('演示初始化拒绝修改已有案例或账号');
  const data = process.env.CASE_HUB_STORAGE_ROOT;
  if (!data || process.env.NODE_ENV === 'production') throw new Error('Demo requires isolated local storage');
  for (const [i, color] of ['#2680b5', '#bc682e', '#397f63'].entries()) {
    const svg = Buffer.from(`<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="600" fill="${color}"/><circle cx="400" cy="280" r="150" fill="white"/><path d="M200 460 L600 460" stroke="white" stroke-width="12"/></svg>`);
    const name = `demo-${i}.png`;
    const original = await sharp(svg).png().toBuffer();
    await writeFile(path.join(data, 'uploads/originals', name), original);
    await sharp(original).resize(300,200).jpeg().toFile(path.join(data,'uploads/thumbnails',`demo-${i}.jpg`));
    if (i === 2) await writeFile(path.join(data, 'journal_covers', name), original);
    await db.visualCase.create({data:{id:`local-demo-${i}`,title:`本地演示案例 ${i+1}`,sourceDomain:'demo.local',imagePath:i===2?`/journal_covers/${name}`:`/uploads/originals/${name}`,thumbnailPath:`/uploads/thumbnails/demo-${i}.jpg`,functionalPurpose:['解释','展示','传播'][i],distributionMedium:'静图',technicalMethod:'绘设',reviewStatus:'approved',manualNotes:'本地演示图片，非真实科研案例'}});
  }
  await db.user.create({data:{username:'demo',passwordHash:await bcrypt.hash('demo-local-only',10)}});
} finally { await db.$disconnect(); }
