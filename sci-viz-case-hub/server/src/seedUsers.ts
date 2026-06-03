import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('用法: npx tsx src/seedUsers.ts <username> <password>');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`用户 "${username}" 已存在，更新密码...`);
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { username }, data: { passwordHash } });
    console.log(`用户 "${username}" 密码已更新`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { username, passwordHash } });
    console.log(`用户 "${username}" 创建成功`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
