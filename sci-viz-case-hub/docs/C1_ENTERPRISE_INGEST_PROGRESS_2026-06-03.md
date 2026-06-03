# C1 企业来源抓取入库进展

时间：2026-06-03 15:40 CST

## 本轮目标

推进 C1 企业来源的抓取与入库。对 `active_static` 来源执行小批量真实采集；对调优、手动和 blocked 来源确认当前状态，并保留可追溯的下一步方案。

## 当前数据库状态

企业来源池当前以 `ENTERPRISE_SOURCES` 配置为准，启用来源为 32 条。由于当前配置把部分旧新闻入口替换为 customer story / case study / success library 等更偏商业化转译的入口，seed 时已将 4 条旧企业入口禁用，保留历史记录和已入库案例，不删除数据。

来源状态分布：

| 状态 | 数量 | 说明 |
| --- | ---: | --- |
| `active_static` | 10 | 当前 active 来源均已有案例，可继续用 `enterprise:active-batch` 小批量采集 |
| `needs_adapter_tuning` | 17 | 需要调选择器、入口 URL、browser_render 或人工 URL 清单 |
| `manual` | 2 | 当前不走静态批量抓取；Arup 已有 browser_render 降级入库方案 |
| `blocked_cloudflare` | 3 | 不绕过，保留人工或替代来源方案 |

企业案例入库状态：

| 指标 | 数量 |
| --- | ---: |
| 已有案例的企业来源（含历史保留入口） | 20 |
| 当前启用但无案例的企业来源 | 12 |
| 企业案例总数 | 116 |
| `approved` | 46 |
| `needs_review` | 68 |
| `low_confidence_review` | 2 |

## 已有案例的企业

| 企业来源 | 案例数 |
| --- | ---: |
| Boston Scientific Newsroom | 13 |
| Kongsberg Maritime | 11 |
| Xylem Newsroom | 10 |
| NVIDIA Technical Blog | 10 |
| Airbus Newsroom | 9 |
| Boston Dynamics Blog | 9 |
| Siemens Healthineers | 8 |
| Veolia Newsroom | 7 |
| Huawei News | 5 |
| Microsoft AI Co-Innovation Labs | 5 |
| Microsoft Research Blog | 5 |
| NVIDIA Customer Stories | 5 |
| Caterpillar News | 4 |
| Google Research Blog | 4 |
| Arup Projects | 3 |
| Schneider Electric Newsroom | 2 |
| Qualcomm OnQ | 2 |
| Arm Newsroom | 1 |
| Autodesk Construction Blog | 1 |
| Boeing Newsroom | 1 |
| Eaton News Releases | 1 |

## 本轮完成

- 运行 `npm run db:seed:enterprise-sources`，确认当前企业来源池 32 条已同步。
- 运行 `npm run enterprise:active-batch -- --max-links=1 --max-pages=1 --execute`，完成 active 来源的保守真实采集。
- 针对缺样本 active 来源加深采集，新增 Veolia、Airbus、Boston Scientific 等企业案例。
- 修复图片下载层：`saveImageFromUrl()` 现在使用浏览器式请求头，并支持安全重定向，解决 Boston Scientific 图片下载失败。
- 修复页面抓取层：`processSingleUrl()` 现在支持安全页面重定向，解决 Schneider Electric 301 规范化 URL 被误判失败。
- 扩展 `enterprise:active-batch`：新增 `--statuses=` 参数，可对 `needs_adapter_tuning`、`manual`、`blocked_cloudflare` 做受控 dry-run 或执行，默认行为仍只跑 `active_static`。
- 将 Dow Press Releases 从 `active_static` 降级为 `blocked_cloudflare/manual`，原因是真实采集会落到 HTTP 403 或品牌页；不做绕过。
- 验证对比 API：`reviewStatus=approved` 的企业栏显示 27 条 approved 企业案例；本轮新增 Xylem 等案例在复核队列中，暂不直接进入最终 approved 对比。
- 增加 seed 一致性保护：不在当前 `ENTERPRISE_SOURCES` 配置里的旧企业来源会被 `enabled=false` 禁用，保留历史记录但不再进入当前来源池。
- 对 NVIDIA Customer Stories 执行真实小批量采集，新增商业化案例 3 条；该来源当前累计 5 条。
- 通过 browser-render 只读探测确认 Microsoft AI Co-Innovation Labs 页面有可用 case-study 链接；用具体 case-study URL 入库 5 条。
- 通过 browser-render 探测确认 Rolls-Royce 列表页有高价值缩略图，但现有静态处理只提取 1 张且被过滤，需 browser_render 批处理。
- 通过 browser-render 探测确认 FANUC 旧 news URL 为 404，应改用 `/case-studies` 或详情页。
- 对 `needs_adapter_tuning` 运行受控 dry-run，并对 Huawei、ASML、BASF、Xylem、Boeing 做真实小批量采集；其中 Xylem 成功新增 10 条，已提升为 `active_static`。
- 新增 `enterprise:browser-batch`，用于 Arup 这类静态 fetch 失败但浏览器渲染可见图片的企业源；Arup Projects 通过该路径入库 3 条。
- 将 Kongsberg Maritime 从旧 `kongsberg.com/maritime` 入口切换到 `kongsbergmaritime.com/products/`，验证可静态发现产品页，并入库 11 条。
- 将 Siemens Healthineers 从 press releases 入口切换到 `medical-imaging`，验证可静态发现影像产品页，并入库 8 条。
- Qualcomm OnQ 保留 `needs_adapter_tuning`，但已通过 AI research / Snapdragon 详情页受控 URL 清单入库 2 条。
- Huawei News 保留 `needs_adapter_tuning`，但已通过用户提供的 consumer wearable 页面受控 URL 清单入库 5 条；该页偏产品营销，后续仍需更稳定的企业/技术入口。
- ABB、Siemens Energy、Dow 替代入口本轮仍未产出；Dow 替代页继续返回 403，保留 blocked/manual 证据。

## 剩余来源

无案例且需要调优：

ABB News、ASML News、BASF News、Corning News、FANUC America News、GE HealthCare Press Releases、Microsoft AI Customer Stories、Rolls-Royce、Siemens Energy。

无案例且 manual：

无。

无案例且 blocked：

Dow Press Releases、Orsted News、TSMC Newsroom。

## 下一步

1. 对 `needs_adapter_tuning` 来源逐个调入口和选择器，优先 Rolls-Royce、FANUC、ASML、BASF、GE HealthCare、Siemens Energy。
2. 对 Arup browser_render 路径做二阶段链接下钻，避免长期只抓列表缩略图。
3. 对 blocked 来源不绕过，优先找可公开访问的替代入口或保留人工采集。
4. 人工复核当前 70 条非 approved 企业案例（`needs_review` 68 条、`low_confidence_review` 2 条）；通过后它们才进入默认 approved 对比统计。

## 当前禁用的旧入口

以下旧企业 CrawlSource 已禁用，仅保留历史记录和既有案例：

- Arm Newsroom：旧 `https://newsroom.arm.com/`
- Autodesk Construction Blog：旧 `https://www.autodesk.com/blogs/construction/`
- Caterpillar News：旧 `https://www.cat.com/en_US/news/machine-press-releases.html`
- Kongsberg Maritime：旧 `https://www.kongsberg.com/maritime/`
- Microsoft Research Blog：旧 `https://www.microsoft.com/en-us/research/blog/`
- Siemens Healthineers：旧 `https://www.siemens-healthineers.com/press-room/press-releases`
