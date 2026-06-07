export const TAXONOMY = {
  mediaType: ['摄影', '手绘图', '3D渲染', '信息图', '显微图', '数据可视化', '混合媒介', '不确定'],
  contentType: ['单人肖像', '群体肖像', '绘画肖像', '实验设备', '实验过程', '微观样本', '机制模型', '数据结果', '空间环境', '团队场景', '科普传播', '不确定'],
  discipline: ['生命科学', '材料', '医学', '工程', '物理', '化学', '信息科学', '环境科学', '综合交叉', '不确定'],
  technicalMethod: ['拍摄', '成像', '绘设', '数据', '渲染', '生成'],
  functionalPurpose: ['记录', '解释', '数据', '展示', '传播', '交互'],
  distributionMedium: ['静图', '动图', '视频', '图组', '交互', '实体'],
} as const;

export type KpiDimension = keyof typeof TAXONOMY;

export const SUB_TAXONOMY = {
  mediaSubType: {
    '3D渲染': ['3D产品渲染', '3D机制图', '3D场景渲染', '3D数据可视化', '3D人物肖像'],
    '摄影': ['纪实摄影', '个人肖像', '群众肖像', '过程摄影', '航拍'],
    '手绘图': ['科学插画', '图标设计', '版面设计/信息图'],
    '信息图': ['科学插画', '图标设计', '版面设计/信息图'],
    '显微图': ['光学显微', '电子显微', '医学影像', '遥感成像', '热成像'],
    '数据可视化': ['统计图表', '地图', '网络图', '科学数据可视化'],
    '混合媒介': [],
    '不确定': [],
  },
  contentSubType: {
    '记录': ['个人肖像', '群体/团队', '实验过程', '设备空间', '现场环境'],
    '解释': ['机制图解', '结构剖析', '流程步骤', '原理示意'],
    '数据': ['实验结果', '统计分析', '模型模拟', '趋势预测'],
    '展示': ['产品展示', '项目形象', '空间展示', '成果展示'],
    '传播': ['品牌宣传', '科普传播', '封面', '招生', '项目申报'],
    '交互': ['数据探索', '交互筛选', '可视化浏览', '决策支持'],
  },
} as const;

export type SubTaxonomyDimension = keyof typeof SUB_TAXONOMY;

const DIMENSIONS = new Set<string>(Object.keys(TAXONOMY));

const ALIASES: Record<KpiDimension, Array<[RegExp, string]>> = {
  mediaType: [

    [/显微|微观/, '显微图'],
    [/3d|渲染/i, '3D渲染'],
    [/信息图|图解|流程/, '信息图'],
    [/数据|可视化|图表/, '数据可视化'],
    [/手绘|插画/, '手绘图'],
    [/摄影|照片|纪实|肖像|遥感|卫星/, '摄影'],
  ],
  contentType: [
    [/绘画肖像|手绘人物|人物插画|肖像插画|painted portrait|illustrated portrait/i, '绘画肖像'],
    [/群体肖像|多人肖像|团队合影|团队|group portrait|team/i, '群体肖像'],
    [/科研人员|研究人员|科学家|人物|单人肖像|肖像|researcher|scientist|portrait/i, '单人肖像'],
    [/设备|仪器|装置/, '实验设备'],
    [/实验过程|操作|流程/, '实验过程'],
    [/微观|样本|细胞|组织|病毒/, '微观样本'],
    [/机制|模型|结构/, '机制模型'],
    [/数据|结果|图表/, '数据结果'],
    [/空间|天文|地球|环境|场景/, '空间环境'],
    [/团队/, '团队场景'],
    [/科普|传播|展览/, '科普传播'],
  ],
  discipline: [
    [/生命|生物|医学|细胞|病毒/, '生命科学'],
    [/材料/, '材料'],
    [/医学|临床|健康/, '医学'],
    [/工程|航天|航空|机器人|设备/, '工程'],
    [/物理|量子|天文|空间|行星|宇宙/, '物理'],
    [/化学/, '化学'],
    [/信息|计算|AI|人工智能|数据/, '信息科学'],
    [/环境|地球|气候|遥感/, '环境科学'],
    [/综合|交叉|历史|社会|人文/, '综合交叉'],
  ],
  technicalMethod: [
    [/拍摄|摄影|摄像|航拍|采集/, '拍摄'],
    [/成像|显微|医学|遥感|热成像|CT|MRI|X光|超声/, '成像'],
    [/绘设|插画|图标|设计|排版|手绘|版面/, '绘设'],
    [/数据|图表|可视化|统计|地图|网络/, '数据'],
    [/渲染|3D|建模|仿真|工程|CAD|模型/, '渲染'],
    [/生成|AI|算法|风格迁移|GAN|扩散/, '生成'],
  ],
  functionalPurpose: [
    [/记录|纪实|存档|现场|记录仪/, '记录'],
    [/解释|说明|机制|原理|流程|教学/, '解释'],
    [/数据|统计|图表|结果|趋势|实验/, '数据'],
    [/展示|成果|产品|项目|形象|科技/, '展示'],
    [/传播|科普|品牌|宣传|封面|公众|媒体/, '传播'],
    [/交互|浏览|筛选|探索|仪表盘|缩放/, '交互'],
  ],
  distributionMedium: [
    [/静图|单图|静态|^$/, '静图'],
    [/动图|gif|循环|动效/, '动图'],
    [/视频|影片|录像/, '视频'],
    [/图组|多图|组合|版面|figure/, '图组'],
    [/交互|可操作|仪表盘|浏览器|探索/, '交互'],
    [/实体|印刷|海报|展板|包装|纸/, '实体'],
  ],
};

export function isKpiDimension(value: string): value is KpiDimension {
  return DIMENSIONS.has(value);
}

export function normalizeTaxonomyValue(dimension: KpiDimension, raw: string): string {
  const value = raw.trim();
  if (!value) return '不确定';
  const allowed = TAXONOMY[dimension] as readonly string[];
  if (allowed.includes(value)) return value;

  const parts = value.split(/[\/,，、|]/).map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    if (allowed.includes(part)) return part;
  }

  for (const [pattern, mapped] of ALIASES[dimension]) {
    if (pattern.test(value)) return mapped;
  }

  return '不确定';
}

export function getDefaultKpis(): Array<{
  dimension: KpiDimension;
  category: string;
  targetCount: number;
  priority: number;
}> {
  return [
    ...TAXONOMY.mediaType.map(category => ({
      dimension: 'mediaType' as const,
      category,
      targetCount: category === '不确定' ? 20 : 120,
      priority: category === '不确定' ? 10 : 80,
    })),
    ...TAXONOMY.contentType.map(category => ({
      dimension: 'contentType' as const,
      category,
      targetCount: category === '不确定' ? 20 : 100,
      priority: category === '不确定' ? 10 : 70,
    })),
    ...TAXONOMY.discipline.map(category => ({
      dimension: 'discipline' as const,
      category,
      targetCount: category === '不确定' ? 20 : 80,
      priority: category === '不确定' ? 10 : 60,
    })),
    ...TAXONOMY.technicalMethod.map(category => ({
      dimension: 'technicalMethod' as const,
      category,
      targetCount: 80,
      priority: 50,
    })),
    ...TAXONOMY.functionalPurpose.map(category => ({
      dimension: 'functionalPurpose' as const,
      category,
      targetCount: 80,
      priority: 40,
    })),
    ...TAXONOMY.distributionMedium.map(category => ({
      dimension: 'distributionMedium' as const,
      category,
      targetCount: 80,
      priority: 30,
    })),
  ];
}
