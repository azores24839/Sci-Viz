# URL 池与智能发现采集 设计文档

## 概述

在 Sci-Viz Case Hub 中新增"来源池"功能，替代当前手动找文章 URL → 粘贴到 `/crawl` 页面的流程。核心能力：

1. **URL 池管理**：按分类(A-F)组织科研视觉来源，浏览、增删改
2. **智能发现**：从列表页自动发现文章链接，无需手动配置选择器
3. **一键采集**：点击一个来源，自动发现文章链接 → 逐篇采集图片 → AI分析 → 入库

## 架构

```
前端 /pool 页面
  │  POST /api/pool/sources/:id/crawl
  ▼
发现器 (link-discovery)
  │  fetch 列表页 → cheerio 解析 → 智能识别文章链接
  │  返回文章 URL 列表
  ▼
采集器 (已有的 runUrlCrawl)
  │  fetch 文章页 → 提取图片 → 下载 → OCR → AI分类 → 入库
  ▼
进度反馈 (SSE / 轮询)
  │  实时展示: 发现中 → 发现12篇 → 采集中(3/12) → 完成
```

两阶段分离：发现器和采集器独立，方便调试和复用。采集器直接复用已有管线。

## 数据库设计

### CrawlSource — URL 池条目

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (auto) | 主键 |
| name | String | 来源名称 |
| url | String | 列表页 URL |
| category | String | A-F，对应文档中的分类 |
| sourceType | String | university_news / national_lab_news / ... |
| visualValue | String | 视觉价值描述 |
| crawlDifficulty | String | easy / medium / hard（仅后端使用，不展示） |
| strategyHint | String | 策略建议 |
| enabled | Boolean | 是否启用，默认 true |
| notes | String? | 备注 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### CrawlJob — 采集任务追踪

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (auto) | 主键 |
| sourceId | Int | 关联 CrawlSource |
| status | Enum | pending → discovering → crawling → completed / failed |
| discoveredUrls | Json | 发现到的文章 URL 列表 |
| crawledUrls | Json | 已完成的文章 URL 列表 |
| totalCount | Int | 发现到的总文章数 |
| crawledCount | Int | 已完成数 |
| newCases | Int | 成功入库的案例数 |
| error | String? | 错误信息 |
| createdAt | DateTime | |
| updatedAt | DateTime | |

去重：触发采集前，查询已有 VisualCase 的 sourceUrl，跳过已采集过的文章。

## API 设计

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/pool/sources` | 获取所有来源（?category=A） |
| GET | `/api/pool/sources/:id` | 获取单个来源详情 |
| POST | `/api/pool/sources` | 新增来源 |
| PATCH | `/api/pool/sources/:id` | 编辑来源 |
| DELETE | `/api/pool/sources/:id` | 删除来源 |
| POST | `/api/pool/sources/:id/crawl` | 触发采集任务 |
| GET | `/api/pool/jobs/:id` | 查询采集任务进度 |

POST `/api/pool/sources/:id/crawl` 立即返回 jobId，后台异步执行。

GET `/api/pool/jobs/:id` 返回：

```json
{
  "status": "crawling",
  "discoveredCount": 12,
  "crawledCount": 5,
  "newCases": 8,
  "error": null
}
```

## 前端设计

### 导航

顶部导航栏新增 `来源池` → `/pool`，与案例列表、自动采集、复核、导出并列。

### 页面布局（两栏）

```
┌──────────────────────────────────────────────────────┐
│  来源池                                              │
│                                                      │
│  ┌──────────┐  ┌──────────────────────────────────┐  │
│  │ A 高校    │  │ MIT News  [大学新闻]              │  │
│  │ B 实验室  │  │ news.mit.edu/topic/research      │  │
│  │ C 图库   │  │ 上次采集: 3天前 · 已入库 12 张     │  │
│  │ D 期刊   │  │                     [详情] [采集] │  │
│  │ E 公共库  │  │                                  │  │
│  │ F 第三方  │  │ Stanford Report  [大学新闻]       │  │
│  │          │  │ news.stanford.edu/research        │  │
│  │          │  │ 从未采集                           │  │
│  │          │  │                     [详情] [采集] │  │
│  └──────────┘  └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

- 左侧：分类列表，可折叠，点击筛选右侧
- 右侧：来源卡片网格，2列
- [详情]：展开显示视觉价值、策略、备注（不常看的信息折叠）
- [采集]：触发采集，弹出进度浮层

### 卡片信息分层

始终显示（一眼判断）：
- 名称 + 来源类型标签
- 域名
- 上次采集时间 + 已入库数量（或"从未采集"）
- 详情按钮 + 采集按钮

点开才显示（折叠在详情里）：
- 视觉价值描述、策略建议、备注

不显示：
- crawlDifficulty（后端用）、createdAt/updatedAt（管理信息）

### 采集进度浮层

```
┌────────────────────────┐
│  MIT News · 采集中      │
│                        │
│  正在发现文章链接...     │
│  已发现 12 篇文章        │
│  进度 ████████░░ 5/12  │
│  已入库 8 张            │
│               [关闭]   │
└────────────────────────┘
```

前端每 2 秒轮询进度，直到 status 变为 completed 或 failed。

## 链接发现算法

对列表页 HTML 的所有 `<a>` 标签打分，取高分链接：

1. **URL 模式分**（高权重）：路径含 `/news/`、`/article/`、`/story/`、`/YYYY/MM/DD/` 等文章特征
2. **链接文本分**（中权重）：文本长度 > 15 字符且 < 200 字符，不含 "read more"、"click here" 等泛词
3. **结构位置分**（低权重）：链接在 `<article>`、`<main>`、`<h2>`、`<h3>` 内加分；在 `<nav>`、`<footer>` 内减分
4. **去重过滤**：去除完全相同的 href，排除锚点链接、mailto、javascript:、PDF
5. 最终取 top 50 个链接，按原始页面位置排序

## 初始数据导入

编写 seed 脚本 `server/src/seedPool.ts`，解析 `CRAWL_SOURCE_TARGETS.md` 中的 YAML 块，批量写入 CrawlSource 表。可通过 `npm run seed:pool` 执行。
