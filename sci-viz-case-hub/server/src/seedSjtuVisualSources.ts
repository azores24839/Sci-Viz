import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'url';

const prisma = new PrismaClient();

type SjtuVisualSource = {
  school: string;
  discipline: string;
  name: string;
  url: string;
  sourceType: string;
  crawlStatus: string;
  crawlTier: string;
  visualValue: string;
  strategyHint: string;
  seedUrls?: string[];
};

export const SJTU_VISUAL_SOURCES: SjtuVisualSource[] = [
  {
    school: '船舶海洋与建筑工程学院',
    discipline: '工程',
    name: 'JAMSTEC Images',
    url: 'https://www.jamstec.go.jp/egcr/e/oal/gallery.html',
    sourceType: 'official_research_gallery',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'S',
    visualValue: '深海潜水器摄影、海底地形、海洋观测设备和科考现场图像。',
    strategyHint: '优先抓 photo gallery 直接页；筛掉纯生活照，只保留观测设备、船载采样和海洋环境图。',
    seedUrls: [
      'https://www.jamstec.go.jp/egcr/e/oal/gallery.html',
      'https://www.jamstec.go.jp/obsmcs_db/e/photo.html',
      'https://www.jamstec.go.jp/e/hot_pictures/?201=',
    ],
  },
  {
    school: '船舶海洋与建筑工程学院',
    discipline: '工程',
    name: 'MARIN 荷兰海事研究院',
    url: 'https://www.marin.nl/en/news',
    sourceType: 'research_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '船模试验、水动力学、CFD 仿真、海工测试和实验设施图。',
    strategyHint: '优先抓 news/project/research 页中的试验图和仿真图。',
    seedUrls: [
      'https://www.marin.nl/en/news/marin-verifies-abb-dynafin-propulsion-performance-after-trials-for-ld-armateurs',
      'https://www.marin.nl/en/research/cfd-development',
      'https://www.marin.nl/en/research/time-domain-simulations-and-visualisation',
      'https://www.marin.nl/en/research/resistance-and-propulsion',
      'https://www.marin.nl/en/news/captive-manoeuvring-model-tests',
      'https://www.marin.nl/en/news/fin-propulsion-revival',
      'https://www.marin.nl/en/jips/jores',
      'https://www.marin.nl/en/publications/cfd---an-increasingly-important-research-tool',
      'https://www.marin.nl/en/publications/cfd-helps-optimize-yacht-design-process',
      'https://www.marin.nl/en/news/watch-the-marin-chain',
    ],
  },
  {
    school: '机械与动力工程学院',
    discipline: '工程',
    name: 'CERN Photos',
    url: 'https://cds.cern.ch/collection/Photos?ln=en',
    sourceType: 'official_engineering_photo_archive',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'S',
    visualValue: '加速器设备、探测器组装、大科学装置工程现场和机械结构摄影。',
    strategyHint: 'CDS 详情页 HTML 优先；当前不走旧 REST API。',
  },
  {
    school: '机械与动力工程学院',
    discipline: '工程',
    name: 'Fraunhofer 弗劳恩霍夫应用研究协会',
    url: 'https://www.fraunhofer.de/en/press/research-news.html',
    sourceType: 'research_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '工业 4.0、机械系统、生产制造、实验设备和工程样机摄影。',
    strategyHint: '优先抓 research-news 详情页；保留机械、制造、能源、机器人相关条目。',
  },
  {
    school: '电气工程学院',
    discipline: '工程',
    name: 'IEEE Power & Energy Society',
    url: 'https://ieee-pes.org/news/',
    sourceType: 'professional_society_news',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'A',
    visualValue: '电网、电力系统、电气设备、能源基础设施和电力数据可视化。',
    strategyHint: '从 news / magazine / technical activities 中筛电网拓扑、设备和数据图。',
  },
  {
    school: '电气工程学院',
    discipline: '工程',
    name: 'EPRI 美国电力研究院',
    url: 'https://top.epri.com/',
    sourceType: 'research_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '电力研究设备、输配电、电网韧性、核能和能源系统技术图。',
    strategyHint: '优先抓 TOP / distribution / tech portal 技术页；主站 news 静态发现不足时使用受控 URL 清单。',
    seedUrls: [
      'https://top.epri.com/',
      'https://top.epri.com/research-area/transmission-planning-and-integrated-planning',
      'https://distribution.epri.com/technology-insights/transformers/',
      'https://distribution.epri.com/automation/public/overview/',
      'https://transmission.epri.com/getset/public/overview/',
      'https://techportal.epri.com/demonstrations/ig',
    ],
  },
  {
    school: '电气工程学院',
    discipline: '工程',
    name: 'ABB Electrification Medium Voltage',
    url: 'https://new.abb.com/medium-voltage',
    sourceType: 'enterprise_technology_pages',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '中压开关柜、真空灭弧室、配电设备、数字变电站和电网保护设备图。',
    strategyHint: '优先抓 medium-voltage 产品与技术页；保留设备摄影、产品结构和电网应用图。',
    seedUrls: [
      'https://new.abb.com/medium-voltage',
      'https://new.abb.com/medium-voltage/switchgear',
      'https://new.abb.com/medium-voltage/switchgear/sf6free',
      'https://new.abb.com/medium-voltage/apparatus/vacuum-interrupters-andembedded-poles',
    ],
  },
  {
    school: '电气工程学院',
    discipline: '工程',
    name: 'Siemens Energy 西门子能源电网技术',
    url: 'https://www.siemens-energy.com/us/en/home/products-services/product-offerings/transformers.html',
    sourceType: 'enterprise_technology_pages',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '电力变压器、HVDC 变压器、相移变压器、高压开关服务和电网韧性技术图。',
    strategyHint: '优先抓 transformers / HVDC / phase-shifting transformer / high-voltage service 页面。',
    seedUrls: [
      'https://www.siemens-energy.com/us/en/home/products-services/product-offerings/transformers.html',
      'https://www.siemens-energy.com/us/en/home/products-services/product/power-transformers.html',
      'https://www.siemens-energy.com/us/en/home/products-services/product/hvdc-transformers.html',
      'https://www.siemens-energy.com/us/en/home/products-services/product/phase-shifting-transformers.html',
      'https://www.siemens-energy.com/global/en/home/products-services/service/hv-product-services.html',
      'https://www.siemens-energy.com/global/en/home/products-services/solutions-usecase/grid-resilience.html',
    ],
  },
  {
    school: '自动化与感知学院',
    discipline: '信息科学',
    name: 'CMU 卡内基梅隆大学机器人研究所',
    url: 'https://www.ri.cmu.edu/news/',
    sourceType: 'robotics_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '蛇形机器人、移动机器人、野外机器人、感知与控制系统演示图。',
    strategyHint: '优先抓 news / project 详情页；保留机器人实物、实验场景和系统图。',
  },
  {
    school: '自动化与感知学院',
    discipline: '信息科学',
    name: 'UZH 机器人与感知研究组 RPG',
    url: 'https://rpg.ifi.uzh.ch/research.html',
    sourceType: 'lab_project_gallery',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '无人机感知导航、事件相机、视觉 SLAM、机器人系统图和实验场景。',
    strategyHint: '研究项目页多为高质量直接图；若发现链接少，直接处理入口页。',
  },
  {
    school: '自动化与感知学院',
    discipline: '信息科学',
    name: 'DLR Robotics and Mechatronics',
    url: 'https://www.dlr.de/rm/en/',
    sourceType: 'research_institute_lab',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'A',
    visualValue: '机器人、机电系统、自主系统、航天机器人和实验平台图。',
    strategyHint: '优先抓 institute / research / news 详情页；保留设备和实验图。',
  },
  {
    school: '集成电路学院',
    discipline: '信息科学',
    name: 'ZEISS 蔡司半导体制造技术',
    url: 'https://www.zeiss.com/semiconductor-manufacturing-technology/home.html',
    sourceType: 'enterprise_technology_pages',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '光刻镜头、半导体制造光学系统、精密工程 3D 剖面和洁净室摄影。',
    strategyHint: '优先抓 technology / products / solutions 页面；避免纯营销 banner。',
    seedUrls: [
      'https://www.zeiss.com/semiconductor-manufacturing-technology/inspiring-technology/euv-lithography.html',
      'https://www.zeiss.com/semiconductor-manufacturing-technology/inspiring-technology/duv-lithography.html',
      'https://www.zeiss.com/semiconductor-manufacturing-technology/inspiring-technology/high-na-euv-lithography.html',
      'https://www.zeiss.com/semiconductor-manufacturing-technology/products.html',
      'https://www.zeiss.com/semiconductor-manufacturing-technology/products/semiconductor-manufacturing-optics/synchrotron-optics.html',
    ],
  },
  {
    school: '集成电路学院',
    discipline: '信息科学',
    name: 'ASML 半导体光刻系统',
    url: 'https://www.asml.com/en/products/euv-lithography-systems',
    sourceType: 'enterprise_technology_pages',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: 'EUV/DUV 光刻机、晶圆台、光源、光学柱和洁净室工程图。',
    strategyHint: '优先抓 ASML 产品/技术解释页；保留系统剖面、光源、晶圆台和工程装配图。',
    seedUrls: [
      'https://www.asml.com/en/products/euv-lithography-systems',
      'https://www.asml.com/en/products',
    ],
  },
  {
    school: '集成电路学院',
    discipline: '信息科学',
    name: 'IEEE Electron Devices Society',
    url: 'https://eds.ieee.org/news-events/news',
    sourceType: 'professional_society_news',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'A',
    visualValue: '器件结构、工艺流程、半导体研究图和电子器件技术解释图。',
    strategyHint: '优先抓 news / magazine / society 详情页；作为 IEEE Xplore 封面之外的公开入口。',
  },
  {
    school: '材料科学与工程学院',
    discipline: '材料',
    name: 'Max Planck 马普可持续材料研究所',
    url: 'https://www.mpie.de/2914286/press_releases',
    sourceType: 'research_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '原子探针层析、合金微结构、显微组织、材料表征和实验设备图。',
    strategyHint: '优先抓 press release / research 详情页；保留显微图、相图和材料结构图。',
    seedUrls: [
      'https://www.mpie.de/2914286/press_releases',
      'https://www.mpie.de/',
    ],
  },
  {
    school: '材料科学与工程学院',
    discipline: '材料',
    name: 'Thermo-Calc 计算材料学资源',
    url: 'https://thermocalc.com/resources/',
    sourceType: 'technical_resource_pages',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '材料热力学相图、计算材料学数据图、工艺模拟和应用案例图。',
    strategyHint: '优先抓 resources / applications / examples；保留相图和计算结果图。',
    seedUrls: [
      'https://thermocalc.com/products/thermo-calc/equilibrium-calculator/',
      'https://thermocalc.com/products/thermo-calc/pourbaix-diagram-module/',
      'https://thermocalc.com/products/thermo-calc/material-to-material-calculator/',
      'https://thermocalc.com/solutions/solutions-by-material/slags/',
    ],
  },
  {
    school: '材料科学与工程学院',
    discipline: '材料',
    name: 'ASM International 国际材料学会·金相学',
    url: 'https://www.asminternational.org/ims/resources/image-of-the-month/',
    sourceType: 'professional_society_gallery',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '金相显微、合金微观结构、MicroArt、失效分析和材料组织图。',
    strategyHint: '优先抓 IMS image-of-the-month 和 metallography 页面；保留显微图与材料结构说明。',
    seedUrls: [
      'https://www.asminternational.org/ims/resources/image-of-the-month/',
      'https://www.asminternational.org/ims/image-of-the-month/',
      'https://www.asminternational.org/ims/resources/metallography-microstructure-analysis/',
    ],
  },
  {
    school: '材料科学与工程学院',
    discipline: '材料',
    name: 'BASF Battery Materials Research',
    url: 'https://www.basf.com/basf/www/ie/en/who-we-are/innovation/our-innovations/battery-materials',
    sourceType: 'enterprise_technology_pages',
    crawlStatus: 'active_static',
    crawlTier: 'A',
    visualValue: '电池材料显微图、正极材料研发、测试电池、实验室设备和材料工艺图。',
    strategyHint: '优先抓 BASF battery materials / innovation 研发页；保留显微图、实验场景和材料测试图。',
    seedUrls: [
      'https://www.basf.com/basf/www/ie/en/who-we-are/innovation/our-innovations/battery-materials',
      'https://battery-materials.basf.com/global/en/about-us',
      'https://automotive-transportation.basf.com/global/en/stories/electric-vehicle-battery-technology-and-material-solutions',
      'https://www.basf.com/basf/www/us/en/media/science-around-us/small-beads-for-long-distances',
    ],
  },
  {
    school: '环境科学与工程学院',
    discipline: '环境科学',
    name: 'IRENA Publications',
    url: 'https://www.irena.org/Publications',
    sourceType: 'data_visualization_reports',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'A',
    visualValue: '全球可再生能源统计、地图、系统图、Sankey 和政策数据可视化。',
    strategyHint: '优先抓 publications 详情页中的封面和图表；PDF 暂不直接抓。',
  },
  {
    school: '环境科学与工程学院',
    discipline: '环境科学',
    name: 'NREL Energy Visualization Pages',
    url: 'https://www.nrel.gov/computational-science/data-analysis-visualization',
    sourceType: 'national_lab_research_pages',
    crawlStatus: 'needs_adapter_tuning',
    crawlTier: 'S',
    visualValue: '可再生能源数据可视化、风能/光伏设施、能源系统仿真和研究设备图。',
    strategyHint: '优先抓 NREL 可视化、风能、光伏和设施页面；保留设备、仿真和能源系统图。',
    seedUrls: [
      'https://www.nrel.gov/computational-science/data-analysis-visualization',
      'https://www.nrel.gov/pv/solar-energy-research-facility',
      'https://www.nrel.gov/pv/science-technology-facility',
      'https://www.nrel.gov/wind/research',
      'https://www.nrel.gov/wind/atmospheric-science',
      'https://www.nrel.gov/wind/distributed-wind-aeroelastic-modeling',
      'https://www.nrel.gov/wind/nwtc/index',
      'https://www.nrel.gov/manufacturing/wind',
    ],
  },
  {
    school: '生物医学工程学院',
    discipline: '医学',
    name: 'Harvard Wyss 仿生工程研究所',
    url: 'https://wyss.harvard.edu/news/',
    sourceType: 'research_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '器官芯片、生物启发设备、生物材料、医疗工程原型和显微图。',
    strategyHint: '优先抓 news / technology / focus-area 详情页；保留设备和机制图。',
  },
  {
    school: '生物医学工程学院',
    discipline: '医学',
    name: 'HHMI Janelia 珍妮莉亚研究园区',
    url: 'https://www.janelia.org/news',
    sourceType: 'research_institute_news',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '显微成像、神经科学、3D 重建、实验设备和算法可视化。',
    strategyHint: '优先抓 news / project-team 详情页；保留显微和神经成像图。',
    seedUrls: [
      'https://www.janelia.org/our-research/overview/project-teams',
      'https://www.janelia.org/news/new-imaging-method-reveals-the-3d-arrangement-of-molecules-inside-cells',
      'https://www.janelia.org/project-team/cellmap',
      'https://www.janelia.org/project-team/flyem',
      'https://www.janelia.org/project-team/mouselight',
      'https://www.janelia.org/support-team/project-technical-resources/bioimage-analysis',
    ],
  },
  {
    school: '计算机学院',
    discipline: '信息科学',
    name: 'Distill 机器学习可视化期刊',
    url: 'https://distill.pub/',
    sourceType: 'interactive_explainer_archive',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '机器学习交互解释、模型结构、数据可视化和网页交互式图解。',
    strategyHint: '优先抓 article 页面；入库静态缩略图，manualNotes 标记交互来源。',
  },
  {
    school: '电子信息与电气工程学院',
    discipline: '信息科学',
    name: 'MIT.nano 纳米科学与工程中心',
    url: 'https://mitnano.mit.edu/news',
    sourceType: 'lab_news',
    crawlStatus: 'active_static',
    crawlTier: 'S',
    visualValue: '纳米电子、芯片制造、洁净室、设备摄影和微纳结构图。',
    strategyHint: 'MIT.nano 列表多跳转到 MIT News；使用受控详情页保留量子实验室、微纳材料和设施图。',
    seedUrls: [
      'https://news.mit.edu/2026/new-laboratory-aims-to-advance-quantum-research-nation-0528',
      'https://news.mit.edu/2026/mit-researchers-develop-low-cost-technique-lithium-from-rocks-0528',
      'https://news.mit.edu/2026/researchers-reprogram-materials-quickly-rearranging-their-atoms-0513',
    ],
  },
];

function makeNotes(source: SjtuVisualSource) {
  return [
    `target_sjtu_school: ${source.school}`,
    `target_discipline: ${source.discipline}`,
    'program: sjtu_visual_supplement_2026_06',
    'quality_focus: non_news_gallery_or_technical_visual',
  ].join('\n');
}

async function main() {
  for (const source of SJTU_VISUAL_SOURCES) {
    const data = {
      name: source.name,
      url: source.url,
      category: 'SJTU-VIS',
      sourceType: source.sourceType,
      adapterType: 'static_html',
      crawlStatus: source.crawlStatus,
      crawlTier: source.crawlTier,
      visualValue: source.visualValue,
      strategyHint: source.strategyHint,
      notes: makeNotes(source),
      enabled: true,
    };

    const existing = await prisma.crawlSource.findFirst({ where: { name: source.name } });
    if (existing) {
      await prisma.crawlSource.update({ where: { id: existing.id }, data });
      console.log(`Updated ${source.name}`);
    } else {
      await prisma.crawlSource.create({ data });
      console.log(`Created ${source.name}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
