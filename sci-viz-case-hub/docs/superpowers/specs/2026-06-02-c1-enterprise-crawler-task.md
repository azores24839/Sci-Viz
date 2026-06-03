# C1 企业视觉案例爬虫适配器 — 任务说明

> 此任务交给其他 AI 执行。执行者需先阅读项目架构文档，再完成企业调研、来源池建设和爬虫适配。

## 目标

围绕上海交通大学 11 个重点学院/学科方向，调研每个方向对应的 2-3 家头部科技/工程企业，并为这些企业的官网视觉素材来源建立 Sci-Viz Case Hub 企业来源池与静态爬虫适配器。

原先提到的追觅、小米、Apple、Tesla、Boston Dynamics、SpaceX 只是示例企业，不是固定目标。实际执行必须以学科方向为主线重新筛选企业。

## 前置：必须先阅读的文件

1. `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/PROJECT_CONTROL.md` — 项目总控
2. `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/docs/ARCHITECTURE_AND_DELEGATION.md` — 架构与分工
3. `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server/src/crawler/staticSourceAdapters.ts` — 现有适配器代码（最重要）
4. `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server/src/crawler/sjtuSources.ts` — 参考最近的 SJTU 种子数据写法
5. `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server/src/crawler/discoverLinks.ts` — 链接发现逻辑
6. `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server/src/crawler/extractImagesFromPage.ts` — 图片提取逻辑
7. `/Users/athenaeumzero/Documents/科研影像/CRAWL_SOURCE_TARGETS.md` — 来源池文档格式

## 11 个学院/学科方向

每个学院/学科方向调研并沉淀 2-3 家头部企业：

1. 船舶海洋与建筑工程学院
2. 机械与动力工程学院
3. 电子信息与电气工程学院
4. 电气工程学院
5. 自动化与感知学院
6. 计算机学院（网络空间安全学院、密码学院）
7. 集成电路学院（信息与电子工程学院）
8. 材料科学与工程学院
9. 环境科学与工程学院
10. 生物医学工程学院
11. 航空航天学院

## 企业筛选标准

优先选择同时满足以下条件的企业：

- 在对应学科/产业方向具有全球或国内头部代表性。
- 官网有稳定的新闻、博客、项目、案例、press、media 或 insights 页面。
- 官网视觉素材具有科研影像参考价值，例如产品渲染图、技术图、研发新闻图、工程场景图、实验图、案例图、设备图。
- 页面可追溯来源、标题、正文上下文和图片上下文。
- 不需要登录、订阅或绕过强反爬即可访问。遇到 Cloudflare 或强反爬时只标注状态，不做绕过。

## 具体任务

### 1. 企业调研与来源矩阵

先按 11 个学院/学科方向建立企业来源矩阵。每条记录至少包含：

```text
学院/学科方向
企业名称
官网 URL
推荐采集入口 URL
采集重点
视觉价值
推荐 crawlStatus
推荐 adapterType
是否需要 browser_render
备注
```

调研结果应优先沉淀到 `enterpriseSources.ts` 和 `CRAWL_SOURCE_TARGETS.md`，并在最终交付中汇总。

### 2. 编写企业来源适配器

在 `staticSourceAdapters.ts` 中为调研筛选出的企业添加适配器对象。参考现有适配器结构。

注意：当前 `StaticSourceAdapter` 接口只包含选择器和 URL 规则，不包含 `sourceType`、`category`、`crawlTier` 等来源元数据。这些元数据应放入 `enterpriseSources.ts` 的 CrawlSource 种子数据中。

适配器字段参考：

```typescript
{
  name: 'ASML',
  hostPatterns: [/^www\.asml\.com$/i, /^asml\.com$/i],
  articleLinkSelectors: [...],
  articlePathPatterns: [...],
  excludeUrlPatterns: [...],
  contentSelectors: [...],
  titleSelectors: [...],
  imageSelectors: [...],
  excludeSelectors: [...],
}
```

### 3. 创建企业来源种子数据

在 `/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server/src/crawler/enterpriseSources.ts` 中创建种子数据，格式参考 `sjtuSources.ts`。

每条种子数据包含：

```typescript
{
  discipline: '集成电路学院（信息与电子工程学院）',
  name: 'ASML',
  url: 'https://www.asml.com/en/news',
  sourceType: 'enterprise',
  category: 'ENT',
  crawlTier: 'B',
  crawlStatus: 'active_static',
  adapterType: 'static_html',
  visualValue: '光刻机、洁净室、芯片制造设备、技术解释图',
  strategyHint: '优先抓 news / technology / press 页面；产品页可能需要 browser_render',
  notes: '半导体装备头部企业',
}
```

导出 `seedEnterpriseSources()` 函数，幂等写入 CrawlSource 表。

### 4. 更新 CRAWL_SOURCE_TARGETS.md

在 `/Users/athenaeumzero/Documents/科研影像/CRAWL_SOURCE_TARGETS.md` 末尾新增 `# M. 对标科技企业` 章节，按 11 个学院/学科方向组织企业来源配置。

### 5. 小批量测试

对每个企业来源做 dry-run 测试：

- 发现文章链接数
- 抽样文章页图片候选数
- 确认是否误收大量 logo/icon
- 记录是否 static_html 可用，或需要 `browser_render` / `manual`

不要大量爬取。每个来源最多 5 篇文章。

### 6. 编译验证

```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server && npx tsc --noEmit
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/web && npx tsc --noEmit
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub && npm run build
```

## 重要约束

- 每个学院/学科方向筛选 2-3 家企业。
- `sourceType` 必须为 `'enterprise'`。
- `category` 必须为 `'ENT'`。
- `crawlTier` 使用 `'B'`。
- 不要修改现有学术来源的适配器配置。
- 不要修改核心爬虫逻辑，例如 `discoverLinks.ts`、`extractImagesFromPage.ts`、`sourceJobRunner.ts`。
- 不要修改 `PROJECT_CONTROL.md` 或 `ARCHITECTURE_AND_DELEGATION.md`。
- 如遇 Cloudflare / 登录 / 订阅 / 强反爬问题，标注 `crawlStatus: 'blocked_cloudflare'` 或 `'manual'`，不要硬破。
- 企业网站可能使用动态渲染，如果静态选择器不够，标注 `adapterType: 'browser_render'`。
- 每个企业最多抓取 5 篇文章做验证，不要大量爬取。

## 最终交付

1. 按 11 个学院/学科方向整理的企业调研矩阵。
2. `staticSourceAdapters.ts` 中新增的企业适配器。
3. `enterpriseSources.ts` 企业种子数据文件。
4. `CRAWL_SOURCE_TARGETS.md` 中新增的企业来源章节。
5. 每个来源的 dry-run 测试结果。
6. TypeScript 编译和 build 验证结果。
