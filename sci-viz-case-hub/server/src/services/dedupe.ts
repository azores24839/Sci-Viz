import { prisma } from '../prisma.js';

export async function findDuplicateCase(imageHash: string) {
  if (!imageHash) return null;
  const exact = await prisma.visualCase.findFirst({
    where: { imageHash },
  });
  if (!exact) return null;
  return { caseEntry: exact, matchType: 'exact' as const, distance: 0 };
}

export async function findDuplicateByUrl(sourceUrl: string) {
  if (!sourceUrl) return null;
  const existing = await prisma.visualCase.findFirst({
    where: { sourceUrl },
    select: { id: true },
  });
  return existing;
}
