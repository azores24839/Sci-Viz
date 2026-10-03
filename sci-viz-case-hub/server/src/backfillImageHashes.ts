import { localImagePath as resolveLocalImagePath } from './config/storage.js';
import fs from 'fs/promises';
import { prisma } from './prisma.js';
import { createImageHash } from './services/image.js';


function uploadPathToFilePath(webPath: string): string | null {
  if (!webPath.startsWith('/uploads/')) return null;
  return resolveLocalImagePath(webPath);
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
