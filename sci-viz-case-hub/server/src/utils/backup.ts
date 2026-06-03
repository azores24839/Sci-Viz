import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');
const DB_PATH = path.join(__dirname, '..', '..', 'prisma', 'dev.db');

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function backupDatabase(): string {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`数据库文件不存在: ${DB_PATH}`);
  }

  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = formatTimestamp(new Date());
  const backupPath = path.join(BACKUPS_DIR, `dev-${timestamp}.db`);
  fs.copyFileSync(DB_PATH, backupPath);

  return backupPath;
}

export function getBackupsDir(): string {
  return BACKUPS_DIR;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const backupPath = backupDatabase();
    console.log(`已备份数据库：${backupPath}`);
  } catch (err: any) {
    console.error('备份失败:', err.message);
    process.exit(1);
  }
}
