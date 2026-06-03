import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from './prisma.js';
import { createImageHash } from './services/image.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function uploadPathToFilePath(webPath: string): string | null {
  if (!webPath.startsWith('/uploads/')) return null;
  const relative = webPath.replace(/^\/uploads\//, '');
  const filePath = path.join(UPLOAD_DIR, relative);
  return filePath.startsWith(UPLOAD_DIR) ? filePath : null;
}

async function main() {
  const cases = await prisma.visualCase.findMany({
    where: {
      imagePath: { not: '' },
      imageHash: '',
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const caseEntry of cases) {
    const filePath = uploadPathToFilePath(caseEntry.imagePath);
    if (!filePath) {
      skipped++;
      continue;
    }

    try {
      const buffer = await fs.readFile(filePath);
      await prisma.visualCase.update({
        where: { id: caseEntry.id },
        data: {
          imageHash: createImageHash(buffer),
        },
      });
      updated++;
    } catch (err) {
      skipped++;
      console.warn(`[backfillImageHashes] skipped ${caseEntry.id}: ${(err as Error).message}`);
    }
  }

  console.log(`[backfillImageHashes] updated=${updated}, skipped=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
