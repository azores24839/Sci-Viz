# 双人分工执行计划

> **适用人员：** 项目负责人（A） + 新加入同事（B）
> **目标：** 将当前项目拆分为两条独立工作线，减少代码/数据冲突，各自可并行推进
> **基础上下文：** 阅读 `docs/superpowers/harness/2026-06-02-execution-harness.md`（项目结构、状态、API参考）

---

## 一、分工总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sci-Viz Case Hub                          │
│                                                                  │
│  👤 Person A (负责人)              👤 Person B (新同事)           │
│  ─────────────────────            ─────────────────────          │
│  分析层 + 方法论 + 报告            数据采集层（新渠道）             │
│                                                                  │
│  修改的文件:                       新建的文件:                     │
│  ├── routes/insights.ts           ├── wechatSources.ts            │
│  ├── ComparisonPage.tsx           ├── wechatAdapter.ts            │
│  ├── InsightsPage.tsx             ├── wechatCrawler.ts            │
│  ├── taxonomy.ts                  ├── WechatPoolPage.tsx          │
│  └── AnalysisReportPage.tsx       ├── VideoCasePage.tsx           │
│                                   └── App.tsx (仅加路由)           │
│                                                                  │
│  ⚠ 互不重叠，可并行推进                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、Person A 任务线：分析+方法论+报告

**核心职责：** 编码本审定、数据分析、报告撰写、企业基准补完

### A.1 三轴分类人工抽检

**目标：** 验证现有3404条案例中 `functionalPurpose`/`distributionMedium`/`mediaSubType` 标注合理性

- [ ] 从数据库随机抽取 30 条案例（覆盖6个学科 × 5条/学科）
- [ ] 逐条人工查看图片，对照三轴定义判断标注是否准确
- [ ] 记录偏差率和偏差模式（哪些轴容易标错？AI的系统性偏见是什么？）
- [ ] 输出抽检报告（偏差率 + 修正建议 + 编码本改进点）

**SQL 抽样参考：**
```sql
-- 按学科分层抽样，每学科取5条
SELECT id, title, sourceDomain, discipline, functionalPurpose, distributionMedium, mediaSubType, contentSubType, imageUrl
FROM VisualCase
WHERE reviewStatus = 'approved' AND discipline = '生命科学'
ORDER BY RANDOM() LIMIT 5;
```

### A.2 三轴频谱可视化 (D-cross 2)

**目标：** `functionalPurpose × distributionMedium × mediaType` 三维交叉分析与可视化

- [ ] 在 `routes/insights.ts` 中新增 GET `/api/insights/three-axis-spectrum` 端点
- [ ] 返回三维交叉矩阵数据：`{ functionalPurpose, distributionMedium, mediaType, count }`
- [ ] 前端 `/insights` 页新增"三轴频谱"Tab，用热力图/桑基图/平行坐标展示
- [ ] 需要搜索 npm 可用的轻量可视化库（参考建议：recharts 或直接用 ECharts）

**API 返回格式：**
```json
{
  "success": true,
  "data": {
    "dimensions": ["functionalPurpose", "distributionMedium", "mediaType"],
    "cells": [
      { "functionalPurpose": "解释", "distributionMedium": "静图", "mediaType": "3D渲染", "count": 423 },
      { "functionalPurpose": "传播", "distributionMedium": "视频", "mediaType": "摄影", "count": 12 },
      ...
    ],
    "matrix": { "rows": [...], "columns": [...], "data": [[...]] }
  }
}
```

### A.3 对比分析报告 (E)

**目标：** 基于现有 `/api/insights/comparison` 数据，撰写跨机构视觉呈现差异报告

- [ ] 报告结构草案：

```
1. 概述与研究方法
2. 四组来源的整体媒介分布对比（交大 vs 国内 vs 国际 vs 企业）
3. 按学科交叉对比（同一学科下不同机构的媒介选择差异）
4. 功能用途对比（记录/解释/数据/展示/传播，各机构重心在哪？）
5. 企业商业化视觉信号的定性分析
6. 交大的媒介缺口与改进建议
7. 附录：数据表与方法论说明
```

- [ ] 新建 `/report` 前端页面 (`AnalysisReportPage.tsx`)：
  - 含章节导航的滚动长页面
  - 复用 InsightsPage 的分布图和交叉矩阵组件
  - 支持"导出为 PDF" 按钮（浏览器 `window.print()` 或 jsPDF）
  - 支持"导出数据为 CSV"按钮

- [ ] 在 `App.tsx` 中注册路由 `/report`

### A.4 企业商业化视觉基准补完 (C1)

**目标：** 将 Autodesk/Microsoft/Arm/Caterpillar 的 browser_render 入口跑通，完成企业基准

- [ ] 检查当前 enterprise approved 数量：27 条
- [ ] 对标记为 `needs_adapter_tuning` 的企业源逐一诊断：
  - `Autodesk Customer Stories` → 可能需要 Playwright browser_render
  - `Caterpillar Customer Stories` → 同上
  - `Microsoft AI Customer Stories` → 同上
  - `Arm Success Library` → 同上
- [ ] 新建或修改 `server/src/crawler/` 下的 Playwright 适配器（不影响静态适配器）
- [ ] 目标：企业 approved 达到 50+ 条

### A.5 编码本补齐

**目标：** 在三轴（functionalPurpose/distributionMedium/mediaType）之外，补充剩余7个视觉编码维度

以下维度对应原始方案（`视觉调研流程_人机分工.md` 阶段0）中定义的内容：

| 维度 | 选项建议 | 来源字段 |
|------|----------|----------|
| 构图类型 | 中心式/三分法/对角线/散点/对称/框架式 | 当前 composition 字段 |
| 景别选择 | 特写/近景/中景/全景/微距 | 新字段或 contentSubType 扩展 |
| 用光风格 | 顺光/侧光/逆光/柔光/硬光/混合光 | 新字段 |
| 色调特征 | 冷调/暖调/中性/高对比/低对比 | 当前 colorTone 字段 |
| 色彩方案 | 单色/互补/类似/三色/黑白 | 新字段或 colorTone 细化 |
| 视觉焦点 | 中心聚焦/边缘引导/多点分散/无焦点 | 新字段 |
| 信息层级 | 单层/双层/多层/无明确层级 | 新字段 |
| 后期风格 | 原片/轻度调整/重度后期/CG合成 | 新字段 |
| 情感基调 | 严肃/亲切/震撼/好奇/温暖/冷静 | 新字段 |

- [ ] 在 `taxonomy.ts` 中补充上述维度定义
- [ ] 暂不要求 AI 批量编码（那是阶段2的事），先定义清楚每个选项的边界
- [ ] 每个选项从已有案例中找 1-2 张参考图

---

## 三、Person B 任务线：公众号+视频采集

**核心职责：** 建立公众号来源池、开发采集适配器、收集视频/多媒体案例

### B.1 了解项目结构与启动环境

**第一步：** 先通读以下文件，理解项目模式

| 文件 | 了解什么 |
|------|----------|
| `docs/superpowers/harness/2026-06-02-execution-harness.md` | 项目全貌、API、启动方式 |
| `server/src/crawler/staticSourceAdapters.ts` | 爬虫适配器的接口模式（`StaticSourceAdapter`） |
| `server/src/crawler/enterpriseSources.ts` | 企业来源的配置方式 |
| `server/src/services/taxonomy.ts` | 分类词典（能理解采集到的数据怎么分类） |
| `server/prisma/schema.prisma` | 数据库 Schema（知道数据存哪） |
| `server/src/routes/insights.ts` | COMPARISON_GROUPS 结构 |

**启动开发环境：**
```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub
npm run dev
# 前端 http://localhost:5173
# 后端 http://localhost:3001
# 类型检查：cd web && npx tsc --noEmit && cd ../server && npx tsc --noEmit
```

### B.2 建立公众号学术源清单

**目标：** 按学科梳理 30-50 个有科研视觉价值的微信公众号

**方法：**
1. 在微信中搜索各学科关键词（"科研"、"实验室"、"期刊"），记录公众号名称和ID
2. 通过搜狗微信搜索 (weixin.sogou.com) 确认公众号是否可被检索到
3. 记录每个公众号的：学科、名称、微信号、类型（课题组/期刊/机构/媒体）、视觉价值评估

**输出物：** 新建 `docs/wechat-accounts-by-discipline.md`

```
| 学科 | 公众号名称 | 微信号 | 类型 | 主要内容 | 图片质量 | 视频数量 |
|------|-----------|--------|------|----------|----------|----------|
| 生命科学 | Nature Portfolio | ... | 期刊 | 论文封面+配图 | 高 | 少 |
| 物理 | 中科院物理所 | ... | 机构 | 实验图+科普 | 中 | 中 |
| ... | ... | ... | ... | ... | ... | ... |
```

### B.3 实现公众号爬虫适配器

**目标：** 在 `server/src/crawler/` 下新建独立文件，不影响现有爬虫

**技术路线：** 搜狗微信搜索 + 公众号文章直链采集

#### 文件 1: `server/src/crawler/wechatSources.ts`

定义公众号来源配置：

```typescript
export interface WechatSourceConfig {
  discipline: string;
  accountName: string;        // 公众号名称
  wechatId: string;           // 微信号
  accountType: 'journal' | 'institution' | 'lab' | 'media' | 'enterprise';
  sogouSearchKeyword: string; // 搜狗搜索关键词
  visualValue: string;
  priority: number;           // 1-5
}

export const WECHAT_SOURCES: WechatSourceConfig[] = [
  {
    discipline: '生命科学',
    accountName: 'Nature Portfolio',
    wechatId: 'nature-portfolio',
    accountType: 'journal',
    sogouSearchKeyword: 'Nature Portfolio',
    visualValue: '顶刊封面、论文配图、科学可视化',
    priority: 5,
  },
  // ... 更多
];
```

#### 文件 2: `server/src/crawler/wechatAdapter.ts`

实现搜狗微信搜索的采集逻辑：

```typescript
// 核心流程：
// 1. 用关键词搜索搜狗微信 → 获取公众号文章列表
// 2. 解析每篇文章的URL
// 3. 提取文章中的图片/视频
// 4. 过滤、评分、入库

export async function discoverWechatArticles(source: WechatSourceConfig): Promise<string[]> {
  // 搜狗微信搜索 URL: https://weixin.sogou.com/weixin?type=2&query=<关键词>
  // 注意事项：搜狗反爬严重，需：
  //   - 设置合理的 User-Agent
  //   - 添加请求间隔（3-5秒/请求）
  //   - 考虑使用 cookie
  //   - 备用方案：浏览器插件手动采集
}

export async function extractWechatArticleImages(articleUrl: string): Promise<ImageCandidate[]> {
  // 公众号文章页面结构：
  //   - 内容在 #js_content 或 .rich_media_content 中
  //   - 图片通常有 data-src 属性（懒加载）
  //   - 视频嵌入在 iframe 中（来自 mp.weixin.qq.com）
  //   - 注意：图片可能被防盗链保护
}
```

#### 文件 3: `server/src/crawler/wechatCrawler.ts`

采集任务调度器：

```typescript
export async function runWechatCrawl(options?: {
  sourceIds?: number[];
  dryRun?: boolean;
  maxArticlesPerSource?: number;
}): Promise<CrawlResult> {
  // 遍历 WECHAT_SOURCES
  // 对每个来源 -> 发现文章链接 -> 提取图片/视频 -> 评分 -> 入库
}
```

### B.4 视频/Multimedia 案例专项采集

**目标：** 构建视频/动图/交互类科研视觉案例库

**策略：** 从两条路同时收集

#### 路线1：从已有数据库筛选

```sql
-- 检查已入库的动图/视频/图组/交互/实体类案例
SELECT distributionMedium, COUNT(*) as cnt,
       GROUP_CONCAT(DISTINCT sourceDomain) as sources
FROM VisualCase
WHERE reviewStatus = 'approved'
  AND distributionMedium IN ('动图', '视频', '图组', '交互', '实体')
GROUP BY distributionMedium;
```

#### 路线2：从公众号和视频平台采集

| 平台 | 内容类型 | 采集方式 |
|------|----------|----------|
| 微信公众号 | 正文嵌入视频 | wechatAdapter 提取 |
| B站/视频号 | 科研科普视频 | 暂定手工采集或B站API |
| 机构官网 | 视频新闻/实验室vlog | 扩展现有 adapter |

#### 前端：视频案例展示

- [ ] 新建 `web/src/pages/VideoCasePage.tsx`（从 CaseList 派生）
- [ ] 筛选 `distributionMedium = '视频'` 的案例
- [ ] 支持视频预览（iframe 嵌入或 video 标签）
- [ ] 按学科/来源/功能用途筛选

### B.5 批量为公众号来源 Seed 入库

**目标：** 将 WECHAT_SOURCES 写入 CrawlSource 表，使其出现在 PoolPage 中

- [ ] 编写 seed 脚本 `server/src/scripts/seedWechatSources.ts`
- [ ] 每个公众号来源使用 `category = 'WECHAT'`（区别于现有 'SJTU'/'DOM'/'ENT'）
- [ ] 添加到 package.json 的 scripts：`"db:seed:wechat-sources": "..."`
- [ ] 在 COMPARISON_GROUPS 中新增 `wechat` 组（如果需要对比页展示）

**Seed 数据结构参考 CrawlSource 模型：**
```typescript
{
  name: 'Nature Portfolio（公众号）',
  url: 'https://mp.weixin.qq.com/s/...',  // 代表文章URL
  category: 'WECHAT',
  sourceType: 'wechat_public_account',
  adapterType: 'wechat',
  crawlStatus: 'active_static',  // 或 'active_pw' if browser needed
  crawlTier: 'B',
  visualValue: '顶刊封面、论文配图',
  strategyHint: '通过搜狗微信搜索发现文章，提取图片和视频',
  enabled: true,
  notes: 'discipline=生命科学; accountType=journal;',
}
```

---

## 四、协作规则与冲突避免

### 文件所有权矩阵

| 文件/目录 | 所有者 | 规则 |
|-----------|--------|------|
| `server/src/crawler/staticSourceAdapters.ts` | Person A | B 不修改 |
| `server/src/crawler/enterpriseSources.ts` | Person A | B 不修改 |
| `server/src/crawler/wechatAdapter.ts` | Person B | A 不修改 |
| `server/src/crawler/wechatSources.ts` | Person B | A 不修改 |
| `server/src/crawler/wechatCrawler.ts` | Person B | A 不修改 |
| `server/src/services/taxonomy.ts` | Person A | B 可读，不修改 |
| `server/src/routes/insights.ts` | Person A | B 不修改 |
| `server/prisma/schema.prisma` | Person A | B 不修改（数据库字段已够用） |
| `web/src/pages/ComparisonPage.tsx` | Person A | B 不修改 |
| `web/src/pages/InsightsPage.tsx` | Person A | B 不修改 |
| `web/src/pages/VideoCasePage.tsx` | Person B | A 不修改 |
| `web/src/pages/WechatPoolPage.tsx` | Person B | A 不修改 |
| `web/src/App.tsx` | Person A（加路由时） | B 新增页面后告知 A，A 统一注册路由 |

### 数据库规则

- **写入冲突**：Person B 的公众号爬虫写入 VisualCase 表，Person A 做分析查询只读。写入用 `INSERT OR IGNORE`，不做 UPDATE 或 DELETE。
- **Schema 变更**：如果需要新字段（如 `videoUrl`），由 Person A 统一修改 `schema.prisma` 并 `prisma db push`，告知 B 后 B 再用。
- **审计追踪**：公众号来源的案例用 `sourceDomain = 'mp.weixin.qq.com'`，`notes` 字段记录公众号名称，方便后续区分。

### 分支策略（可选，推荐）

```bash
# Person B 的工作分支
git checkout -b feat/wechat-video-collection
# Person A 继续在 main（或自己的分支）工作
```

### 沟通节点

| 时机 | 事项 |
|------|------|
| B 完成第一步环境搭建 | A 确认项目能正常启动 |
| B 完成公众号清单 | A 审阅清单，补充遗漏 |
| B 写出第一版 wechatAdapter | A 帮忙测试是否能跑通 |
| B 新增前端页面 | A 帮忙在 App.tsx 注册路由 |
| A 修改 taxonomy.ts | 通知 B 核对新定义是否影响数据分类 |
| 每周一次 | 同步进度，看是否有阻塞 |

---

## 五、假设验证框架（两人共用）

### 核心假设
> 科研成果展示通过视频媒介是趋势，但平面媒介仍有不可替代的存在价值

### 验证所需的证据链

```
┌──────────────────────────────────────────────────────────────────┐
│  验证维度 1：媒介类型分布对比                                      │
│  👤 Person A 负责                                                │
│  ├── 交大 vs 国际 vs 企业：视频/动图/静图的占比                   │
│  ├── 按学科细分：哪些学科更倾向于视频？                            │
│  └── 功能用途 × 媒介：解释用静图？传播用视频？记录用摄影？          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  验证维度 2：视频/多媒体案例补充                                   │
│  👤 Person B 负责                                                │
│  ├── 从公众号收集视频案例                                          │
│  ├── 标记 distributionMedium = '视频'/'动图'/'交互' 的案例         │
│  └── 建立视频案例子库（目标100+条）                                 │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  验证维度 3：企业商业化基准（混合媒介）                              │
│  👤 Person A 负责                                                │
│  ├── 企业案例中交互式展示的占比                                    │
│  ├── 企业案例中视频/动图的使用方式（产品demo vs 技术动画 vs 访谈）  │
│  └── 总结商业场景下的媒介组合策略                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  验证维度 4：时间趋势（如果有数据）                                 │
│  👤 Person A 负责                                                │
│  ├── Nature 封面1830张的历史媒介变迁                               │
│  └── 如果公众号数据有时间戳，分析近2年的媒介趋势                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 六、最终输出物清单

| 交付物 | 负责人 | 形式 | 优先级 |
|--------|--------|------|--------|
| 三轴抽检报告 | A | Markdown | P0 |
| 三轴频谱可视化 | A | Web页面 (/insights 新Tab) | P0 |
| 对比分析报告 | A | Web页面 (/report) + 导出PDF | P0 |
| 企业商业化基准补完 | A | 数据 + 报告章节 | P1 |
| 编码本v1.0（10维） | A | `taxonomy.ts` 扩展 + 参考图 | P1 |
| 公众号源清单 | B | `docs/wechat-accounts-by-discipline.md` | P0 |
| 公众号爬虫适配器 | B | `wechatAdapter.ts` + `wechatCrawler.ts` | P0 |
| 公众号种子数据 | B | 数据库 CrawlSource + VisualCase | P1 |
| 视频案例页 | B | `/videos` 前端页面 | P1 |
| 最终策略报告 | A+B | PPT + PDF + Web报告 | P2 |

---

## 七、B 的技术启动 Checklist

- [ ] 阅读 `docs/superpowers/harness/2026-06-02-execution-harness.md`
- [ ] Clone 项目（如果有独立账号）或拉取最新代码
- [ ] `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub && npm run install:all`
- [ ] 启动 `npm run dev`，确认前端（5173）和后端（3001）都能访问
- [ ] 浏览 `/cases` `/insights` `/comparison` `/pool` 页面，理解现有功能
- [ ] 在 `/pool` 页面查看现有 CrawlSource 的数据结构
- [ ] 阅读 `staticSourceAdapters.ts` 的 `StaticSourceAdapter` 接口
- [ ] 阅读 `enterpriseSources.ts` 的 `EnterpriseSourceConfig` 接口
- [ ] 新建 `feat/wechat-video-collection` 分支
- [ ] 开始 B.2：梳理公众号清单
