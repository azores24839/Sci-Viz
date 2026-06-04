import { getOssClient, isOssEnabled, getOssPublicUrl } from './services/oss.js';
import { prisma } from './prisma.js';

async function main() {
  console.log('=== OSS 配置状态 ===');
  if (!isOssEnabled()) {
    console.log('OSS 未配置！请检查环境变量 OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET');
    return;
  }
  console.log('OSS 已配置 ✅');
  console.log();

  // 1. 列出 OSS 上前20个文件
  console.log('=== OSS 上前20个文件 ===');
  const client = getOssClient();
  try {
    const listResult = await client.list({ 'max-keys': 20 }, {});
    if (listResult.objects && listResult.objects.length > 0) {
      for (const obj of listResult.objects) {
        console.log(`  ${obj.name}  (${(obj.size / 1024).toFixed(1)} KB)`);
      }
    } else {
      console.log('  OSS bucket 为空！');
    }
  } catch (err: any) {
    console.log(`  列出文件失败: ${err.message}`);
  }
  console.log();

  // 2. 数据库里随机10条记录的路径
  console.log('=== 数据库随机10条记录的图片路径 ===');
  const sampleCases = await prisma.visualCase.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
  for (const c of sampleCases) {
    console.log(`  ID: ${c.id.slice(0, 8)}...`);
    console.log(`    imagePath:     ${c.imagePath || '(空)'}`);
    console.log(`    thumbnailPath: ${c.thumbnailPath || '(空)'}`);
    console.log(`    imageUrl:      ${(c.imageUrl || '(空)').slice(0, 80)}`);
    if (c.imagePath) {
      const relative = c.imagePath.replace(/^\/uploads\//, '');
      const ossUrl = getOssPublicUrl(relative);
      console.log(`    → OSS URL:     ${ossUrl}`);
    }
    console.log();
  }

  // 3. 统计有 imagePath 的案例数
  const [total, withImagePath, withThumbnailPath, withImageUrl] = await Promise.all([
    prisma.visualCase.count(),
    prisma.visualCase.count({ where: { imagePath: { not: '' } } }),
    prisma.visualCase.count({ where: { thumbnailPath: { not: '' } } }),
    prisma.visualCase.count({ where: { imageUrl: { not: '' } } }),
  ]);
  console.log('=== 数据库统计 ===');
  console.log(`  总案例数:           ${total}`);
  console.log(`  有 imagePath:       ${withImagePath}`);
  console.log(`  有 thumbnailPath:   ${withThumbnailPath}`);
  console.log(`  有 imageUrl:        ${withImageUrl}`);
  console.log(`  只有 imageUrl:      ${withImageUrl - withImagePath}`);

  await prisma.$disconnect();
}

main().catch(console.error);
