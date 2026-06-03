import { prisma } from '../prisma.js';

async function main() {
  const sources = await prisma.crawlSource.findMany({ where: { category: 'H' } });
  let totalCases = 0;
  for (const s of sources) {
    const hostname = new URL(s.url).hostname;
    const parts = hostname.split('.');
    const domainSuffix = parts.slice(-3).join('.');
    const count = await prisma.visualCase.count({
      where: { sourceDomain: { contains: domainSuffix } },
    });
    const approved = await prisma.visualCase.count({
      where: { sourceDomain: { contains: domainSuffix }, reviewStatus: 'approved' },
    });
    console.log(`${s.name}: ${count} cases (${approved} approved)`);
    totalCases += count;
  }
  const totalAll = await prisma.visualCase.count();
  console.log(`\nTotal domestic new: ${totalCases}`);
  console.log(`Total all cases in DB: ${totalAll}`);
  await prisma.$disconnect();
}

main();
