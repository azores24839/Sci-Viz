import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { discoverLinks } from './crawler/discoverLinks.js';

const prisma = new PrismaClient();

type GapSource = {
  name: string;
  url: string;
  category: string;
  sourceType: string;
  adapterType: string;
  crawlStatus: string;
  crawlTier: string;
  targetDiscipline: string;
  targetNewCases: string;
  visualValue: string;
  strategyHint: string;
};

const GAP_SOURCES: GapSource[] = [
  {
    name: 'NIH Photo Galleries',
    url: 'https://www.nih.gov/about-nih/nih-almanac/photo-galleries',
    category: 'L',
    sourceType: 'official_photo_gallery_index',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'S',
    targetDiscipline: '医学',
    targetNewCases: '15-25',
    visualValue: 'NIH 官方图库入口，覆盖 NIH 各研究所图片、园区、历史科研人员和医学研究场景。',
    strategyHint: '入口页主要指向 Flickr 相册；先 dry-run 外链和相册可访问性，再少量人工/接口补入。',
  },
  {
    name: 'NIGMS Image and Video Gallery',
    url: 'https://www.nigms.nih.gov/image-gallery/list?page=0',
    category: 'L',
    sourceType: 'official_science_image_gallery',
    adapterType: 'static_html',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    targetDiscipline: '医学',
    targetNewCases: '25-30',
    visualValue: 'NIH/NIGMS 官方科学图片与视频库，包含细胞、结构生物学、疾病机制、工具与技术。',
    strategyHint: '列表页可分页；优先抓 View Media 详情页，控制主题分布，避免只收显微图。',
  },
  {
    name: 'NCI Visuals Online',
    url: 'https://visualsonline.cancer.gov/',
    category: 'L',
    sourceType: 'official_science_image_gallery',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'A',
    targetDiscipline: '医学',
    targetNewCases: '20-25',
    visualValue: '美国国家癌症研究所官方视觉库，适合补癌症研究、医学插画、临床与基础医学视觉。',
    strategyHint: '先测试搜索页和详情页结构；必要时改为人工精选 URL 后入库。',
  },
  {
    name: 'CDC Public Health Image Library',
    url: 'https://wwwn.cdc.gov/phil/',
    category: 'L',
    sourceType: 'official_public_health_image_library',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'A',
    targetDiscipline: '医学',
    targetNewCases: '15-20',
    visualValue: 'CDC 官方公共卫生图库，覆盖病原体、电镜、实验室、公共卫生现场和防控传播。',
    strategyHint: '只收科研与公共卫生视觉价值高的条目，避开过度敏感、过度临床或展示风险较高的图片。',
  },
  {
    name: 'DOE R&D Image Gallery',
    url: 'https://www.energy.gov/eere/water/photos/rd-image-gallery',
    category: 'L',
    sourceType: 'official_image_gallery',
    adapterType: 'static_html',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    targetDiscipline: '工程',
    targetNewCases: '20-25',
    visualValue: 'DOE 官方研发图库，包含海洋能源、水能、工程测试、设备部署、实验平台和现场操作。',
    strategyHint: '当前页直接含图片与 caption；优先补实验过程、工程原型、测试平台、野外工程现场。',
  },
  {
    name: 'DOE CMEI Photographs',
    url: 'https://www.energy.gov/eere/cmei-photographs',
    category: 'L',
    sourceType: 'official_photo_gallery_index',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'A',
    targetDiscipline: '工程',
    targetNewCases: '15-20',
    visualValue: 'DOE Critical Materials and Energy Innovation 图片入口，链接多个国家实验室与能源技术图库。',
    strategyHint: '先 dry-run 外链和具体图库；优先 Argonne、Berkeley Lab、NREL、ORNL、PNNL、Sandia 等权威实验室。',
  },
  {
    name: 'NREL SWS Image Gallery',
    url: 'https://sws.nrel.gov/image-search',
    category: 'L',
    sourceType: 'official_image_gallery',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'A',
    targetDiscipline: '工程',
    targetNewCases: '20-25',
    visualValue: 'NREL 相关标准工作图库，适合补建筑能源、设备安装、工程现场和应用技术图像。',
    strategyHint: '先测试搜索页分页和图片详情；只采集科研/工程视觉价值高的条目。',
  },
  {
    name: 'Stanford Engineering News',
    url: 'https://engineering.stanford.edu/magazine',
    category: 'L',
    sourceType: 'university_department_news',
    adapterType: 'static_html',
    crawlStatus: 'manual_or_static',
    crawlTier: 'B',
    targetDiscipline: '工程',
    targetNewCases: '10-15',
    visualValue: '国际顶尖工程学院新闻，适合少量补芯片、机器人、材料、能源、AI 工程研究图像。',
    strategyHint: '不作为自动主力；优先人工选择高价值文章 URL 后小批量入库。',
  },
  {
    name: 'NOAA PMEL Climate-Weather Research Photos',
    url: 'https://www.pmel.noaa.gov/gallery/climate-weather-research-photos',
    category: 'L',
    sourceType: 'official_photo_collection',
    adapterType: 'static_html',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    targetDiscipline: '环境科学',
    targetNewCases: '25-30',
    visualValue: 'NOAA PMEL 官方气候与海洋研究图库，包含浮标、船载采样、滑翔机、无人平台和气候观测现场。',
    strategyHint: '当前页含图片和文件链接；优先补野外采样、气候监测设备、空间环境、科研人员/团队现场。',
  },
  {
    name: 'NASA Earth Observatory',
    url: 'https://science.nasa.gov/earth/earth-observatory/',
    category: 'L',
    sourceType: 'official_media_collection',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'S',
    targetDiscipline: '环境科学',
    targetNewCases: '25-30',
    visualValue: 'NASA Earth Observatory 官方地球观测入口，适合补遥感、气候、极端天气、地表变化和环境数据视觉。',
    strategyHint: '优先从 Image of the Day、Topics、Earth Observatory 文章页收集；避免与已有 NASA 宇航图重复。',
  },
  {
    name: 'USGS Landsat Multimedia',
    url: 'https://www.usgs.gov/landsat-missions/multimedia',
    category: 'L',
    sourceType: 'official_media_collection',
    adapterType: 'static_html',
    crawlStatus: 'dry_run_required',
    crawlTier: 'A',
    targetDiscipline: '环境科学',
    targetNewCases: '20-25',
    visualValue: 'USGS Landsat 官方多媒体，覆盖土地变化、遥感图像、环境监测和地球观测传播图。',
    strategyHint: '先 dry-run 列表页与详情页；优先遥感图、变化对比、观测任务和数据可视化。',
  },
  {
    name: 'NOAA Digital Collections Photo Library',
    url: 'https://www.noaa.gov/digital-collections/photo-library',
    category: 'L',
    sourceType: 'official_photo_collection',
    adapterType: 'static_html',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'B',
    targetDiscipline: '环境科学',
    targetNewCases: '15-20',
    visualValue: 'NOAA 官方图片库入口，覆盖海洋、气候、气象、生态、历史科学观测和野外工作。',
    strategyHint: '主站可能出现 403 或跳转；若 dry-run 不稳定，改用 PMEL、专题图库或人工精选 URL。',
  },
];

function makeNotes(source: GapSource): string {
  return [
    `target_discipline: ${source.targetDiscipline}`,
    `target_new_cases: ${source.targetNewCases}`,
    'program: international_non_nature_gap_coverage_2026_05',
  ].join('\n');
}

async function upsertSources() {
  for (const source of GAP_SOURCES) {
    const existing = await prisma.crawlSource.findFirst({ where: { name: source.name } });
    const data = {
      name: source.name,
      url: source.url,
      category: source.category,
      sourceType: source.sourceType,
      adapterType: source.adapterType,
      crawlStatus: source.crawlStatus,
      crawlTier: source.crawlTier,
      visualValue: source.visualValue,
      strategyHint: source.strategyHint,
      notes: makeNotes(source),
      enabled: true,
    };

    if (existing) {
      await prisma.crawlSource.update({ where: { id: existing.id }, data });
    } else {
      await prisma.crawlSource.create({ data });
    }
  }
}

async function fetchGallerySignals(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  const finalUrl = response.url;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  return {
    finalUrl,
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    imageCount: $('img').length,
    anchorCount: $('a[href]').length,
  };
}

async function runDryRun() {
  const rows = [];

  for (const source of GAP_SOURCES) {
    try {
      const [signals, links] = await Promise.all([
        fetchGallerySignals(source.url),
        discoverLinks(source.url, 10, 2).catch(() => []),
      ]);
      rows.push({
        source,
        ok: true,
        signals,
        links: links.slice(0, 10),
        error: '',
      });
    } catch (err) {
      rows.push({
        source,
        ok: false,
        signals: null,
        links: [],
        error: (err as Error).message,
      });
    }
  }

  const now = new Date().toISOString();
  const lines = [
    '# 国际非 Nature 补缺来源 dry-run',
    '',
    `生成时间：${now}`,
    '',
    '## 摘要',
    '',
    '| 来源 | 目标学科 | 目标新增 | 状态 | 图片信号 | 发现链接 | 备注 |',
    '|---|---|---:|---|---:|---:|---|',
    ...rows.map(row => [
      row.source.name,
      row.source.targetDiscipline,
      row.source.targetNewCases,
      row.ok ? '可访问' : '需人工/适配',
      row.signals?.imageCount ?? 0,
      row.links.length,
      row.ok ? (row.signals?.title || row.signals?.finalUrl || '') : row.error,
    ].map(value => String(value).replace(/\|/g, '/')).join('|')).map(line => `|${line}|`),
    '',
    '## 发现链接样例',
    '',
    ...rows.flatMap(row => [
      `### ${row.source.name}`,
      '',
      row.links.length
        ? row.links.map(link => `- ${link.title || '(no title)'} — ${link.url}`).join('\n')
        : `- ${row.ok ? '未发现稳定文章/详情链接，优先按图库页或人工精选 URL 处理。' : row.error}`,
      '',
    ]),
  ];

  const reportPath = path.resolve(process.cwd(), '..', 'docs', 'gap-crawl-dry-run-2026-05-31.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);
  console.log(`Dry-run report written to ${reportPath}`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await upsertSources();
  console.log(`Upserted ${GAP_SOURCES.length} gap-coverage sources into CrawlSource.`);
  if (dryRun) await runDryRun();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
