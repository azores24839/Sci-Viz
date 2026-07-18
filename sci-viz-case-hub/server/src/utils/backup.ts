import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');
const DB_PATH = path.join(__dirname, '..', '..', 'prisma', 'dev.db');

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${millis}`;
}

export async function backupDatabase(backupDirectory = BACKUPS_DIR): Promise<string> {
  await fs.access(DB_PATH);
  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = formatTimestamp(new Date());
  const backupPath = path.join(backupDirectory, `dev-${timestamp}.db`);
  const escapedPath = backupPath.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedPath}'`);

  return backupPath;
}

export function getBackupsDir(): string {
  return BACKUPS_DIR;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  backupDatabase().then(backupPath => {
    console.log(`已备份数据库：${backupPath}`);
  }).catch((err: unknown) => {
    console.error('备份失败:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
