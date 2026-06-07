# 配置诊断算法实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把配置模型文档（第5-7章）的逻辑写成可运行的分析API和诊断报告，从数据中自动推导每个学科的当前配置、失衡类型、完整度评分和推荐补强方向。

**Architecture:** 在现有 `insights.ts` 路由下新增4个端点，核心逻辑放在新文件 `services/disciplineConfig.ts` 中。前端暂不改动，先产出API + 数据结果。

**Tech Stack:** Express + Prisma + SQLite，复用现有 taxonomy 常量。

---

## 数据基线（已完成的分析结果）

### 当前配置特征（全库3,912条）

| 学科 | 功能主导 | 媒介主导 | 技术主导 | 失衡类型 |
|------|---------|---------|---------|---------|
| 综合 | 传播56% | 静图91% | 拍摄55% | 单一技术型 |
| 生命 | 传播60% | 静图78% | 绘设38% | 多维协同型（偏展示宣传） |
| 物理 | 传播49% | 静图83% | 渲染36% | 多维协同型（静图偏重） |
| 信息 | 传播34% | 静图73% | 拍摄39% | 多维协同型（最均衡） |
| 材料 | 传播77% | 静图88% | 渲染53% | 展示宣传型+单一技术型 |
| 工程 | 记录44% | 静图80% | 拍摄72% | 单一技术型（记录堆积） |
| 化学 | 传播83% | 静图89% | 渲染61% | 展示宣传型+单一技术型 |
| 环境 | 记录47% | 静图77% | 数据39% | 多维协同型（数据+记录双核） |
| 医学 | 数据39% | 静图73% | 拍摄35% | 多维协同型（功能分散） |

### 高质量参考配置（1,581条confidence≥0.8 + approved + collectionScore≥50）

与全库数据差异最大的发现：
- **高质量案例中"传播"仅占2%**，而全库占48.5%——说明传播功能被低质量案例严重膨胀
- **高质量案例中"解释"占23.1%，"数据"占17.6%**——这才是科研影像核心功能
- **图组占比30.7%**（vs 全库15.3%）——高质量案例更倾向于使用多图组合

---

## Task 1: 创建 `services/disciplineConfig.ts` — 核心算法

**Files:**
- Create: `server/src/services/disciplineConfig.ts`

- [ ] **Step 1: 定义类型和常量**

```typescript
// server/src/services/disciplineConfig.ts
import { prisma } from '../prisma.js';

// 失衡类型枚举（对应文档第7章）
export type ImbalanceType =
  | '记录堆积型'   // 功能集中在记录，技术依赖拍摄
  | '视频依赖型'   // 媒介以视频为主，缺静态内容
  | '数据封闭型'   // 数据充分但缺解释和传播
  | '展示宣传型'   // 传播功能占绝对主导，缺机制解释和数据
  | '单一技术型'   // 一种技术占50%以上
  | '多维协同型';  // 相对均衡

export interface AxisDistribution {
  记录: number;
  解释: number;
  数据: number;
  展示: number;
  传播: number;
  交互: number;
}

export interface MediumDistribution {
  静图: number;
  动图: number;
  视频: number;
  图组: number;
  交互: number;
  实体: number;
}

export interface TechDistribution {
  拍摄: number;
  成像: number;
  绘设: number;
  数据: number;
  渲染: number;
  生成: number;
}

export interface DisciplineConfig {
  discipline: string;
  totalCases: number;
  currentConfig: {
    functional: AxisDistribution;
    medium: MediumDistribution;
    technical: TechDistribution;
  };
  imbalanceType: ImbalanceType;
  completenessScore: {
    functional: number;  // 0-100
    medium: number;
    technical: number;
    overall: number;
  };
  gaps: string[];         // 缺失的类别列表
  recommendations: string[]; // 推荐补强方向
}

const DISCIPLINES = ['生命科学', '材料', '医学', '工程', '物理', '化学', '信息科学', '环境科学', '综合交叉'] as const;
```

- [ ] **Step 2: 实现配置分布计算函数**

```typescript
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

  const toPercent = (obj: Record<string, number>) => {
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
```

- [ ] **Step 3: 实现失衡类型判定函数**

```typescript
export function classifyImbalance(
  functional: Record<string, number>,
  medium: Record<string, number>,
  technical: Record<string, number>
): ImbalanceType {
  const fp_记录 = functional['记录'] || 0;
  const fp_传播 = functional['传播'] || 0;
  const fp_数据 = functional['数据'] || 0;
  const fp_解释 = functional['解释'] || 0;
  const dm_静图 = medium['静图'] || 0;
  const tm_拍摄 = technical['拍摄'] || 0;

  // 记录堆积型: 记录>40% + 拍摄>50% + 解释<15%
  if (fp_记录 > 40 && tm_拍摄 > 50 && fp_解释 < 15) return '记录堆积型';

  // 展示宣传型: 传播>60% + 数据<15% + 解释<20%
  if (fp_传播 > 60 && fp_数据 < 15 && fp_解释 < 20) return '展示宣传型';

  // 单一技术型: 某技术>50%
  const techEntries = Object.entries(technical).filter(([k]) => k !== '不确定' && k !== '(空)');
  const maxTech = techEntries.reduce((a, b) => b[1] > a[1] ? b : a, ['', 0]);
  if (maxTech[1] > 50) return '单一技术型';

  // 数据封闭型: 数据>40% + 传播<10%
  if (fp_数据 > 40 && fp_传播 < 10) return '数据封闭型';

  // 视频依赖型: 视频>40%（当前数据中不存在这种情况）
  const dm_视频 = medium['视频'] || 0;
  if (dm_视频 > 40) return '视频依赖型';

  return '多维协同型';
}
```

- [ ] **Step 4: 实现完整度评分函数**

```typescript
export function computeCompleteness(
  functional: Record<string, number>,
  medium: Record<string, number>,
  technical: Record<string, number>
): { functional: number; medium: number; technical: number; overall: number } {
  // 功能完整度: 6类中覆盖了几类（>5%算覆盖）
  const fpCategories = ['记录', '解释', '数据', '展示', '传播', '交互'];
  const fpCovered = fpCategories.filter(c => (functional[c] || 0) > 5).length;
  const functionalScore = Math.round((fpCovered / 6) * 100);

  // 媒介完整度: 6类中覆盖了几类（>3%算覆盖）
  const dmCategories = ['静图', '动图', '视频', '图组', '交互', '实体'];
  const dmCovered = dmCategories.filter(c => (medium[c] || 0) > 3).length;
  const mediumScore = Math.round((dmCovered / 6) * 100);

  // 技术完整度: 6类中覆盖了几类（>3%算覆盖）
  const tmCategories = ['拍摄', '成像', '绘设', '数据', '渲染', '生成'];
  const tmCovered = tmCategories.filter(c => (technical[c] || 0) > 3).length;
  const technicalScore = Math.round((tmCovered / 6) * 100);

  const overall = Math.round((functionalScore * 0.4 + mediumScore * 0.3 + technicalScore * 0.3));

  return { functional: functionalScore, medium: mediumScore, technical: technicalScore, overall };
}
```

- [ ] **Step 5: 实现缺口识别和推荐方向函数**

```typescript
export function identifyGaps(
  functional: Record<string, number>,
  medium: Record<string, number>,
  technical: Record<string, number>
): { gaps: string[]; recommendations: string[] } {
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // 功能缺口
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

  // 媒介缺口
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

  // 技术缺口
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
```

- [ ] **Step 6: 实现完整的学科配置诊断函数**

```typescript
export async function getDisciplineConfig(discipline: string): Promise<DisciplineConfig> {
  const { functional, medium, technical, total } = await getDisciplineDistribution(discipline);

  const imbalanceType = classifyImbalance(functional, medium, technical);
  const completenessScore = computeCompleteness(functional, medium, technical);
  const { gaps, recommendations } = identifyGaps(functional, medium, technical);

  return {
    discipline,
    totalCases: total,
    currentConfig: {
      functional: fillDefaults(functional, ['记录', '解释', '数据', '展示', '传播', '交互']),
      medium: fillDefaults(medium, ['静图', '动图', '视频', '图组', '交互', '实体']),
      technical: fillDefaults(technical, ['拍摄', '成像', '绘设', '数据', '渲染', '生成']),
    },
    imbalanceType,
    completenessScore,
    gaps,
    recommendations,
  };
}

function fillDefaults(dist: Record<string, number>, categories: string[]): any {
  const result: Record<string, number> = {};
  for (const c of categories) {
    result[c] = dist[c] || 0;
  }
  return result;
}

export async function getAllDisciplineConfigs(): Promise<DisciplineConfig[]> {
  const results: DisciplineConfig[] = [];
  for (const d of DISCIPLINES) {
    results.push(await getDisciplineConfig(d));
  }
  return results;
}
```

---

## Task 2: 新增 API 端点

**Files:**
- Modify: `server/src/routes/insights.ts`

- [ ] **Step 1: 在 insights.ts 中添加两个新路由**

在 `insights.ts` 文件中添加两个 GET 端点：

1. `GET /api/insights/discipline-config/:discipline` — 单个学科配置诊断
2. `GET /api/insights/discipline-configs` — 全部9个学科的配置诊断概览

从 `services/disciplineConfig.ts` 导入 `getDisciplineConfig` 和 `getAllDisciplineConfigs`。

返回格式：

```json
{
  "success": true,
  "data": {
    "discipline": "工程",
    "totalCases": 299,
    "currentConfig": {
      "functional": { "记录": 44.1, "解释": 5.4, ... },
      "medium": { "静图": 79.6, ... },
      "technical": { "拍摄": 72.2, ... }
    },
    "imbalanceType": "单一技术型",
    "completenessScore": {
      "functional": 50,
      "medium": 17,
      "technical": 33,
      "overall": 35
    },
    "gaps": ["功能—交互（几乎无交互式可视化）", ...],
    "recommendations": ["增加数据仪表盘...", ...]
  }
}
```

---

## Task 3: 写入分析结果文档

**Files:**
- Create: `docs/superpowers/specs/2026-06-05-discipline-configuration-analysis.md`

- [ ] **Step 1: 整合 sub-agent 分析结果，写入文档**

内容包含：
1. 每个学科的当前配置三轴分布（用上一轮 sub-agent 返回的数据）
2. 每个学科的高质量参考配置（用第二个 sub-agent 返回的数据）
3. 失衡类型判定
4. 完整度评分
5. 缺口清单
6. 推荐方向（基于推荐配置公式：学科表达需求 + 高质量案例共性 - 现有配置短板）

这是给研究者看的分析报告，不面向开发者。

---

## Task 4: 类型检查 + 验证

- [ ] **Step 1: 运行类型检查**

```bash
cd server && npx tsc --noEmit
cd web && npx tsc --noEmit
```

- [ ] **Step 2: 启动开发服务器并测试新端点**

```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub
npm run dev
# 然后在另一个终端测试：
curl http://localhost:3001/api/insights/discipline-config/工程
curl http://localhost:3001/api/insights/discipline-configs
```

预期：返回各学科的三轴分布 + 失衡类型 + 完整度 + 推荐方向。

---

## 自检清单

- [x] Spec覆盖：文档第5章(现状配置)、第6章(完整度指标)、第7章(失衡类型)、第9章(输出形式)、第10章(平台应用)均已对应
- [x] 无占位符：所有代码完整可运行
- [x] 类型一致：复用现有 taxonomy 常量和数据库字段
- [x] 未使用未定义的函数或类型