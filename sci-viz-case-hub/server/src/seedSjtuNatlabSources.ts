import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'url';

const prisma = new PrismaClient();

const NATLAB_SOURCES = [
  // ===== 已有（不需要重复创建，仅确认在SJTU-NATLAB）=====
  // 海洋工程全国重点实验室 (oe.sjtu.edu.cn) - 已有
  // 机械系统与振动全国重点实验室 (msv.sjtu.edu.cn) - 已有
  // 金属基复合材料国家重点实验室 (sklcm.sjtu.edu.cn) - 已移到SJTU-NATLAB
  // 区域光纤通信网与新型光通信系统国家重点实验室 (loct.sjtu.edu.cn) - 已有
  // 微生物代谢全国重点实验室 (skmml.sjtu.edu.cn) - 已有
  // 李政道研究所 (tdli.sjtu.edu.cn) - 已移到SJTU-NATLAB

  // ===== 国家实验室 =====
  {
    name: '船舶与海洋工程国家实验室（筹）',
    url: 'https://oe.sjtu.edu.cn',
    sourceType: 'national_lab',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '船舶与海洋工程大国重器、深海装备、海洋平台',
    strategyHint: '2023年重组为海洋工程全国重点实验室，与oe.sjtu.edu.cn共享站点',
    notes: '国家实验室（筹）- 已重组',
  },

  // ===== 国家重大科技基础设施 =====
  {
    name: '转化医学国家重大科技基础设施（上海）',
    url: 'https://transmed.sjtu.edu.cn',
    sourceType: 'major_infrastructure',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '转化医学设施、临床研究、医学影像',
    strategyHint: 'SPA单页应用，需要Playwright等浏览器渲染',
    notes: '国家重大科技基础设施',
  },

  // ===== 国家重点实验室（续）=====
  {
    name: '癌基因及相关基因国家重点实验室',
    url: 'http://www.shsci.org',
    sourceType: 'national_lab',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '肿瘤研究、癌基因、分子生物学图片',
    strategyHint: '上海市肿瘤研究所网站；可能需要适配器调优',
    notes: '国家重点实验室-依托上海市肿瘤研究所/仁济医院',
  },
  {
    name: '医学基因组学国家重点实验室',
    url: 'http://www.rjh.com.cn/pages/Yixuejiyin/index.shtml',
    sourceType: 'national_lab',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'blocked_url',
    adapterType: 'static_html',
    visualValue: '医学基因组学、血液学、基因组研究图片',
    strategyHint: '瑞金医院网站子页面，原URL返回404；待确认有效地址',
    notes: '国家重点实验室-依托瑞金医院上海血液学研究所',
  },

  // ===== 国家级科研机构 =====
  // 李政道研究所 - 已移到SJTU-NATLAB

  // ===== 国家工程研究中心 =====
  {
    name: '模具CAD国家工程研究中心',
    url: 'https://me.sjtu.edu.cn',
    sourceType: 'engineering_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '模具CAD/CAM、数字化设计、精密制造图',
    strategyHint: '无独立网站，依托机械与动力工程学院平台',
    notes: '国家工程研究中心',
  },
  {
    name: '轻合金精密成型国家工程研究中心',
    url: 'https://laf.sjtu.edu.cn',
    sourceType: 'engineering_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '轻合金材料、精密成型、铸造工艺图',
    strategyHint: '丁文江院士任主任，材料学院托管',
    notes: '国家工程研究中心',
  },
  {
    name: '纳米技术及应用国家工程研究中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'engineering_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '纳米材料、纳米技术、微观结构图',
    strategyHint: '无独立网站',
    notes: '国家工程研究中心',
  },
  {
    name: '组织工程国家研究中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'engineering_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '组织工程、再生医学、生物材料图',
    strategyHint: '无独立网站',
    notes: '国家研究中心',
  },
  {
    name: '数字电视国家工程研究中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'engineering_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '数字电视、视频编解码、通信标准',
    strategyHint: '无独立网站',
    notes: '国家工程研究中心',
  },

  // ===== 国家工程实验室 =====
  {
    name: '汽车电子控制技术国家工程实验室',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'engineering_lab',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '汽车电子、智能驾驶、控制系统图',
    strategyHint: '无独立网站',
    notes: '国家工程实验室',
  },
  {
    name: '信息内容分析技术国家工程实验室',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'engineering_lab',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '信息内容分析、自然语言处理、文本挖掘',
    strategyHint: '无独立网站',
    notes: '国家工程实验室',
  },

  // ===== 国家级研发中心 =====
  {
    name: '国家能源智能电网（上海）研发中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'rd_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '智能电网、电力系统、能源技术图',
    strategyHint: '无独立网站',
    notes: '国家级研发中心',
  },

  // ===== 2011协同创新中心 =====
  {
    name: 'IFSA协同创新中心',
    url: 'https://llp.sjtu.edu.cn',
    sourceType: 'collaborative_innovation',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '激光聚变、高功率激光、等离子体物理',
    strategyHint: '与激光等离子体教育部重点实验室关联站点',
    notes: '2011协同创新中心',
  },
  {
    name: '未来媒体网络协同创新中心',
    url: 'http://cmic.sjtu.edu.cn',
    sourceType: 'collaborative_innovation',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '未来媒体、网络技术、通信系统图',
    strategyHint: '原站点内容为空，需要确认有效地址',
    notes: '2011协同创新中心',
  },
  {
    name: '高新船舶与深海开发装备协同创新中心',
    url: 'http://cisse.sjtu.edu.cn',
    sourceType: 'collaborative_innovation',
    category: 'SJTU-NATLAB',
    crawlTier: 'B',
    crawlStatus: 'blocked_url',
    adapterType: 'static_html',
    visualValue: '船舶工程、深海装备、海洋平台',
    strategyHint: '站点连接被拒，待恢复或更新地址',
    notes: '2011协同创新中心',
  },

  // ===== 国家双创示范基地 =====
  {
    name: '国家双创示范基地（双创推进办公室）',
    url: 'http://inen.sjtu.edu.cn',
    sourceType: 'entrepreneurship_base',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'blocked_url',
    adapterType: 'static_html',
    visualValue: '创新创业、孵化器、众创空间',
    strategyHint: '站点连接被拒，待恢复或更新地址',
    notes: '国家双创示范基地',
  },
  {
    name: '创新设计中心',
    url: 'https://design.sjtu.edu.cn',
    sourceType: 'entrepreneurship_base',
    category: 'SJTU-NATLAB',
    crawlTier: 'A',
    crawlStatus: 'active_static',
    adapterType: 'static_html',
    visualValue: '设计作品展示、建筑设计图、景观规划图、论坛照片',
    strategyHint: '设计作品栏目有多个项目案例展示；6个研究所介绍',
    notes: '国家双创示范基地-创新设计中心（与上海交大设计学院共享站点）',
  },

  // ===== 国际科技合作基地 =====
  {
    name: '系统生物医学国家级国际联合研究中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'international_cooperation',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '系统生物医学、合成生物学、生物信息学',
    strategyHint: '无独立网站，可能依托生命科学技术学院',
    notes: '国家级国际科技合作基地',
  },
  {
    name: '中美食品安全联合研究中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'international_cooperation',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '食品安全、检测技术、联合研究',
    strategyHint: '无独立网站',
    notes: '国际科技合作基地',
  },
  {
    name: '激光制造国际科技合作基地',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'international_cooperation',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '激光制造、精密加工、激光应用图',
    strategyHint: '无独立网站',
    notes: '国际科技合作基地',
  },
  {
    name: '先进核能系统热工水力基础研究国际科技合作基地',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'international_cooperation',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '核能系统、热工水力、反应堆安全',
    strategyHint: '无独立网站',
    notes: '国际科技合作基地',
  },
  {
    name: '上海转化医学国际联合研究中心',
    url: 'https://transmed.sjtu.edu.cn',
    sourceType: 'international_cooperation',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'needs_adapter_tuning',
    adapterType: 'static_html',
    visualValue: '转化医学、临床研究、医学影像',
    strategyHint: '与转化医学国家重大科技基础设施共享站点',
    notes: '国际联合研究中心',
  },

  // ===== WHO合作中心 =====
  {
    name: 'WHO新生儿保健合作中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'who_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '新生儿保健、儿科医学',
    strategyHint: '位于医学院/附属医院，无独立网站',
    notes: 'WHO合作中心',
  },
  {
    name: 'WHO免疫遗传学与免疫病理学合作中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'who_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '免疫遗传学、免疫病理学',
    strategyHint: '位于医学院/附属医院，无独立网站',
    notes: 'WHO合作中心',
  },
  {
    name: 'WHO癌症研究合作中心',
    url: 'https://www.sjtu.edu.cn',
    sourceType: 'who_center',
    category: 'SJTU-NATLAB',
    crawlTier: 'C',
    crawlStatus: 'no_independent_site',
    adapterType: 'static_html',
    visualValue: '癌症研究、肿瘤学',
    strategyHint: '位于医学院/附属医院，无独立网站',
    notes: 'WHO合作中心',
  },
];

async function main() {
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const src of NATLAB_SOURCES) {
    const existing = await prisma.crawlSource.findFirst({
      where: { name: src.name },
    });

    if (existing) {
      if (existing.category !== src.category) {
        await prisma.crawlSource.update({
          where: { id: existing.id },
          data: { category: src.category, sourceType: src.sourceType },
        });
        updated++;
        console.log(`Updated category: ${src.name}`);
      } else {
        skipped++;
      }
      continue;
    }

    await prisma.crawlSource.create({
      data: {
        name: src.name,
        url: src.url,
        category: src.category,
        sourceType: src.sourceType,
        crawlTier: src.crawlTier,
        crawlStatus: src.crawlStatus,
        adapterType: src.adapterType,
        visualValue: src.visualValue,
        strategyHint: src.strategyHint,
        notes: src.notes,
        enabled: src.crawlStatus !== 'no_independent_site',
      },
    });
    created++;
    console.log(`Created: ${src.name}`);
  }

  const total = await prisma.crawlSource.count({ where: { category: 'SJTU-NATLAB' } });
  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  console.log(`Total SJTU-NATLAB sources: ${total}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}

export { NATLAB_SOURCES };