import { prisma } from '../prisma.js';

export interface EthSourceConfig {
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

export const ETH_SOURCES: EthSourceConfig[] = [
  {
    name: 'ETH Zurich 主站',
    url: 'https://ethz.ch/en/news-and-events/eth-news/news.html',
    sourceType: 'university_news',
    category: 'E',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: 'ETH Zurich主站新闻科研配图：实验设备摄影、显微镜图像、科学数据可视化、3D渲染模型、校园与研究设施照片',
    strategyHint: 'AEM平台新闻列表页，使用.newsListBox[data-href]提取详情链接；文章配图多为高分辨率科研图像',
    notes: 'ETH Zurich (Eidgenössische Technische Hochschule Zürich)；苏黎世联邦理工学院；主站ETH News涵盖全校16个系所科研新闻',
  },
  {
    name: 'ETH AI Center',
    url: 'https://ai.ethz.ch/news-and-events/ai-center-news.html',
    sourceType: 'research_center',
    category: 'E',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: 'AI研究可视化：神经网络架构图、机器学习流程图、AI应用场景图、研究团队照片、数据可视化',
    strategyHint: 'AEM新闻列表页；从/news-and-events/ai-center-news/20xx/发现详情页，静态或浏览器均可提取',
    notes: 'ETH AI Center；ETH人工智能中心；110+教授、1500+研究人员；ELLIS Zurich单元',
  },
  {
    name: 'ETH Library',
    url: 'https://library.ethz.ch/en/about-us-and-locations/news.html',
    sourceType: 'university_library',
    category: 'E',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '图书馆展览图像、数字化馆藏预览、历史文献扫描、学术活动照片、建筑与内部空间摄影',
    strategyHint: 'AEM平台；/en/exhibitions-events/等路径可能有展览和活动配图；馆藏数字化预览',
    notes: 'ETH-Bibliothek；ETH图书馆；瑞士最大科技类图书馆，拥有大量数字化特藏、展览、地图和影像资料',
  },
  {
    name: 'focusTerra',
    url: 'https://focusterra.ethz.ch/en/news.html',
    sourceType: 'science_museum',
    category: 'E',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '地球科学展览图像：矿物标本摄影、地震模拟装置、地质模型、行星科学可视化、互动展品照片',
    strategyHint: 'ETH地球科学探索中心；/en/exhibitions/、/en/events/路径可能有展览和活动配图',
    notes: 'focusTerra；ETH Zurich Earth & Science Discovery Center；隶属D-EAPS地球与行星科学系；免费向公众开放的科学博物馆',
  },
];

export async function seedEthSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of ETH_SOURCES) {
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
  console.log('Seeding ETH Zurich sources...');
  const result = await seedEthSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('ethSources.ts') || process.argv[1]?.endsWith('ethSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
