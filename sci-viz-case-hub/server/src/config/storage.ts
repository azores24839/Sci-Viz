import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function getStoragePaths(env: NodeJS.ProcessEnv = process.env) {
  // The profile launcher maps the user-facing CASE_HUB_DATA_DIR to this runtime root.
  // Containers retain their stable mount locations when no runtime root is supplied.
  const root = env.CASE_HUB_STORAGE_ROOT ? path.resolve(env.CASE_HUB_STORAGE_ROOT) : '';
  const rawDb = env.DATABASE_URL?.replace(/^file:/, '').split('?')[0];
  return {
    uploadsDir: root ? path.join(root, 'uploads') : path.join(serverRoot, 'uploads'),
    journalCoversDir: root ? path.join(root, 'journal_covers') : path.resolve(serverRoot, '../../journal_covers'),
    backupsDir: root ? path.join(root, 'backups') : path.join(serverRoot, 'backups'),
    databasePath: rawDb ? path.resolve(serverRoot, 'prisma', rawDb) : path.join(root || serverRoot, 'prisma/dev.db'),
  };
}

export const storagePaths = getStoragePaths();

export function localImagePath(webPath: string, paths = storagePaths): string | null {
  const prefix = webPath.startsWith('/uploads/') ? '/uploads/' : webPath.startsWith('/journal_covers/') ? '/journal_covers/' : '';
  if (!prefix || webPath.includes('\\') || webPath.includes('\0')) return null;
  const root = prefix === '/uploads/' ? paths.uploadsDir : paths.journalCoversDir;
  const candidate = path.resolve(root, webPath.slice(prefix.length));
  const relative = path.relative(root, candidate);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? candidate : null;
}
