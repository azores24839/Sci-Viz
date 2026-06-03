# C1 并行开发后同步验证报告

日期：2026-06-02

## 目标

同步并验证当前并行开发后的 Sci-Viz Case Hub 状态，确认 C1 企业科研视觉标杆库可以在现有四轴分类、Review、Insights/Comparison 与来源池体系中协同运行，并形成真实小批量采集前的基线。

本轮不扩大来源池，不执行真实采集，不绕过 Cloudflare、登录、订阅或强反爬限制。

## 当前 worktree 并行进展概览

当前 worktree 存在较多并行修改，主要分为以下几类：

| 范围 | 当前状态 |
|---|---|
| C1 企业来源体系 | 已有 `enterpriseSources.ts`、`runEnterpriseDryRun.ts`、`runEnterpriseActiveBatch.ts`、企业 source-specific adapters 和 C1 文档 |
| SJTU 二级站来源 | 已有 `sjtuSources.ts`、`testSjtuAdapters.ts`、`runSJTUBatch.ts`，并在 `CRAWL_SOURCE_TARGETS.md` 增加 SJTU 二级站章节 |
| 四轴分类 | `schema.prisma` 已增加 `functionalPurpose`、`distributionMedium`、`mediaSubType`、`contentSubType`；`taxonomy.ts` 已同步扩展 |
| 三栏对比 | `insights/comparison` API 与 `ComparisonPage.tsx` 已存在，企业分组已接入企业正式来源域名 |
| Review / KPI / Insights UI | `ReviewPage`、`CaseList`、`CaseDetail`、`InsightsPage`、`collectionKpi` 等存在并行改动 |

未回滚或覆盖其他 AI / 用户产生的改动。

## Build 验证

命令：

```bash
npm run build
```

结果：

```text
server TypeScript build: passed
web TypeScript + Vite build: passed
```

结论：当前 C1、SJTU、四轴分类、三栏对比与 Review/Insights 并行改动在 TypeScript 编译层面可以协同运行。

## C1 enterprise dry-run 验证

命令：

```bash
npm run enterprise:dry-run -- --max-links=5 --sample-pages=2
```

结果摘要：

```text
manual: 3
active_static: 12
needs_adapter_tuning: 13
blocked_cloudflare: 2
```

学科覆盖：

```text
船舶海洋与建筑工程学院: 1/3 active_static
机械与动力工程学院: 1/3 active_static
电子信息与电气工程学院: 1/3 active_static
电气工程学院: 1/3 active_static
自动化与感知学院: 1/2 active_static
计算机学院（网络空间安全学院、密码学院）: 2/2 active_static
集成电路学院（信息与电子工程学院）: 1/3 active_static
材料科学与工程学院: 1/3 active_static
环境科学与工程学院: 1/3 active_static
生物医学工程学院: 1/3 active_static
航空航天学院: 1/2 active_static
```

结论：正式企业来源池仍保持 30 家左右的设计口径，11 个学院/学科方向均至少有 1 家 `active_static` 自动入口。TSMC / Orsted 等 403 来源继续保持 `blocked_cloudflare` / manual 降级，不做绕过。

## C1 enterprise active-batch dry-run 验证

命令：

```bash
npm run enterprise:active-batch -- --max-links=3 --max-pages=1
```

结果摘要：

```text
mode: dry-run only
sources: 12
discovered_links: 36
processed_pages: 0
created_cases: 0
candidate_images: 0
filtered_images: 0
failed_pages: 0
```

候选 URL 观察：

| 来源 | 观察 |
|---|---|
| Autodesk Construction Blog | 发现 AI / construction / product news 链接，可进入小批量但需人工判断产品新闻价值 |
| Caterpillar News | 发现矿山、自动驾驶运输、工程机械新闻，质量较好 |
| NVIDIA Technical Blog | 发现自动驾驶、physical AI、AI factory 技术博客，质量较好 |
| Eaton News Releases | 财报链接已被过滤，剩余电气协作与技术发布新闻 |
| Boston Dynamics Blog | 发现机器人博客与 Gemini robotics 相关内容，质量较好 |
| Google Research Blog | 发现研究博客与隐私分析等内容，质量较好 |
| Microsoft Research Blog | 发现企业研究博客内容，质量较好 |
| Arm Newsroom | 包含 AGI CPU、芯片到硅、AI biometrics 等候选，质量可接受 |
| Dow Press Releases | 剩余 decarbonization / sustainability 协作类链接，真实采集前需人工判断材料视觉价值 |
| Veolia Newsroom | 当前仅 1 条供热网络候选，环境工程相关，可作为低量入口 |
| Boston Scientific Newsroom | 仍有 `in-the-news` 边缘链接，真实采集前建议人工关注 |
| Airbus Newsroom | 航空故事和技术应用链接质量较好 |

结论：active-batch 仍为 dry-run，未下载图片、未写 `VisualCase`。低价值 URL 过滤层有效压低了财报、投资者关系、联系人、奖项、赞助和品牌公益类链接，但 Boston Scientific、Dow、Veolia 仍需要真实小批量后的人工复核。

## 四轴分类兼容性

当前 `VisualCase` schema 已包含：

```text
functionalPurpose
distributionMedium
mediaSubType
contentSubType
```

企业采集入库路径 `processSingleUrl()` 保留：

```text
sourceUrl
sourceDomain
pageTitle
imageUrl
contextText
collectionScore
collectionReasons
reviewStatus
```

入库时 `reviewStatus = pending_ai_analysis`，不会直接进入最终高价值案例。后续可通过现有 AI 分析、四轴补标/回填与 Review 流程进入 `needs_review` / `low_confidence_review` / `approved` 等状态。

结论：C1 企业案例与四轴分类字段兼容。真实采集后如四轴字段为空，可沿用现有补标脚本或分析流程回填。

## Review 与人工复核兼容性

`ReviewPage` 支持将案例更新为：

```text
approved
rejected
```

企业爬虫入库不会绕过 `pending_ai_analysis`。只有经 AI 分析和人工复核后的 `approved` 案例才适合进入最终风格谱系对比。

结论：企业案例可以进入人工复核流程，符合“企业图像不能直接作为最终高价值案例”的约束。

## Insights / Comparison 闭环

`insights/comparison` 当前只查询：

```text
reviewStatus = approved
```

企业分组已接入 30 家企业正式来源域名，包括 Autodesk、Caterpillar、NVIDIA、Eaton、Boston Dynamics、Google Research、Microsoft Research、Arm、Dow、Veolia、Boston Scientific、Airbus 等。

结论：企业案例只有在复核通过后才进入三栏/四栏风格谱系对比。企业来源不会自动挤占学术来源优先级；企业来源仍保持 `crawlTier = B`。

## 风险与注意项

| 风险 | 处理建议 |
|---|---|
| Boston Scientific 仍可能出现 `in-the-news` 等边缘栏目 | 第一轮真实采集每源最多 1 篇或先手动检查候选 URL |
| Dow / Veolia 部分内容偏 ESG 或品牌叙事 | 真实采集后通过人工复核区分工程视觉与品牌传播图 |
| Airbus 图片候选量很高 | 保持每页图片上限和每源小批量限制 |
| Xylem 图片候选多但 logo/icon 误收高 | 继续保持 `needs_adapter_tuning`，不进入 active-batch |
| 403 来源如 TSMC / Orsted | 保持 blocked/manual，不绕过 |
| worktree 存在大量并行改动 | 后续提交前需要按任务拆分 staged 范围，避免混入无关变更 |

## 下一步基线

可以进入 C1 第一轮真实小批量采集验证，但建议严格控制：

```bash
npm run enterprise:active-batch -- --max-links=1 --max-pages=1 --execute
```

建议策略：

- 只跑 12 个 `active_static` 来源。
- 每源最多 1 篇起步。
- 运行后立刻检查 `createdCases`、`candidateImages`、`filteredImages`、`reviewStatus` 和低价值误收。
- 优先人工复核 Boston Scientific、Dow、Veolia、Autodesk product news。
- 不扩大来源池，不做大规模采集。

本轮同步验证结论：当前项目状态已具备进入真实小批量 C1 企业采集验证的条件。
