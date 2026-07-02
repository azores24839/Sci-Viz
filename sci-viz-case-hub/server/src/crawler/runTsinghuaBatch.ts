import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const SEED_URLS = [
  'https://www.tsinghua.edu.cn/',
  'https://www.tsinghua.edu.cn/index.htm',
  'https://www.tsinghua.edu.cn/xxgk.htm',
  'https://www.tsinghua.edu.cn/xxyd.htm',
  'https://www.tsinghua.edu.cn/kxyj.htm',
  'https://www.tsinghua.edu.cn/yxsz.htm',
  'https://www.tsinghua.edu.cn/hzjl.htm',
  'https://www.tsinghua.edu.cn/xssw.htm',
  'https://www.tsinghua.edu.cn/whxc.htm',
  'https://www.tsinghua.edu.cn/news/zttj/bgqhr.htm',
  'https://www.tsinghua.edu.cn/kxyj/kycg.htm',
  'https://www.tsinghua.edu.cn/kxyj/kyhd.htm',
  'https://www.tsinghua.edu.cn/hzjl/gjhz.htm',
  'https://www.tsinghua.edu.cn/hzjl/gnhz.htm',
];

async function seedTsinghuaSource() {
  const existing = await prisma.crawlSource.findFirst({
    where: { name: '清华大学综合站', url: 'https://www.tsinghua.edu.cn/' },
  });
  if (existing) return existing;
  return prisma.crawlSource.create({
    data: {
      name: '清华大学综合站',
      url: 'https://www.tsinghua.edu.cn/',
      sourceType: 'university_news', category: 'H', crawlTier: 'A',
      crawlStatus: 'active_static', adapterType: 'static_html',
      visualValue: '科研成果图、校园风景、学术活动、实验室装备、历史建筑、院系风采',
      strategyHint: '静态CMS，/info/目录文章为主；科研/xsky路径有学术新闻专区',
      notes: '清华大学综合官网；覆盖新闻/科研/院系/校园/国际合作全门户',
      enabled: true,
    },
  });
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinks = parseInt(process.argv.find(a => a.startsWith('--max-links='))?.split('=')[1] || '80', 10);
  const maxPages = parseInt(process.argv.find(a => a.startsWith('--max-pages='))?.split('=')[1] || '4', 10);

  await seedTsinghuaSource();
  console.log(`=== Tsinghua Deep Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, maxLinks=${maxLinks}, maxPages=${maxPages}`);

  const allDiscovered: Array<{ url: string; title: string; score: number; source: string }> = [];
  const seen = new Set<string>();

  for (const seed of SEED_URLS) {
    console.log(`Discovering from ${seed}...`);
    try {
      const links = await discoverLinks(seed, maxLinks, maxPages);
      for (const l of links) {
        const key = l.url.replace(/#.*$/, '').replace(/\?.*$/, '');
        if (!seen.has(key)) { seen.add(key); allDiscovered.push({ ...l, source: seed }); }
      }
      console.log(`  ${links.length} links (${allDiscovered.length} unique total)`);
    } catch (err) {
      console.error(`  FAIL: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal discovered: ${allDiscovered.length} URLs from ${SEED_URLS.length} seeds`);

  if (!execute) {
    console.log('\n=== DRY-RUN ===');
    for (const item of allDiscovered.slice(0, 30)) {
      console.log(`  [s=${item.score}] ${item.title?.substring(0, 60) || '?'} → ${item.url}`);
    }
    if (allDiscovered.length > 30) console.log(`  ... +${allDiscovered.length - 30} more`);
    console.log('\nPass --execute to crawl.');
    return;
  }

  const limit = pLimit(3);
  let created = 0, skipped = 0, failed = 0;

  console.log(`\n--- Processing ${allDiscovered.length} URLs ---`);

  await Promise.all(allDiscovered.map(item =>
    limit(async () => {
      try {
        const dupe = await findDuplicateByUrl(item.url);
        if (dupe) { skipped++; return; }
        const r = await processSingleUrl(item.url, '清华大学综合站', 'university_news');
        if (r.createdCaseCount > 0) {
          created += r.createdCaseCount;
          console.log(`  +${r.createdCaseCount} ${new URL(item.url).pathname}`);
        }
      } catch (err) {
        failed++;
        if (failed <= 10) console.error(`  FAIL: ${item.url} — ${(err as Error).message.substring(0, 60)}`);
      }
    })
  ));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);
  const count = await prisma.visualCase.count({ where: { sourceDomain: 'www.tsinghua.edu.cn' } });
  console.log(`Total Tsinghua cases: ${count}`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
