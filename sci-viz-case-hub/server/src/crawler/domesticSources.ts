import { prisma } from '../prisma.js';

export interface DomesticSourceConfig {
  name: string;
  url: string;
  sourceType: string;
  category: string;
  crawlTier: string;
  crawlStatus: string;
  adapterType: string;
  visualValue: string;
  strategyHint: string;
  notes: string;
}

export const DOMESTIC_SOURCES: DomesticSourceConfig[] = [
  {
    name: '浙江大学-求是新闻网',
    url: 'http://www.news.zju.edu.cn',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科研成果图、学术活动照片、实验室设备、Nature/Science论文配图、校园科研场景',
    strategyHint: '科研/xs栏目是学术新闻专区，文章日期路径/Y/MMDD/c.../page.htm，图片多在#vsb_content',
    notes: '浙江大学；综合型研究大学；科研视觉内容覆盖理/工/农/医',
  },
  {
    name: '哈尔滨工业大学-新闻网',
    url: 'https://news.hit.edu.cn',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '航天工程照片、科研成果图、实验室装备、学术活动、国防科研场景',
    strategyHint: '新闻日期路径/Y/MMDD/c.../page.htm；图片在#vsb_content/.v_news_content',
    notes: '哈尔滨工业大学；航天/工程/信息科学强校',
  },
  {
    name: '华中科技大学-新闻网',
    url: 'https://news.hust.edu.cn',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '光电国家研究中心图片、机械工程照片、医学研究图、实验室场景、学术活动',
    strategyHint: '科研新闻在/info/1003/下；文章/info/1003/NNNNN.htm；图片在#vsb_content',
    notes: '华中科技大学；光电/机械/医学/工程强校',
  },
  {
    name: '北京航空航天大学-新闻网',
    url: 'https://news.buaa.edu.cn',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '航空航天装备照片、风洞实验图、科技成果配图、学术会议、实验室设备',
    strategyHint: '科研新闻在/info/1002/下；文章/info/1002/NNNNN.htm；图片在#vsb_content',
    notes: '北京航空航天大学；航空/航天/信息科学强校',
  },
  {
    name: '西安交通大学-新闻网',
    url: 'https://news.xjtu.edu.cn',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '电气/能动工程照片、机械装备图、科研成果配图、实验室场景、学术活动',
    strategyHint: '科技自立自强栏目有科研成果新闻；文章/info/NNNN/NNNNNN.htm；图片在#vsb_content',
    notes: '西安交通大学；电气/能动/机械/材料强校',
  },
  {
    name: '东南大学-新闻网',
    url: 'https://news.seu.edu.cn',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '建筑/土木工程照片、信息电子设备图、科研成果配图、学术活动、实验室场景',
    strategyHint: '新闻日期路径/Y/MMDD/c.../page.htm；图片在#vsb_content/.v_news_content',
    notes: '东南大学；建筑/土木/电子/信息强校',
  },
  {
    name: '北京理工大学-新闻网',
    url: 'https://www.bit.edu.cn/xww/xzw/xsjl1/',
    sourceType: 'university_news',
    category: 'H',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '兵器/车辆工程照片、科研成果配图、实验室装备、学术会议、国防科研场景',
    strategyHint: '学术交流/xsjl1栏目有大量科研新闻；文章/xww/xzw/xsjl1/<hash>.htm；图片在#vsb_content',
    notes: '北京理工大学；兵器/车辆/工程/信息科学强校',
  },
];

export async function seedDomesticSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of DOMESTIC_SOURCES) {
    const existing = await prisma.crawlSource.findFirst({
      where: { name: config.name, url: config.url },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.crawlSource.create({
      data: {
        name: config.name,
        url: config.url,
        sourceType: config.sourceType,
        category: config.category,
        crawlTier: config.crawlTier,
        crawlStatus: config.crawlStatus,
        adapterType: config.adapterType,
        visualValue: config.visualValue,
        strategyHint: config.strategyHint,
        notes: config.notes,
        enabled: true,
      },
    });
    created++;
  }

  return { created, skipped };
}

async function main() {
  console.log('Seeding domestic university sources...');
  const result = await seedDomesticSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('domesticSources.ts') || process.argv[1]?.endsWith('domesticSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
