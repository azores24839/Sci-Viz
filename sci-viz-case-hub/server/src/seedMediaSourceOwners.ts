import { PrismaClient } from '@prisma/client';
import { inferSourceOwner } from './services/sourceOwner.js';

const prisma = new PrismaClient();

const SOURCES = [
  ['大连理工大学', 'https://www.dlut.edu.cn/', 'H', 'university_news'],
  ['电子科技大学', 'https://www.uestc.edu.cn/', 'H', 'university_news'],
  ['南京大学', 'https://www.nju.edu.cn/', 'H', 'university_news'],
  ['中国海洋大学', 'https://www.ouc.edu.cn/', 'H', 'university_news'],
  ['重庆大学', 'https://www.cqu.edu.cn/', 'H', 'university_news'],
  ['东北大学', 'https://www.neu.edu.cn/', 'H', 'university_news'],
  ['西北工业大学', 'https://www.nwpu.edu.cn/', 'H', 'university_news'],
  ['厦门大学', 'https://www.xmu.edu.cn/', 'H', 'university_news'],
  ['中国农业大学', 'https://www.cau.edu.cn/', 'H', 'university_news'],
  ['同济大学', 'https://www.tongji.edu.cn/', 'H', 'university_news'],
  ['天津大学', 'https://www.tju.edu.cn/', 'H', 'university_news'],
  ['湖南大学', 'https://www.hnu.edu.cn/', 'H', 'university_news'],
  ['武汉大学', 'https://www.whu.edu.cn/', 'H', 'university_news'],
  ['华南理工大学', 'https://www.scut.edu.cn/', 'H', 'university_news'],
  ['ASUS', 'https://www.asus.com/', 'ENT', 'enterprise'],
  ['NIO 蔚来', 'https://www.nio.cn/', 'ENT', 'enterprise'],
  ['Water Online', 'https://www.wateronline.com/', 'M', 'science_media'],
  ['哔哩哔哩', 'https://www.bilibili.com/', 'P', 'video_platform'],
  ['微信公众平台', 'https://mp.weixin.qq.com/', 'P', 'content_platform'],
  ['YouTube', 'https://www.youtube.com/', 'P', 'video_platform'],
] as const;

async function main() {
  const existing = await prisma.crawlSource.findMany({
    select: { id: true, name: true, url: true, category: true, sourceType: true, enabled: true },
  });
  const enabledOwnerKeys = new Set(existing.filter(source => source.enabled).map(source => inferSourceOwner(source).ownerKey));
  let created = 0;

  for (const [name, url, category, sourceType] of SOURCES) {
    const ownerKey = inferSourceOwner({ name, url, category, sourceType }).ownerKey;
    if (enabledOwnerKeys.has(ownerKey)) continue;

    await prisma.crawlSource.create({
      data: {
        name,
        url,
        category,
        sourceType,
        adapterType: 'manual_reference',
        crawlStatus: 'reference_only',
        crawlTier: 'C',
        enabled: true,
        scheduleEnabled: false,
        healthStatus: 'unknown',
        notes: '由已有媒体域名补建的来源机构记录；用于来源归属统计，未启用自动调度。',
      },
    });
    enabledOwnerKeys.add(ownerKey);
    created += 1;
  }

  console.log(`来源机构补齐完成：新增 ${created} 条，已存在 ${SOURCES.length - created} 条。`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
