import { prisma } from '../prisma.js';

interface AcademicSourceConfig {
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

const ACADEMIC_SOURCES: AcademicSourceConfig[] = [
  // Engineering sources
  {
    name: 'IEEE Spectrum',
    url: 'https://spectrum.ieee.org/',
    sourceType: 'academic_journal',
    category: 'L',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '工程技术、机器人、半导体、AI应用可视化',
    strategyHint: '优先采research和technology分类文章，关注infographic和数据可视化',
    notes: '工程学科补强：IEEE是工程领域核心来源，spectrum栏目含大量技术可视化',
  },
  {
    name: 'ASME - American Society of Mechanical Engineers',
    url: 'https://www.asme.org/',
    sourceType: 'academic_org',
    category: 'L',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '机械工程、结构工程、流体力学可视化',
    strategyHint: '关注 publications 和 news 栏目',
    notes: '工程学科补强：ASME是机械工程领域权威组织',
  },
  {
    name: 'Engineering.com - Articles',
    url: 'https://www.engineering.com/story/',
    sourceType: 'news_portal',
    category: 'L',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '工程设计、3D渲染、制造技术、机器人应用',
    strategyHint: '采故事类文章，关注工程3D渲染和产品可视化',
    notes: '工程学科补强：含大量3D渲染和产品展示类案例',
  },
  {
    name: 'MIT MechE News',
    url: 'https://meche.mit.edu/news',
    sourceType: 'university_lab',
    category: 'A',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '机械工程、机器人、能源系统、制造工艺',
    strategyHint: '关注 research-highlights 和 news 栏目',
    notes: '工程学科补强：MIT机械工程系',
  },

  // Environmental science sources
  {
    name: 'NASA Earth Observatory',
    url: 'https://earthobservatory.nasa.gov/',
    sourceType: 'government_research',
    category: 'L',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '遥感影像、地球数据可视化、气候变化可视化、卫星地图',
    strategyHint: '优先采 images-of-the-day 和 features，含大量交互和数据可视化',
    notes: '环境科学补强：NASA地球观测站是遥感成像和交互可视化的顶级来源',
  },
  {
    name: 'EPA - Environmental Research',
    url: 'https://www.epa.gov/research',
    sourceType: 'government_research',
    category: 'L',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '环境监测数据可视化、污染分布图、治理效果展示',
    strategyHint: '关注 research 和 topics 栏目',
    notes: '环境科学补强：EPA是环境政策研究的权威来源',
  },
  {
    name: 'ES&T - Environmental Science & Technology',
    url: 'https://pubs.acs.org/journal/esthuj',
    sourceType: 'academic_journal',
    category: 'L',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '环境科学论文配图、数据可视化、污染物分析图',
    strategyHint: '采封面图和 TOC 图',
    notes: '环境科学补强：ACS旗下环境科学顶刊',
  },
  {
    name: 'USGS - Visuals',
    url: 'https://www.usgs.gov/images',
    sourceType: 'government_research',
    category: 'L',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '地质遥感、水文数据可视化、自然灾害影像',
    strategyHint: 'USGS已有57张案例，补充更多类型',
    notes: '环境科学补强：USGS已有数据需深化',
  },

  // Medical / Biomedical sources
  {
    name: 'NIH Image Gallery',
    url: 'https://www.nih.gov/news-events/images',
    sourceType: 'government_research',
    category: 'L',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '医学影像、细胞成像、临床试验数据、健康可视化',
    strategyHint: '关注 NIH research highlights 和 images',
    notes: '医学补强：NIH是生物医学研究最大资助机构',
  },
  {
    name: 'NIGMS - Biomedical Research Images',
    url: 'https://www.nigms.nih.gov/education/life-microscopy',
    sourceType: 'government_research',
    category: 'L',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '生物医学显微成像、细胞可视化、基因组数据图',
    strategyHint: 'NIGMS已有来源需深化，关注 microscopy 和 imaging',
    notes: '医学/生命科学补强：NIGMS是生物医学成像的重要来源',
  },
  {
    name: 'Cell Journal - Covers',
    url: 'https://www.cell.com/cell/archive',
    sourceType: 'academic_journal',
    category: 'L',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '细胞生物学封面、显微成像、分子结构可视化',
    strategyHint: '采封面图，Cell封面以高质量生物医学可视化著称',
    notes: '医学/生命科学补强：Cell是生物医学顶刊，封面图质量极高',
  },

  // Interactive visualization sources
  {
    name: 'Tableau Public Gallery',
    url: 'https://public.tableau.com/app/discover',
    sourceType: 'visualization_gallery',
    category: 'VIZ',
    crawlTier: 'A',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '交互数据可视化仪表盘、科研数据可视化',
    strategyHint: '采 scientific 和 academic 分类，关注交互功能和数据可视化手法',
    notes: '交互可视化补强：Tableau Public是交互可视化的重要来源',
  },
  {
    name: 'Observable HQ - Science',
    url: 'https://observablehq.com/@observablehq/science',
    sourceType: 'visualization_gallery',
    category: 'VIZ',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'browser_render',
    visualValue: '交互数据可视化、D3可视化、科学数据分析界面',
    strategyHint: '需要browser_render，采首页截图和关键可视化截图',
    notes: '交互可视化补强：Observable是D3/交互可视化社区',
  },
  {
    name: 'NASA Scientific Visualization Studio',
    url: 'https://svs.gsfc.nasa.gov/',
    sourceType: 'government_research',
    category: 'L',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科学仿真可视化、地球气候变化动画、天文数据可视化',
    strategyHint: '优先采带视频和交互的条目，NASA SVS是科学可视化的标杆',
    notes: '交互可视化+环境科学补强：NASA科学可视化工作室',
  },
  {
    name: 'Arup - Insights',
    url: 'https://www.arup.com/insights',
    sourceType: 'enterprise',
    category: 'ENT',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '工程设计可视化、建筑3D渲染、可持续设计方案图',
    strategyHint: '已有部分数据，补充更多insight页面',
    notes: '工程+建筑补强：Arup是工程咨询领域可视化标杆',
  },
];

export async function seedAcademicSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of ACADEMIC_SOURCES) {
    const existing = await prisma.crawlSource.findFirst({
      where: { name: config.name, url: config.url },
    });

    if (existing) {
      console.log(`  [skip] ${config.name} already exists`);
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
    console.log(`  [created] ${config.name}`);
    created++;
  }

  return { created, skipped };
}

async function main() {
  console.log('Seeding academic and visualization sources...');
  const result = await seedAcademicSources();
  console.log(`\nDone. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('academicVisualizationSources.ts') || process.argv[1]?.endsWith('academicVisualizationSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}