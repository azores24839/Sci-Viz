import { prisma } from '../prisma.js';

export async function findDuplicateCase(imageHash: string) {
  if (!imageHash) return null;
  const exact = await prisma.visualCase.findFirst({
    where: { imageHash },
  });
  if (!exact) return null;
  return { caseEntry: exact, matchType: 'exact' as const, distance: 0 };
}
