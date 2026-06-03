/**
 * SJTU College/Lab Source Configurations
 *
 * Defines CrawlSource entries for Shanghai Jiao Tong University secondary websites.
 * Use seedSJTUCollegeSources() to upsert these into the database.
 */
import { prisma } from '../prisma.js';

export interface SJTUSourceConfig {
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

export const SJTU_COLLEGE_SOURCES: SJTUSourceConfig[] = [
  // ===== 高优先级：工科（与项目最相关）=====
  {
    name: '上海交大-机械与动力工程学院',
    url: 'https://me.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '实验室照片、科研设备图、团队合影、学术会议照片、探索发现专栏科研成果配图',
    strategyHint: '有探索发现专栏展示科研成果配图；新闻页大量科研配图',
    notes: '工科-机械/动力/能源',
  },
  {
    name: '上海交大-电子信息与电气工程学院',
    url: 'https://www.seiee.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '学院宣传片、科研成果图、学术活动照片、科研基地专栏',
    strategyHint: '学部级页面，下设电气/自动化/计算机/集成电路4个子学院；有科研基地专栏',
    notes: '工科-电气/自动化/计算机/集成电路',
  },
  {
    name: '上海交大-材料科学与工程学院',
    url: 'https://smse.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科研成果配图（Nature/Science论文图）、实验室设备、学术活动、12幅首页轮播科研成果图',
    strategyHint: '首页有12幅轮播科研成果图；底部友链列有10+重点实验室和研究所独立页面',
    notes: '工科-材料/冶金；视觉内容丰富度TOP4',
  },
  {
    name: '上海交大-船舶海洋与建筑工程学院',
    url: 'https://oce.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '海洋装备照片、大型实验设施、学院宣传片、学者照片、视觉船建栏目',
    strategyHint: '视觉船建栏目有宣传片；基地建设列有海洋工程全国重点实验室等7个平台',
    notes: '工科-船舶/海洋/土木/力学；视觉内容丰富度TOP9',
  },
  {
    name: '上海交大-航空航天学院',
    url: 'https://www.aero.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '空天装备照片、宣传片、实验设施、学术会议、视觉空天栏目',
    strategyHint: '视觉空天栏目有学院宣传片；新闻页有行业单位调研照片',
    notes: '工科-航空/航天/力学',
  },
  {
    name: '上海交大-生物医学工程学院',
    url: 'https://bme.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '医疗设备照片、科研成果配图、学术会议、实验室照片、磁共振国家工程研究中心',
    strategyHint: '科学研究栏目下科研基地列有工程中心/重点实验室；磁共振国家工程研究中心子站',
    notes: '生物医学工程/医疗器械',
  },
  {
    name: '上海交大-环境科学与工程学院',
    url: 'https://sese.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科研成果配图（Science论文等）、学术活动照片、生态考察图、9幅首页科研成果大图轮播',
    strategyHint: '首页有9幅科研成果大图轮播；研究平台列有国家野外观测站等基地',
    notes: '工科-环境/生态/资源；视觉内容丰富度TOP5',
  },
  {
    name: '上海交大-化学化工学院',
    url: 'https://scce.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '院士照片、科研成果配图（Nature Chemistry等）、实验室照片、视觉化院栏目',
    strategyHint: '视觉化院栏目；师生风采有4位院士介绍；化院智慧有大量论文配图新闻',
    notes: '化学/化工；视觉内容丰富度TOP10',
  },
  {
    name: '上海交大-计算机学院',
    url: 'https://cs.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '学院宣传片（B站/小红书视频）、学术活动照片、19个研究所介绍',
    strategyHint: '学院视频栏目有多部宣传片；学院研究所列出19个研究所；有全球午餐会学术活动系列',
    notes: '计算机/AI/网络安全；视觉内容丰富度TOP8',
  },

  // ===== 中优先级：理科 =====
  {
    name: '上海交大-物理与天文学院',
    url: 'https://www.physics.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '暗物质探测实验照片、粒子物理实验设备、科研成果图、暗物质物理全国重点实验室',
    strategyHint: '暗物质物理全国重点实验室子栏目；科研动态配图丰富；李政道研究所友情链接',
    notes: '物理/天文',
  },
  {
    name: '上海交大-数学科学学院',
    url: 'https://math.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '学术会议照片、学者照片、数学可视化',
    strategyHint: '有教育部重点实验室（科学工程计算）；吴文俊数学中心；学术报告信息丰富',
    notes: '数学/统计',
  },
  {
    name: '上海交大-生命科学技术学院',
    url: 'https://life.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科研成果配图（Cell/Nature论文）、实验室显微照片、学术活动',
    strategyHint: '首页轮播图；科研动态栏目有大量高水平论文配图（Cell/Nature Synthesis等）',
    notes: '生物学/生物技术',
  },

  // ===== 低优先级：人文社科等 =====
  {
    name: '上海交大-设计学院',
    url: 'https://design.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '设计作品展示、建筑设计图、景观规划图、论坛照片',
    strategyHint: '设计作品栏目有多个项目案例展示；6个研究所介绍；设计动态有东方设计论坛系列',
    notes: '设计学/建筑/景观；视觉内容丰富度TOP3',
  },
  {
    name: '上海交大-媒体与传播学院',
    url: 'https://smc.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '影视作品截图、学术活动、设计作品',
    strategyHint: '媒传方向，视觉内容丰富度较高',
    notes: '新闻传播/影视',
  },

  // ===== 补充：其他高视觉价值来源 =====
  {
    name: '上海交大-海洋学院',
    url: 'https://soo.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '极地科考照片、海洋装备图、全球科研站点交互式地图',
    strategyHint: '环球科研交互式地图展示全球科研项目；极地/深海科考照片极丰富',
    notes: '海洋科学；视觉内容丰富度TOP1',
  },
  {
    name: '上海交大-药学院',
    url: 'https://pharm.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '科研成果配图（Angew Chem等顶刊）、实验室照片、学术会议、创新免疫治疗全国重点实验室',
    strategyHint: '科研动态栏目有大量论文配图新闻；首页轮播图提及创新免疫治疗全国重点实验室',
    notes: '药学',
  },
  {
    name: '上海交大-农业与生物学院',
    url: 'https://www.agri.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '农作物照片、实验田、科研成果配图（Nature/Cell/Science Advances论文图）、9幅首页大图轮播',
    strategyHint: '首页9幅科研成果大图轮播；农生视觉栏目；平台基地列有国家野外站等',
    notes: '农学/食品/园艺/动科；视觉内容丰富度TOP6',
  },
  {
    name: '上海交大-李政道研究所',
    url: 'https://tdli.sjtu.edu.cn',
    sourceType: 'research_center_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '实验室建筑、暗物质探测装置、科研可视化、学术活动、PandaX/海铃/JUST等大科学装置',
    strategyHint: '视觉李所栏目；暗物质物理全国重点实验室子站；大科学装置照片丰富',
    notes: '物理/天文/粒子科学；视觉内容丰富度TOP7',
  },
  {
    name: '上海交大-医疗机器人研究院',
    url: 'https://imr.sjtu.edu.cn',
    sourceType: 'research_center_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '医疗机器人实物照片、手术演示图、科研成果配图（Nature Machine Intelligence等）',
    strategyHint: '科研动态有大量顶级期刊论文配图；平台建设有柔性机器人重点实验室等',
    notes: '生物医学工程/机器人；视觉内容丰富度TOP2',
  },
  {
    name: '上海交大-金属基复合材料国家重点实验室',
    url: 'https://sklcm.sjtu.edu.cn',
    sourceType: 'national_lab_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '实验装备照片（合成/测试/分析仪器）、科研成果图、学术会议照片',
    strategyHint: '独立域名；有实验装备栏目（合成/测试/分析仪器照片）；最新研究进展有科研图文',
    notes: '材料/复合材料；国家重点实验室',
  },
  {
    name: '上海交大-密西根学院（全球学院）',
    url: 'https://www.ji.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '校园照片、学生活动、科研实验室照片',
    strategyHint: '英文为主；有Research Centers和Research Labs页面',
    notes: '工程（中美合作）',
  },
  {
    name: '上海交大-巴黎卓越工程师学院',
    url: 'https://speit.sjtu.edu.cn',
    sourceType: 'university_department_news',
    category: 'SJTU',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '校园照片、中法文化活动、教学实验室照片、学生活动',
    strategyHint: '中法双语；有教学实验室展示；菁菁校园有品牌活动照片',
    notes: '工程（中法合作）',
  },
];

/**
 * Seed SJTU college sources into the CrawlSource table.
 * Uses upsert (skip if name+url combo exists) to be idempotent.
 */
export async function seedSJTUCollegeSources(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const config of SJTU_COLLEGE_SOURCES) {
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

/**
 * CLI entry point for seeding SJTU sources.
 * Usage: npx tsx server/src/crawler/sjtuSources.ts
 */
async function main() {
  console.log('Seeding SJTU college sources...');
  const result = await seedSJTUCollegeSources();
  console.log(`Done. Created: ${result.created}, Skipped: ${result.skipped}`);
}

// Allow running directly as a script
const isMainModule = process.argv[1]?.endsWith('sjtuSources.ts') || process.argv[1]?.endsWith('sjtuSources.js');
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
