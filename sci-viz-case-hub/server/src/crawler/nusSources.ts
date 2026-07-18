import { prisma } from '../prisma.js';

export interface NusSourceConfig {
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

export const NUS_SOURCES: NusSourceConfig[] = [
  {
    name: 'NUS 主页',
    url: 'https://nus.edu.sg',
    sourceType: 'university_news',
    category: 'N',
    crawlTier: 'S',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '新加坡国立大学主站新闻、科研亮点、校园活动照片、获奖师生肖像、研究成果配图',
    strategyHint: '主站HTML约71KB；从首页导航发现新闻/研究子页链接；NUS主站可能有内容动态加载',
    notes: 'National University of Singapore；QS全球第8；东南亚排名第一的综合性研究大学',
  },
  {
    name: 'NUS Newsroom',
    url: 'https://news.nus.edu.sg',
    sourceType: 'university_news',
    category: 'N',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: 'NUS新闻室：科研新闻配图、实验室照片、数据可视化、科学家肖像、活动摄影',
    strategyHint: '新闻列表页已确认可访问；含Highlights/Research/Press Releases/News Reports四个栏目',
    notes: 'NUS Newsroom；NUS官方新闻门户；涵盖全校各学院科研成果报道',
  },
  {
    name: 'NUS Press',
    url: 'https://nuspress.nus.edu.sg/index.html',
    sourceType: 'university_press',
    category: 'N',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '学术出版物封面设计、书籍插图、考古图录、艺术史图册、学术图表',
    strategyHint: 'Books by Subject含Visual Arts/Archaeology/Architecture等视觉丰富类别；书籍详情页有封面大图',
    notes: 'NUS Press；新加坡国立大学出版社；专注亚洲研究学术出版，含大量考古、艺术、建筑图录',
  },
  {
    name: 'NUS Enterprise',
    url: 'https://enterprise.nus.edu.sg',
    sourceType: 'innovation_entrepreneurship',
    category: 'N',
    crawlTier: 'A',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '创业活动照片、孵化器空间摄影、创新产品展示、创业大赛现场照、科技转化配图',
    strategyHint: 'HTML约935KB，内容丰富；/news/、/events/、/programmes/路径有大量活动与技术展示内容',
    notes: 'NUS Enterprise；NUS创业与创新部门；覆盖NUS Overseas Colleges、创业孵化器、技术转移',
  },
  {
    name: 'Centre for Quantum Technologies',
    url: 'https://www.cqt.sg/',
    sourceType: 'research_centre',
    category: 'N',
    crawlTier: 'S',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '量子实验设备摄影、量子物理概念图、实验室场景、研究团队照片、科学会议现场',
    strategyHint: 'CQT是新加坡卓越研究中心；/news/、/research/路径有研究成果配图',
    notes: 'Centre for Quantum Technologies (CQT)；新加坡国家级量子技术研究中心；NUS与南洋理工联合',
  },
  {
    name: 'Mechanobiology Institute',
    url: 'https://www.mbi.nus.edu.sg/',
    sourceType: 'research_institute',
    category: 'N',
    crawlTier: 'S',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '荧光显微图像、细胞力学可视化、3D分子结构图、微流控芯片摄影、力学生物学实验场景',
    strategyHint: 'HTML约139KB；/news/、/research/路径有研究亮点配图；显微与生物物理图像质量极高',
    notes: 'Mechanobiology Institute (MBI)；NUS卓越研究中心；聚焦力学生物学、细胞力学、生物物理成像',
  },
  {
    name: 'Cancer Science Institute of Singapore',
    url: 'https://csi.nus.edu.sg',
    sourceType: 'research_institute',
    category: 'N',
    crawlTier: 'S',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '癌细胞显微图、基因组数据可视化、蛋白质结构图、实验室研究场景、临床研究配图',
    strategyHint: 'HTML约596KB，内容量大；/news-events/、/research/路径有大量研究报道',
    notes: 'Cancer Science Institute of Singapore (CSI)；NUS卓越研究中心；聚焦癌症基因组学、表观遗传学、精准肿瘤学',
  },
  {
    name: 'Institute for Functional Intelligent Materials',
    url: 'https://ifim.nus.edu.sg',
    sourceType: 'research_institute',
    category: 'N',
    crawlTier: 'S',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '2D材料显微图、智能材料结构图、纳米器件摄影、分子模型、材料表征数据图',
    strategyHint: 'NUS第四家卓越研究中心（2023新设）；/news-events/、/research/路径有前沿材料研究配图',
    notes: 'Institute for Functional Intelligent Materials (I-FIM)；NUS卓越研究中心；诺贝尔奖得主Konstantin Novoselov领衔',
  },
  {
    name: 'Yale-NUS College',
    url: 'https://www.yale-nus.edu.sg/',
    sourceType: 'university_news',
    category: 'N',
    crawlTier: 'B',
    crawlStatus: 'needs_browser',
    adapterType: 'browser_render',
    visualValue: '校园建筑摄影、学生活动照片、学术讲座与展览场景、跨学科研究配图',
    strategyHint: '已与USP合并为NUS College（2025年前最后一届）；/news/路径有存档文章',
    notes: 'Yale-NUS College；耶鲁-国大学院；耶鲁与NUS联合创办的文理学院，已合并；网站仍在线存档',
  },
];

export async function seedNusSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of NUS_SOURCES) {
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
  console.log('Seeding NUS sources...');
  const result = await seedNusSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('nusSources.ts') || process.argv[1]?.endsWith('nusSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
