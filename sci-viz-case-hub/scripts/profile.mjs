import { parseEnv } from 'node:util';
import { existsSync, mkdirSync, copyFileSync, chmodSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

async function main() {
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'server');
const mode = process.argv[2];
const demo = process.argv.includes('--demo');
const check = process.argv.includes('--check');
if (mode !== 'local') throw new Error('For online startup use: bash scripts/start-online.sh');
const file = path.resolve(root, process.env.CASE_HUB_LOCAL_CONFIG || 'config/local.env');
if (!existsSync(file)) {
  if (process.env.CASE_HUB_LOCAL_CONFIG) throw new Error('Specified local settings file does not exist');
  mkdirSync(path.dirname(file), { recursive: true });
  copyFileSync(file + '.example', file); chmodSync(file, 0o600);
}
const settings = parseEnv(readFileSync(file, 'utf8'));
const data = path.resolve(root, settings.CASE_HUB_DATA_DIR || '.local-data');
const port = Number(settings.PORT || 3001);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Local PORT must be between 1024 and 65535');
if (!['127.0.0.1', 'localhost', '::1'].includes(settings.HOST || '127.0.0.1')) throw new Error('Local HOST must be a loopback address');
// File settings win, and unrelated machine-level API keys never leak into the demo.
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...settings,
  CORS_ORIGINS: settings.CORS_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port},http://[::1]:${port}`,
  NODE_ENV: 'development', HOST: settings.HOST || '127.0.0.1', PORT: String(port),
  DATABASE_URL: `file:${path.join(data, 'prisma/dev.db')}`, CASE_HUB_STORAGE_ROOT: data };
console.log(`本地设置：${file}\n数据文件夹：${data}\n访问地址：http://localhost:${port}`);
if (check) process.exit(0);
if (!existsSync(path.join(server, 'node_modules')) || !existsSync(path.join(root, 'web/node_modules'))) {
  throw new Error('首次使用请先运行 npm run install:all');
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Command failed (${code}): ${command}`)));
  });
}
const db = path.join(data, 'prisma/dev.db');
const existing = existsSync(db);
if (!existsSync(db) && !demo) throw new Error('数据尚未准备好：运行 npm run demo:local，或将完整快照恢复到设置中的数据文件夹');
await run('npm', ['run', 'build'], server);
await run('npm', ['run', 'build'], path.join(root, 'web'));
if (!existsSync(db)) {
  for (const name of ['prisma', 'uploads/originals', 'uploads/thumbnails', 'journal_covers', 'backups']) mkdirSync(path.join(data, name), { recursive: true });
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], server);
  await run(process.execPath, [path.join(root, 'scripts/seed-demo.mjs')], server);
  console.log('演示账号：demo；演示密码：demo-local-only（仅供本地测试）');
}
if (existing) {
  await run(process.execPath, ['dist/utils/backup.js'], server);
  await run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], server);
}
const child = spawn(process.execPath, ['dist/index.js'], { cwd: server, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });

}
main().catch(error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
