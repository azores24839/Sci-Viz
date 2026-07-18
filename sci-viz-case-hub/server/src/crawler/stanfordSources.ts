import { prisma } from '../prisma.js';

export interface StanfordSourceConfig {
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

export const STANFORD_SOURCES: StanfordSourceConfig[] = [
  {
    name: 'Stanford 主页',
    url: 'https://www.stanford.edu',
    sourceType: 'university_news',
    category: 'SF',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '斯坦福主站新闻、校园建筑摄影、科研成果配图、学生活动照片、研究亮点视觉',
    strategyHint: '首页含News/Research Matters板块、Civics板块；链接指向Stanford Report和学院页面',
    notes: 'Stanford University；硅谷核心研究型大学；7所学院；36支运动队；139项NCAA冠军',
  },
  {
    name: 'Stanford Medicine',
    url: 'https://med.stanford.edu',
    sourceType: 'medical_school',
    category: 'SF',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '医学研究配图：显微成像、临床实验摄影、蛋白质结构图、医疗设备照片、神经科学可视化',
    strategyHint: '首页含Research News板块；/news/路径有大量医学研究报道；含Stanford Health Care + Children\'s Health',
    notes: 'Stanford Medicine；斯坦福医学院；含医学院、Stanford Health Care、Stanford Children\'s Health三大支柱',
  },
  {
    name: 'Stanford Doerr School of Sustainability',
    url: 'https://sustainability.stanford.edu',
    sourceType: 'university_department',
    category: 'SF',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '可持续发展研究配图：气候科学数据图、遥感影像、能源技术摄影、海洋研究照片、地球科学可视化',
    strategyHint: '首页Stories板块有研究报道；7个系所涵盖地球科学/能源/环境/海洋；含Woods/Precourt两大研究所',
    notes: 'Stanford Doerr School of Sustainability；2022年成立，Stanford 75年来首个新学院；研究地球/气候/能源/可持续',
  },
  {
    name: 'Stanford HAI',
    url: 'https://hai.stanford.edu',
    sourceType: 'research_center',
    category: 'SF',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: 'AI研究配图：神经网络可视化、AI应用场景图、数据图表、研究团队照片、政策信息图',
    strategyHint: '首页News板块丰富；/news/路径有大量AI研究报道；发布年度AI Index Report；含政策/教育/产业三个板块',
    notes: 'Stanford HAI (Human-Centered AI)；Fei-Fei Li共同创立；跨学科AI研究、教育、政策',
  },
  {
    name: 'SLAC National Accelerator Laboratory',
    url: 'https://www6.slac.stanford.edu',
    sourceType: 'national_lab',
    category: 'SF',
    crawlTier: 'S',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '粒子加速器摄影、X射线自由电子激光设备、天文观测图像、材料科学实验、量子器件显微图',
    strategyHint: '/news-center/路径有News Release/Feature/News Brief；LSST巡天观测/量子科学/LCLS激光/X射线成像视觉丰富',
    notes: 'SLAC National Accelerator Laboratory；隶属DOE能源部，Stanford运营；LCLS/X射线自由电子激光/LSST相机/Rubin天文台',
  },
];

export async function seedStanfordSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of STANFORD_SOURCES) {
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
  console.log('Seeding Stanford sources...');
  const result = await seedStanfordSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('stanfordSources.ts') || process.argv[1]?.endsWith('stanfordSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
