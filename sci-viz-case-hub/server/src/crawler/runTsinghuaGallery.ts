import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';

const PAGES = [
  'https://www.tsinghua.edu.cn/zjqh/xyfg.htm',
  'https://www.tsinghua.edu.cn/zjqh/xyfg/xydt.htm',
  'https://www.tsinghua.edu.cn/zjqh/xyfg/xyjg.htm',
];

async function main() {
  let created = 0;
  for (const url of PAGES) {
    try {
      const dupe = await findDuplicateByUrl(url);
      if (dupe) { console.log(`skip ${url} (exists)`); continue; }
      const r = await processSingleUrl(url, '清华大学综合站', 'university_news');
      console.log(`  ${url}: +${r.createdCaseCount}`);
      created += r.createdCaseCount;
    } catch (err) {
      console.error(`  FAIL ${url}: ${(err as Error).message}`);
    }
  }
  console.log(`\nCreated: ${created}`);
  const count = await prisma.visualCase.count({ where: { sourceDomain: 'www.tsinghua.edu.cn' } });
  console.log(`Total: ${count}`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
