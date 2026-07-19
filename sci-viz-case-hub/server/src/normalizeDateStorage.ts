import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { backupDatabase } from './utils/backup.js';

type DateStorageRow = {
  id: string;
  createdAt: unknown;
  updatedAt: unknown;
  createdAtType: string;
  updatedAtType: string;
};

function toMilliseconds(value: unknown, column: string, id: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const milliseconds = Date.parse(value);
    if (Number.isFinite(milliseconds)) return milliseconds;
  }
  throw new Error(`无法转换 VisualCase.${column}（id=${id}）为毫秒时间戳`);
}

async function findInvalidRows(): Promise<DateStorageRow[]> {
  return prisma.$queryRaw<DateStorageRow[]>(Prisma.sql`
    SELECT
      id,
      createdAt,
      updatedAt,
      typeof(createdAt) AS createdAtType,
      typeof(updatedAt) AS updatedAtType
    FROM VisualCase
    WHERE typeof(createdAt) != 'integer'
       OR typeof(updatedAt) != 'integer'
    ORDER BY id ASC
  `);
}

async function main() {
  const execute = process.argv.includes('--execute');
  const invalidRows = await findInvalidRows();

  if (invalidRows.length === 0) {
    console.log('通过：VisualCase.createdAt 和 updatedAt 均为 INTEGER 毫秒时间戳。');
    return;
  }

  console.log(`发现 ${invalidRows.length} 条 VisualCase 时间字段不是 INTEGER：`);
  invalidRows.forEach(row => {
    console.log(`- ${row.id}: createdAt=${row.createdAtType}, updatedAt=${row.updatedAtType}`);
  });

  if (!execute) {
    console.log('仅检查，未写入。确认修复请执行：npm run db:normalize-date-storage -- --execute');
    process.exitCode = 1;
    return;
  }

  const backupPath = await backupDatabase();
  console.log(`已创建数据库备份：${backupPath}`);

  await prisma.$transaction(async tx => {
    for (const row of invalidRows) {
      const createdAt = toMilliseconds(row.createdAt, 'createdAt', row.id);
      const updatedAt = toMilliseconds(row.updatedAt, 'updatedAt', row.id);
      await tx.$executeRaw(Prisma.sql`
        UPDATE VisualCase
        SET createdAt = ${new Date(createdAt)}, updatedAt = ${new Date(updatedAt)}
        WHERE id = ${row.id}
      `);
    }
  });

  const remainingRows = await findInvalidRows();
  if (remainingRows.length > 0) {
    throw new Error(`修复后仍有 ${remainingRows.length} 条非 INTEGER 时间字段`);
  }
  console.log(`已修复 ${invalidRows.length} 条记录；时间字段审计通过。`);
}

main()
  .catch(error => {
    console.error('时间字段规范化失败：', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
