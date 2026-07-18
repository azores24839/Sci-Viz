import { prisma } from '../prisma.js';

export interface YaleSourceConfig {
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

export const YALE_SOURCES: YaleSourceConfig[] = [
  {
    name: 'Yale 主页',
    url: 'https://www.yale.edu',
    sourceType: 'university_news',
    category: 'Y',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '耶鲁大学主站新闻、校园哥特建筑摄影、博物馆馆藏精华、师生肖像、科研成果配图',
    strategyHint: 'YaleSites CMS；首页含Feature Archive、最新新闻列表；/news/路径有丰富文章',
    notes: 'Yale University；常春藤盟校，1701年建校；72位诺奖得主；15所学院',
  },
  {
    name: 'YaleNews',
    url: 'https://news.yale.edu',
    sourceType: 'university_news',
    category: 'Y',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '耶鲁官方新闻：科研突破配图、实验室摄影、数据可视化、人物肖像、活动纪实',
    strategyHint: '包含Featured Articles、Discoveries、10个主题分类（Science & Technology / Health & Medicine等）',
    notes: 'YaleNews；耶鲁官方新闻门户；涵盖全校15所学院研究成果报道',
  },
  {
    name: 'Yale School of the Environment',
    url: 'https://environment.yale.edu',
    sourceType: 'university_news',
    category: 'Y',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '环境科学研究配图：森林生态摄影、气候数据可视化、遥感影像、野外考察照片、可持续发展信息图',
    strategyHint: '/news/路径有Q&A、Research类型文章；Canopy Magazine有深度专题配图；运营有Yale Climate Connections媒体',
    notes: 'Yale School of the Environment (YSE)；全球顶尖环境学院；含The Forest School、Yale Climate Connections',
  },
  {
    name: 'Yale Engineering (SEAS)',
    url: 'https://engineering.yale.edu/news-and-events/news',
    sourceType: 'university_news',
    category: 'Y',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '工程研究配图：量子器件、AI系统图、机器人实验场景、新材料显微图、学生工程项目展示',
    strategyHint: '旧域名seas.yale.edu已301迁移；从engineering.yale.edu/news-and-events/news发现研究报道',
    notes: 'Yale School of Engineering & Applied Science (SEAS)；新建工程校园；聚焦AI、量子科学、机器人等前沿领域',
  },
];

export async function seedYaleSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of YALE_SOURCES) {
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
  console.log('Seeding Yale sources...');
  const result = await seedYaleSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('yaleSources.ts') || process.argv[1]?.endsWith('yaleSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
