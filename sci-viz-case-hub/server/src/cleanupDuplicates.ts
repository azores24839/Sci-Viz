import { prisma } from './prisma.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getImageHash(imagePath: string): Promise<string | null> {
  const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
  const SERVER_ROOT = path.join(__dirname, '..', '..');
  const candidates = [
    path.join(SERVER_ROOT, imagePath.replace(/^\//, '')),
    path.join(PROJECT_ROOT, imagePath.replace(/^\//, '')),
    imagePath,
  ];
  for (const fullPath of candidates) {
    try {
      const buffer = await fs.readFile(fullPath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    } catch { /* try next path */ }
  }
  return null;
}

async function main() {
  const dryRun = !process.argv.includes('--execute');

  console.log(`=== Deduplication & Hash Backfill ===`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log();

  // Step 1: Find same-sourceUrl duplicates, keep the one with the longest context/best data
  const urlGroups = await prisma.visualCase.groupBy({
    by: ['sourceUrl'],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    where: { sourceUrl: { not: '' } },
  });

  console.log(`Found ${urlGroups.length} sourceUrls with duplicates`);

  let dupeIdsToDelete: string[] = [];

  for (const group of urlGroups) {
    const cases = await prisma.visualCase.findMany({
      where: { sourceUrl: group.sourceUrl },
      orderBy: [
        { imageHash: 'desc' },
        { contextText: 'desc' },
        { collectionScore: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Keep the first (best) record, mark the rest for deletion
    const toDelete = cases.slice(1);
    dupeIdsToDelete.push(...toDelete.map(c => c.id));
  }

  console.log(`Will delete ${dupeIdsToDelete.length} duplicate entries`);

  // Step 2: Find entries with empty imageHash that have valid imagePath
  const noHashCases = await prisma.visualCase.findMany({
    where: {
      imageHash: '',
      imagePath: { not: '' },
    },
    select: { id: true, imagePath: true, imageUrl: true },
  });

  console.log(`Found ${noHashCases.length} entries with empty imageHash`);

  const hashBackfills: Array<{ id: string; imageHash: string }> = [];
  for (const entry of noHashCases) {
    const hash = await getImageHash(entry.imagePath);
    if (hash) {
      hashBackfills.push({ id: entry.id, imageHash: hash });
    }
  }

  console.log(`Can backfill ${hashBackfills.length}/${noHashCases.length} imageHashes`);

  // Step 3: After backfill, find hash-based duplicates
  // (only after we fill in the hashes, some nature.com dupes will have same hash)
  const hashDupeGroups = await prisma.visualCase.groupBy({
    by: ['imageHash'],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    where: { imageHash: { not: '' } },
  });

  console.log(`Found ${hashDupeGroups.length} imageHashes with duplicates`);

  for (const group of hashDupeGroups) {
    const cases = await prisma.visualCase.findMany({
      where: { imageHash: group.imageHash },
      orderBy: [
        { collectionScore: 'desc' },
        { contextText: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const toDelete = cases.slice(1);
    dupeIdsToDelete.push(...toDelete.map(c => c.id));
  }

  // Deduplicate the delete list
  const uniqueDeleteIds = [...new Set(dupeIdsToDelete)];
  console.log(`Total unique IDs to delete: ${uniqueDeleteIds.length}`);

  // Also collect imagePaths for cleanup
  const casesToDelete = await prisma.visualCase.findMany({
    where: { id: { in: uniqueDeleteIds } },
    select: { id: true, imagePath: true, thumbnailPath: true },
  });

  if (dryRun) {
    console.log('\n=== DRY-RUN SUMMARY ===');
    console.log(`Duplicate entries to delete: ${uniqueDeleteIds.length}`);
    console.log(`Hash backfills: ${hashBackfills.length}`);

    // Show some sample URLs with duplicates
    const sampleUrls = urlGroups.slice(0, 10);
    for (const g of sampleUrls) {
      const count = await prisma.visualCase.count({ where: { sourceUrl: g.sourceUrl } });
      console.log(`  ${g.sourceUrl}: ${count} entries`);
    }

    // Show sample hash backfills
    for (const item of hashBackfills.slice(0, 5)) {
      console.log(`  ${item.id}: hash=${item.imageHash.substring(0, 16)}...`);
    }

    console.log('\nPass --execute to apply changes.');
    return;
  }

  // Execute: backfill hashes first
  console.log('\nBackfilling image hashes...');
  let backfillCount = 0;
  for (const item of hashBackfills) {
    await prisma.visualCase.update({
      where: { id: item.id },
      data: { imageHash: item.imageHash },
    });
    backfillCount++;
  }
  console.log(`Backfilled ${backfillCount} hashes`);

  // Re-check hash-based duplicates after backfill (nature.com entries may now collide)
  console.log('\nRe-checking hash-based duplicates after backfill...');
  const postBackfillHashGroups = await prisma.visualCase.groupBy({
    by: ['imageHash'],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    where: { imageHash: { not: '' } },
  });

  const postBackfillDupeIds: string[] = [];
  for (const group of postBackfillHashGroups) {
    const cases = await prisma.visualCase.findMany({
      where: { imageHash: group.imageHash },
      orderBy: [
        { collectionScore: 'desc' },
        { contextText: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    const toDelete = cases.slice(1);
    postBackfillDupeIds.push(...toDelete.map(c => c.id));
  }

  // Merge with existing sourceUrl-based dupes, dedupe
  const allIdsToDeleteSet = new Set(uniqueDeleteIds);
  for (const id of postBackfillDupeIds) {
    allIdsToDeleteSet.add(id);
  }
  const allUniqueDeleteIds = [...allIdsToDeleteSet];
  console.log(`Found ${postBackfillHashGroups.length} additional hash-duplicate groups after backfill`);
  console.log(`Total unique IDs to delete (merged): ${allUniqueDeleteIds.length}`);

  // Refresh casesToDelete list
  const allCasesToDelete = await prisma.visualCase.findMany({
    where: { id: { in: allUniqueDeleteIds } },
    select: { id: true, imagePath: true, thumbnailPath: true },
  });
  console.log(`Deleting ${allUniqueDeleteIds.length} duplicate entries...`);

  // Batch delete in groups of 500
  for (let i = 0; i < allUniqueDeleteIds.length; i += 500) {
    const batch = allUniqueDeleteIds.slice(i, i + 500);
    await prisma.visualCase.deleteMany({
      where: { id: { in: batch } },
    });
  }

  // Try to clean up image files for deleted entries
  const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
  const SERVER_ROOT = path.join(__dirname, '..', '..');
  let filesCleaned = 0;
  for (const c of allCasesToDelete) {
    for (const p of [c.imagePath, c.thumbnailPath]) {
      if (!p) continue;
      const candidates = [
        path.join(SERVER_ROOT, p.replace(/^\//, '')),
        path.join(PROJECT_ROOT, p.replace(/^\//, '')),
        p,
      ];
      for (const fullPath of candidates) {
        try {
          await fs.unlink(fullPath);
          filesCleaned++;
          break;
        } catch { /* file may not exist */ }
      }
    }
  }
  console.log(`Cleaned up ${filesCleaned} image files`);

  // Final stats
  const finalCount = await prisma.visualCase.count();
  const finalUniqueUrls = await prisma.visualCase.groupBy({
    by: ['sourceUrl'],
    where: { sourceUrl: { not: '' } },
  });
  const finalNoHash = await prisma.visualCase.count({
    where: { imageHash: '' },
  });

  console.log('\n=== FINAL STATS ===');
  console.log(`Total cases: ${finalCount}`);
  console.log(`Unique sourceUrls: ${finalUniqueUrls.length}`);
  console.log(`Remaining entries without imageHash: ${finalNoHash}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });