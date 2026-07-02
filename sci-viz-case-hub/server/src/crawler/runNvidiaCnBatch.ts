import { discoverLinks } from './discoverLinks.js';
import { processSingleUrl } from './runUrlCrawl.js';
import { prisma } from '../prisma.js';
import { findDuplicateByUrl } from '../services/dedupe.js';
import pLimit from 'p-limit';

const NVIDIA_CN_SEED_URLS = [
  'https://www.nvidia.cn/',
  'https://www.nvidia.cn/geforce/graphics-cards/',
  'https://www.nvidia.cn/geforce/graphics-cards/50-series/',
  'https://www.nvidia.cn/data-center/',
  'https://www.nvidia.cn/data-center/products/',
  'https://www.nvidia.cn/industries/',
  'https://www.nvidia.cn/industries/automotive/',
  'https://www.nvidia.cn/industries/healthcare-life-sciences/',
  'https://www.nvidia.cn/industries/robotics/',
  'https://www.nvidia.cn/industries/manufacturing/',
  'https://www.nvidia.cn/industries/energy/',
  'https://www.nvidia.cn/industries/media-and-entertainment/',
  'https://www.nvidia.cn/industries/game-development/',
  'https://www.nvidia.cn/solutions/',
  'https://www.nvidia.cn/solutions/ai/',
  'https://www.nvidia.cn/solutions/ai/agentic-ai/',
  'https://www.nvidia.cn/ai/',
  'https://www.nvidia.cn/high-performance-computing/',
  'https://www.nvidia.cn/high-performance-computing/scientific-visualization/',
  'https://www.nvidia.cn/autonomous-machines/',
  'https://www.nvidia.cn/self-driving-cars/',
  'https://www.nvidia.cn/omniverse/',
  'https://www.nvidia.cn/studio/',
  'https://www.nvidia.cn/products/workstations/',
  'https://www.nvidia.cn/products/workstations/dgx-spark/',
  'https://www.nvidia.cn/networking/',
  'https://www.nvidia.cn/software/',
  'https://www.nvidia.cn/technologies/',
  'https://www.nvidia.cn/newsroom/',
  'https://www.nvidia.cn/research/',
];

async function seedNvidiaCnSource(): Promise<{ created: boolean; id: number }> {
  const existing = await prisma.crawlSource.findFirst({
    where: { name: 'NVIDIA China', url: 'https://www.nvidia.cn/' },
  });
  if (existing) {
    return { created: false, id: existing.id };
  }
  const source = await prisma.crawlSource.create({
    data: {
      name: 'NVIDIA China',
      url: 'https://www.nvidia.cn/',
      sourceType: 'enterprise_product',
      category: 'ENT',
      crawlTier: 'A',
      crawlStatus: 'active_static',
      adapterType: 'static_html',
      visualValue: 'GPU产品渲染图、数据中心架构图、行业解决方案图、自动驾驶可视化、Omniverse数字孪生、机器人仿真',
      strategyHint: 'React SPA站点；产品/行业/解决方案页面富含视觉素材；重点抓取显卡产品页、数据中心页、行业方案页',
      notes: 'NVIDIA中国官网；GPU/AI加速计算/自动驾驶/机器人/数字孪生全产品线',
      enabled: true,
    },
  });
  return { created: true, id: source.id };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const maxLinksPerSeed = parseInt(process.argv.find(a => a.startsWith('--max-links='))?.split('=')[1] || '60', 10);
  const maxPages = parseInt(process.argv.find(a => a.startsWith('--max-pages='))?.split('=')[1] || '3', 10);
  const concurrency = parseInt(process.argv.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '2', 10);

  const seedResult = await seedNvidiaCnSource();
  console.log(`CrawlSource ${seedResult.created ? 'created (id=' + seedResult.id + ')' : 'already exists (id=' + seedResult.id + ')'}`);

  console.log(`\n=== NVIDIA China Deep Crawl ===`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}, maxLinks=${maxLinksPerSeed}, maxPages=${maxPages}`);

  const allDiscovered: Array<{ url: string; title: string; score: number; source: string }> = [];
  const seenUrls = new Set<string>();

  for (const seed of NVIDIA_CN_SEED_URLS) {
    console.log(`\nDiscovering from ${seed}...`);
    try {
      const links = await discoverLinks(seed, maxLinksPerSeed, maxPages);

      for (const link of links) {
        const key = link.url.replace(/#.*$/, '').replace(/\?.*$/, '');
        if (!seenUrls.has(key)) {
          seenUrls.add(key);
          allDiscovered.push({ ...link, source: seed });
        }
      }
      console.log(`  Found ${links.length} candidate URLs (${allDiscovered.length} unique total)`);
    } catch (err) {
      console.error(`  Discovery failed: ${(err as Error).message}`);
    }
  }

  console.log(`\nTotal discovered: ${allDiscovered.length} unique URLs across ${NVIDIA_CN_SEED_URLS.length} seeds`);

  if (!execute) {
    console.log('\n=== DRY-RUN SUMMARY ===');
    for (const item of allDiscovered.slice(0, 40)) {
      console.log(`  [score=${item.score}] ${item.title?.substring(0, 80) || '(no title)'}`);
      console.log(`    → ${item.url}`);
    }
    if (allDiscovered.length > 40) console.log(`  ... and ${allDiscovered.length - 40} more`);
    console.log('\nPass --execute to crawl and ingest.');
    return;
  }

  const source = await prisma.crawlSource.findFirst({
    where: { url: { startsWith: 'https://www.nvidia.cn' } },
  });
  const sourceName = source?.name || 'NVIDIA China';
  const sourceType = source?.sourceType || 'enterprise_product';

  const limit = pLimit(concurrency);
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  console.log(`\n--- Processing ${allDiscovered.length} URLs ---`);

  await Promise.all(allDiscovered.map(item =>
    limit(async () => {
      try {
        const dupe = await findDuplicateByUrl(item.url);
        if (dupe) {
          totalSkipped++;
          return;
        }

        const result = await processSingleUrl(item.url, sourceName, sourceType);
        if (result.createdCaseCount > 0) {
          totalCreated += result.createdCaseCount;
          console.log(`  +${result.createdCaseCount} from ${new URL(item.url).pathname}`);
        }
      } catch (err) {
        totalFailed++;
        if (totalFailed <= 10) {
          console.error(`  FAIL: ${item.url} — ${(err as Error).message.substring(0, 80)}`);
        }
      }
    })
  ));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${totalCreated}`);
  console.log(`Skipped (dupe): ${totalSkipped}`);
  console.log(`Failed: ${totalFailed}`);

  const nvidiaCount = await prisma.visualCase.count({
    where: { sourceDomain: { in: ['www.nvidia.cn', 'nvidia.cn'] } },
  });
  console.log(`Total NVIDIA China cases in DB: ${nvidiaCount}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
