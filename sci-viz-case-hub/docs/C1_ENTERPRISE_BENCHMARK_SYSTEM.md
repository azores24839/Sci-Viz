# C1 企业科研视觉标杆来源体系

## 定位

C1 不是一次性企业官网爬虫，而是 Sci-Viz Case Hub 的产业视觉标杆来源模块。它用于长期、稳定、可控地采集和沉淀头部科技企业的科研/工程视觉案例，并与高校、科研机构、期刊封面形成对照。

核心闭环：

```text
企业来源池 -> 爬虫适配器 -> 小批量 dry-run -> 质量评分 -> 人工复核 -> 风格谱系分析
```

## 来源池口径

来源池围绕 11 个学院/学科方向维护，每个方向 2-3 家头部企业。当前正式池已落地 30 家，其中 12 家通过 dry-run/active-batch 链接质量检查保留为 `active_static`，11 个方向均至少有 1 家自动采集入口。失败探索项不写入正式 seed，只保留在 dry-run/active-batch 记录中作为后续替代候选。

企业筛选优先级：

1. 官网存在稳定的 news / blog / project / press / media / insights 图文入口。
2. 图片具有科研影像参考价值，而不是纯品牌宣传。
3. 页面能保留 source_url、source_domain、page_title、image_url 和上下文。
4. 不需要登录、订阅或绕过 Cloudflare / 强反爬。
5. 企业来源优先级低于学术 S/A 来源，默认 `crawlTier = B`。

## 状态定义

```text
active_static
```

静态 HTML 可发现文章链接，抽样页能提取有效图片候选。允许进入小批量真实采集。

```text
needs_adapter_tuning
```

来源有价值，但当前静态适配器仍需调优。常见原因：发现链接为 0、抽样页图片为 0、logo/icon 误收过高、列表页动态渲染。

```text
blocked_cloudflare
```

遇到 403、Cloudflare 或类似强反爬阻断。只记录状态，不绕过。

```text
manual
```

适合作为人工精选或浏览器插件采集来源，不进入自动小批量采集。

```text
browser_render
```

静态 HTML 不足但公开页面可访问。后续可由 Playwright/browser adapter 处理。

## 运营命令

在项目根目录运行：

```bash
npm run db:seed:enterprise-sources
npm run enterprise:dry-run
npm run enterprise:active-batch
```

在 server 目录运行：

```bash
npm run db:seed:enterprise-sources
npm run enterprise:dry-run -- --max-links=5 --sample-pages=2
npm run enterprise:active-batch -- --max-links=3 --max-pages=1
```

`enterprise:dry-run` 只读取列表页和抽样文章页，不下载图片、不写数据库、不入库案例。

`enterprise:active-batch` 默认也是 dry-run，只发现 12 个 `active_static` 来源的文章 URL，不下载图片、不写数据库。真实小批量采集必须显式加 `--execute`：

```bash
npm run enterprise:active-batch -- --max-links=3 --max-pages=1 --execute
```

真实采集会调用现有 `processSingleUrl()`，因此会下载图片、写入 `VisualCase`、触发去重、采集评分和分析流程。每轮只允许小批量运行，推荐每源 3-5 篇。

企业 active-batch 在通用链接发现之后还有一层 C1 专用低价值 URL 过滤，用于剔除投资者关系、财报、联系人、媒体图库、奖项、赞助、HR/多元化和品牌公益页面。该过滤只作用于企业小批量批次，不修改核心 `discoverLinks.ts`。

当前 dry-run 基线记录见：

```text
docs/C1_ENTERPRISE_DRY_RUN_2026-06-02.md
```

## Dry-run 指标

每个来源输出：

```text
discipline
name
url
configuredStatus
adapterType
discoveredLinks
sampledPages
imageCandidates
likelyLogoIcons
suggestedStatus
error
```

最低可运营标准：

- 每个学院至少 1 个 `active_static`，并为 blocked/manual/needs_adapter_tuning 来源保留明确替代或降级策略。
- `active_static` 来源每轮 dry-run 至少发现 3 篇文章。
- 抽样页应提取到有效主图或正文图。
- `likelyLogoIcons / imageCandidates` 不应长期高于 50%。

## 质量判断

企业视觉素材进入人工复核前，先按采集候选分和来源状态做粗筛。

高价值企业视觉类型：

- 产品/设备高质量渲染图
- 真实工程现场和制造场景
- 实验室、测试平台、洁净室、医院/工厂/海试/飞行测试场景
- 技术解释图、系统架构图、流程图、剖面图
- AI / 芯片 / 材料 / 环境 / 医疗 / 航空航天技术博客配图
- 项目案例图和产业应用场景图

低价值或需降权素材：

- logo、icon、社交分享图
- 纯品牌 banner、活动海报、投资者关系配图
- 低分辨率头像、导航图标、装饰背景
- 与科研/工程表达无关的市场宣传图

所有企业图片必须进入人工复核流程，不能直接作为最终高价值案例。

## 调优节奏

推荐每轮只处理 3-5 个来源：

1. 运行 `npm run enterprise:dry-run`。
2. 挑选 `needs_adapter_tuning` 中最有价值的来源。
3. 调整 `staticSourceAdapters.ts` 的 host/path/selectors。
4. 同步 `enterpriseSources.ts` 和 `CRAWL_SOURCE_TARGETS.md` 的状态。
5. 只对 `active_static` 来源做小批量真实采集，每源最多 3-5 篇。
6. 记录采集成功率、有效图片候选、误收情况和人工复核通过率。

批次记录建议格式：

```text
date:
command:
sources:
discovered_links:
processed_pages:
created_cases:
candidate_images:
filtered_images:
failed_pages:
manual_review_notes:
follow_up:
```

## 2026-06-02 验证结果

```text
npm run enterprise:dry-run -- --max-links=5 --sample-pages=2
manual: 3
active_static: 12
needs_adapter_tuning: 13
blocked_cloudflare: 2
coverage: 11/11 directions have at least 1 active_static source
```

```text
npm run enterprise:active-batch -- --max-links=3 --max-pages=1
sources: 12
discovered_links: 36
mode: dry-run only, no downloads, no VisualCase writes
```

```text
npm run db:seed:enterprise-sources
first run: Created 30, Updated 0, Unchanged 0
second run: Created 0, Updated 0, Unchanged 30
```

```text
npm run build
server TypeScript build: passed
web TypeScript + Vite build: passed
```

## 风格谱系沉淀方向

C1 最终要支持以下分析：

- 企业 vs 高校 vs 科研机构 vs 期刊封面的视觉表达差异
- 学科方向之间的企业视觉语言差异
- 产品渲染、工程纪实、系统剖面、实验室叙事、制造现场、技术博客图等产业视觉谱系
- 企业视觉案例对科研影像方法论的借鉴点与风险边界

当前 30 家企业正式来源域名已接入 `insights/comparison` 的 `enterprise` 分组；企业案例通过人工复核后，可与 SJTU、高校/科研机构、期刊/国际研究来源做维度分布对比。
