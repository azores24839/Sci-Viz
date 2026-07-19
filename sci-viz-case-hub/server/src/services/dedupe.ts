import { Prisma, PrismaClientKnownRequestError, type VisualCase } from '@prisma/client';
import { prisma } from '../prisma.js';

export type ImageHashMatch =
  | { caseEntry: VisualCase; matchType: 'exact'; distance: 0 }
  | { caseEntry: null; matchType: 'deleted'; distance: 0 };

type DeletedImageHashRow = { imageHash: string };
let ensureSchemaPromise: Promise<void> | null = null;

export async function ensureImageDedupeSchema(): Promise<void> {
  ensureSchemaPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeletedImageHash" (
        "imageHash" TEXT NOT NULL PRIMARY KEY,
        "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const rows = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type='table' AND name='VisualCase'
    `;
    if (rows.length > 0) {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS "VisualCase_imageHash_unique_nonempty"
          ON "VisualCase"("imageHash")
          WHERE "imageHash" <> ''
        `);
      } catch (error) {
        if (error instanceof PrismaClientKnownRequestError && error.code === 'P2010') {
          console.warn(
            '[dedupe] existing duplicate imageHash values prevent unique index creation; ' +
            'deduplication will still work via exact-match queries. ' +
            'Run cleanupDuplicates.ts to resolve historical duplicates.'
          );
        } else {
          throw error;
        }
      }
    }
  })();
  await ensureSchemaPromise;
}

export async function rememberDeletedImageHashes(
  tx: Prisma.TransactionClient,
  imageHashes: string[],
): Promise<void> {
  for (const imageHash of [...new Set(imageHashes.filter(Boolean))]) {
    await tx.$executeRaw`
      INSERT OR IGNORE INTO "DeletedImageHash" ("imageHash", "deletedAt")
      VALUES (${imageHash}, CURRENT_TIMESTAMP)
    `;
  }
}

export async function findDuplicateCase(imageHash: string): Promise<ImageHashMatch | null> {
  if (!imageHash) return null;
  await ensureImageDedupeSchema();
  const exact = await prisma.visualCase.findFirst({
    where: { imageHash },
  });
  if (exact) return { caseEntry: exact, matchType: 'exact', distance: 0 };

  const deleted = await prisma.$queryRaw<DeletedImageHashRow[]>`
    SELECT "imageHash" FROM "DeletedImageHash" WHERE "imageHash" = ${imageHash} LIMIT 1
  `;
  if (deleted.length > 0) return { caseEntry: null, matchType: 'deleted', distance: 0 };
  return null;
}

export async function findDuplicateByUrl(sourceUrl: string) {
  if (!sourceUrl) return null;
  const existing = await prisma.visualCase.findFirst({
    where: { sourceUrl },
    select: { id: true },
  });
  return existing;
}
