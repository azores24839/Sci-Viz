import { prisma } from '../prisma.js';

export interface OxfordSourceConfig {
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

export const OXFORD_SOURCES: OxfordSourceConfig[] = [
  {
    name: 'Oxford University-主站',
    url: 'https://www.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '牛津大学主站新闻、研究亮点、学术活动照片、科研成果配图',
    strategyHint: '自动抓取返回403，需使用浏览器截图采集',
    notes: 'University of Oxford；世界顶尖综合性研究大学；ox.ac.uk主域名对自动抓取有限制',
  },
  {
    name: 'Oxford Sparks',
    url: 'https://www.oxfordsparks.ox.ac.uk',
    sourceType: 'science_engagement',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科研科普视频缩略图、播客配图、科学家肖像、科学动画截图、信息图',
    strategyHint: '科学传播平台，/videos/、/podcasts/、/news/、/profiles/路径有独立内容页；WordPress结构',
    notes: 'Oxford Sparks；牛津大学科学传播门户；视频/播客/科学家简介；学科覆盖广泛（物理/化学/生物/医学/工程）',
  },
  {
    name: 'Oxford MPLS Division',
    url: 'https://www.mpls.ox.ac.uk/latest/news',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '数物生科研成果配图、实验室设备照片、学术活动场景、研究数据可视化',
    strategyHint: '数学/物理/生命科学学部新闻列表页；Oxford Mosaic CMS；/latest/news路径有大量研究新闻',
    notes: 'MPLS Division；牛津数学、物理、生命科学学部；含7,400学生/1,200研究人员；首页cookie墙，用list页入口',
  },
  {
    name: 'Oxford GLAM',
    url: 'https://www.glam.ox.ac.uk',
    sourceType: 'museum_portal',
    category: 'O',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '博物馆馆藏影像、在线展览截图、研究项目配图、文化活动照片',
    strategyHint: '花园/图书馆/博物馆总门户；聚合6个GLAM机构；/news/和/research/路径有内容',
    notes: 'Gardens, Libraries & Museums；牛津大学GLAM总门户；聚合Ashmolean/Bodleian/自然史博物馆等',
  },

  // ── 科学系所（第二轮扩展）──
  {
    name: 'Oxford Physics',
    url: 'https://www.physics.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '天文物理图像、粒子实验照片、实验室设备、量子技术示意图、科研数据可视化',
    strategyHint: '物理系网站，新闻列表有大量科研配图；/news路径有LSST观测、行星发现、等离子体加速等文章',
    notes: 'Department of Physics；牛津物理系；天体物理/量子/粒子物理/凝聚态',
  },
  {
    name: 'Oxford Chemistry',
    url: 'https://www.chem.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '分子结构图、化学反应示意图、光谱图像、实验室设备照片、科研数据图',
    strategyHint: '化学系Oxford Mosaic站点；/article/路径有研究亮点文章；轮播图包含最新成果配图',
    notes: 'Department of Chemistry；牛津化学系；催化/合成/化学生物学/光子科学',
  },
  {
    name: 'Oxford Materials',
    url: 'https://www.materials.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '材料显微图像、纳米结构图、材料表征设备照片、研究成果配图',
    strategyHint: '材料系Oxford Mosaic站点；/research和/impact路径有研究案例；David Cockayne电镜中心有图像',
    notes: 'Department of Materials；牛津材料系；纳米材料/能源材料/结构材料/表征',
  },
  {
    name: 'Oxford Statistics',
    url: 'https://www.stats.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '统计图表、数据可视化、蛋白质折叠模拟图、基因组分析图',
    strategyHint: '统计系定制站点；/news路径有火星岩浆系统、基因组统计等研究新闻配图',
    notes: 'Department of Statistics；牛津统计系；计算统计/机器学习/蛋白质信息学/流行病统计',
  },
  {
    name: 'Oxford Internet Institute',
    url: 'https://www.oii.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '数据可视化、信息图表、社会网络图、AI伦理示意图、数字社会研究配图',
    strategyHint: 'OII定制站点；/research和/impact路径有大量研究案例页；13个高分链接可用于采集',
    notes: 'Oxford Internet Institute；数字社会/AI伦理/信息治理/社交数据科学',
  },
  {
    name: 'Oxford Pathology',
    url: 'https://www.path.ox.ac.uk',
    sourceType: 'university_news',
    category: 'O',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '显微图像、病理切片、分子生物学实验照片、科研新闻配图',
    strategyHint: '邓恩病理学院定制站点；/news路径有分子机制和微生物研究新闻；链接较少但研究质量高',
    notes: 'Sir William Dunn School of Pathology；牛津病理学院；分子机制/微生物组/传染病',
  },
];

export async function seedOxfordSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of OXFORD_SOURCES) {
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
  console.log('Seeding Oxford University sources...');
  const result = await seedOxfordSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

const isMainModule = process.argv[1]?.endsWith('oxfordSources.ts') || process.argv[1]?.endsWith('oxfordSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
