import { prisma } from '../prisma.js';

export type ImbalanceType =
  | '记录堆积型'
  | '视频依赖型'
  | '数据封闭型'
  | '展示宣传型'
  | '单一技术型'
  | '多维协同型';

export interface AxisDistribution {
  [key: string]: number;
}

export interface DisciplineConfig {
  discipline: string;
  totalCases: number;
  currentConfig: {
    functional: AxisDistribution;
    medium: AxisDistribution;
    technical: AxisDistribution;
  };
  imbalanceType: ImbalanceType;
  completenessScore: {
    functional: number;
    medium: number;
    technical: number;
    overall: number;
  };
  gaps: string[];
  recommendations: string[];
}

export const DISCIPLINES = ['生命科学', '材料', '医学', '工程', '物理', '化学', '信息科学', '环境科学', '综合交叉'] as const;

const FP_CATEGORIES = ['记录', '解释', '数据', '展示', '传播', '交互'];
const DM_CATEGORIES = ['静图', '动图', '视频', '图组', '交互', '实体'];
const TM_CATEGORIES = ['拍摄', '成像', '绘设', '数据', '渲染', '生成'];

export async function getDisciplineDistribution(discipline: string): Promise<{
  functional: Record<string, number>;
  medium: Record<string, number>;
  technical: Record<string, number>;
  total: number;
}> {
  const cases = await prisma.visualCase.findMany({
    where: {
      discipline,
      reviewStatus: { not: 'rejected' },
    },
    select: {
      functionalPurpose: true,
      distributionMedium: true,
      technicalMethod: true,
    },
  });

  const total = cases.length;
  const functional: Record<string, number> = {};
  const medium: Record<string, number> = {};
  const technical: Record<string, number> = {};

  for (const c of cases) {
    const fp = c.functionalPurpose || '(空)';
    functional[fp] = (functional[fp] || 0) + 1;
    const dm = c.distributionMedium || '(空)';
    medium[dm] = (medium[dm] || 0) + 1;
    const tm = c.technicalMethod || '不确定';
    technical[tm] = (technical[tm] || 0) + 1;
  }

  const toPercent = (obj: Record<string, number>): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = Math.round((v / total) * 1000) / 10;
    }
    return result;
  };

  return {
    functional: toPercent(functional),
    medium: toPercent(medium),
    technical: toPercent(technical),
    total,
  };
}

export function classifyImbalance(
  functional: Record<string, number>,
  medium: Record<string, number>,
  technical: Record<string, number>
): ImbalanceType {
  const fp_record = functional['记录'] || 0;
  const fp_outreach = functional['传播'] || 0;
  const fp_data = functional['数据'] || 0;
  const fp_explain = functional['解释'] || 0;
  const tm_photo = technical['拍摄'] || 0;
  const dm_video = medium['视频'] || 0;

  if (fp_record > 40 && tm_photo > 50 && fp_explain < 15) return '记录堆积型';
  if (fp_outreach > 60 && fp_data < 15 && fp_explain < 20) return '展示宣传型';
  const techEntries = Object.entries(technical).filter(([k]) => k !== '不确定' && k !== '(空)');
  const maxTech = techEntries.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0]);
  if (maxTech[1] > 50) return '单一技术型';
  if (fp_data > 40 && fp_outreach < 10) return '数据封闭型';
  if (dm_video > 40) return '视频依赖型';

  return '多维协同型';
}

export function computeCompleteness(
  functional: Record<string, number>,
  medium: Record<string, number>,
  technical: Record<string, number>
): { functional: number; medium: number; technical: number; overall: number } {
  const fpCovered = FP_CATEGORIES.filter(c => (functional[c] || 0) > 5).length;
  const functionalScore = Math.round((fpCovered / 6) * 100);

  const dmCovered = DM_CATEGORIES.filter(c => (medium[c] || 0) > 3).length;
  const mediumScore = Math.round((dmCovered / 6) * 100);

  const tmCovered = TM_CATEGORIES.filter(c => (technical[c] || 0) > 3).length;
  const technicalScore = Math.round((tmCovered / 6) * 100);

  const overall = Math.round(functionalScore * 0.4 + mediumScore * 0.3 + technicalScore * 0.3);

  return { functional: functionalScore, medium: mediumScore, technical: technicalScore, overall };
}

export function identifyGaps(
  functional: Record<string, number>,
  medium: Record<string, number>,
  technical: Record<string, number>
): { gaps: string[]; recommendations: string[] } {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if ((functional['交互'] || 0) < 2) {
    gaps.push('功能—交互（几乎无交互式可视化）');
    recommendations.push('增加数据仪表盘、可交互地图、3D模型查看器');
  }
  if ((functional['展示'] || 0) < 5) {
    gaps.push('功能—展示（成果展示不足）');
    recommendations.push('增加产品/成果实拍图、项目主视觉图');
  }
  if ((functional['解释'] || 0) < 15) {
    gaps.push('功能—解释（机制解释不足）');
    recommendations.push('增加系统架构图、工作原理图、流程步骤图');
  }
  if ((functional['数据'] || 0) < 10) {
    gaps.push('功能—数据（数据展示不足）');
    recommendations.push('增加性能对比图、趋势曲线、实验数据图');
  }

  if ((medium['图组'] || 0) < 10) {
    gaps.push('媒介—图组（多图组合不足10%）');
    recommendations.push('增加步骤对比图、论文多子图、信息长图');
  }
  if ((medium['视频'] || 0) < 3) {
    gaps.push('媒介—视频（视频内容不足3%）');
    recommendations.push('增加实验过程视频、演示动画、讲解视频');
  }
  if ((medium['动图'] || 0) < 1) {
    gaps.push('媒介—动图（GIF/循环动效几乎为0）');
    recommendations.push('增加局部功能演示GIF、循环过程动画');
  }

  if ((technical['成像'] || 0) < 3) {
    gaps.push('技术—成像（专业成像技术不足3%）');
    recommendations.push('增加显微成像、医学影像、遥感成像');
  }
  if ((technical['数据'] || 0) < 5) {
    gaps.push('技术—数据可视化（数据可视化不足5%）');
    recommendations.push('增加统计图表、数据地图、科学数据可视化');
  }
  if ((technical['渲染'] || 0) < 10) {
    gaps.push('技术—3D渲染（三维渲染不足10%）');
    recommendations.push('增加3D产品渲染、结构剖视图、仿真动画');
  }
  if ((technical['生成'] || 0) < 1) {
    gaps.push('技术—AI生成（几乎无AI生成内容）');
    recommendations.push('探索AI辅助生成概念图、算法增强数据图');
  }

  return { gaps, recommendations };
}

function fillDefaults(dist: Record<string, number>, categories: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const c of categories) {
    result[c] = dist[c] || 0;
  }
  return result;
}

export async function getDisciplineConfig(discipline: string): Promise<DisciplineConfig> {
  const { functional, medium, technical, total } = await getDisciplineDistribution(discipline);

  const imbalanceType = classifyImbalance(functional, medium, technical);
  const completenessScore = computeCompleteness(functional, medium, technical);
  const { gaps, recommendations } = identifyGaps(functional, medium, technical);

  return {
    discipline,
    totalCases: total,
    currentConfig: {
      functional: fillDefaults(functional, FP_CATEGORIES),
      medium: fillDefaults(medium, DM_CATEGORIES),
      technical: fillDefaults(technical, TM_CATEGORIES),
    },
    imbalanceType,
    completenessScore,
    gaps,
    recommendations,
  };
}

export async function getAllDisciplineConfigs(): Promise<DisciplineConfig[]> {
  const results: DisciplineConfig[] = [];
  for (const d of DISCIPLINES) {
    results.push(await getDisciplineConfig(d));
  }
  return results;
}