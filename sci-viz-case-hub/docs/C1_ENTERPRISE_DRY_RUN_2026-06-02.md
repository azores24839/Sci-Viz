# C1 企业来源 dry-run 基线记录

日期：2026-06-02

命令：

```bash
npm run enterprise:dry-run -- --max-links=5 --sample-pages=2
```

## 汇总

```text
manual: 3
active_static: 12
needs_adapter_tuning: 13
blocked_cloudflare: 2
```

当前可作为小批量真实采集候选的来源：

```text
Autodesk Construction Blog
Caterpillar News
NVIDIA Technical Blog
Eaton News Releases
Boston Dynamics Blog
Google Research Blog
Microsoft Research Blog
Arm Newsroom
Dow Press Releases
Veolia Newsroom
Boston Scientific Newsroom
Airbus Newsroom
```

## 学科覆盖

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

## 来源结果

| 学科方向 | 来源 | 发现链接 | 抽样页 | 图片候选 | 疑似 logo/icon | 建议状态 | 备注 |
|---|---:|---:|---:|---:|---:|---|---|
| 船舶海洋与建筑工程学院 | Kongsberg Maritime | 0 | 0 | 0 | 0 | manual | fetch failed |
| 船舶海洋与建筑工程学院 | Arup Projects | 0 | 0 | 0 | 0 | manual | HTTP 500 |
| 船舶海洋与建筑工程学院 | Autodesk Construction Blog | 5 | 2 | 2 | 0 | active_static | 补齐本方向自动采集入口 |
| 机械与动力工程学院 | Siemens Energy | 0 | 0 | 0 | 0 | needs_adapter_tuning | 列表页未发现文章 |
| 机械与动力工程学院 | Rolls-Royce | 0 | 0 | 0 | 0 | needs_adapter_tuning | 列表页未发现文章 |
| 机械与动力工程学院 | Caterpillar News | 5 | 2 | 37 | 2 | active_static | 工程机械图像候选较多 |
| 电子信息与电气工程学院 | Huawei News | 5 | 2 | 2 | 2 | needs_adapter_tuning | 可发现链接，但抽样图像疑似低价值 |
| 电子信息与电气工程学院 | Qualcomm OnQ | 0 | 0 | 0 | 0 | needs_adapter_tuning | 列表页未发现文章 |
| 电子信息与电气工程学院 | NVIDIA Technical Blog | 5 | 2 | 20 | 4 | active_static | 技术博客图像可用 |
| 电气工程学院 | ABB News | 0 | 0 | 0 | 0 | needs_adapter_tuning | fetch failed |
| 电气工程学院 | Schneider Electric Newsroom | 5 | 2 | 5 | 4 | needs_adapter_tuning | 可发现链接，但 logo/icon 比例过高 |
| 电气工程学院 | Eaton News Releases | 5 | 2 | 2 | 0 | active_static | 补齐本方向自动采集入口 |
| 自动化与感知学院 | Boston Dynamics Blog | 5 | 2 | 2 | 0 | active_static | 可进入小批量采集 |
| 自动化与感知学院 | FANUC America News | 0 | 0 | 0 | 0 | needs_adapter_tuning | 列表页未发现文章 |
| 计算机学院（网络空间安全学院、密码学院） | Google Research Blog | 5 | 2 | 18 | 1 | active_static | 可进入小批量采集 |
| 计算机学院（网络空间安全学院、密码学院） | Microsoft Research Blog | 5 | 2 | 18 | 6 | active_static | 可进入小批量采集，但需继续压低小图误收 |
| 集成电路学院（信息与电子工程学院） | ASML News | 5 | 2 | 0 | 0 | needs_adapter_tuning | 可发现链接，但图片选择器需调优 |
| 集成电路学院（信息与电子工程学院） | TSMC Newsroom | 0 | 0 | 0 | 0 | blocked_cloudflare | HTTP 403 |
| 集成电路学院（信息与电子工程学院） | Arm Newsroom | 5 | 2 | 10 | 2 | active_static | 芯片技术图文可用 |
| 材料科学与工程学院 | BASF News | 5 | 2 | 0 | 0 | needs_adapter_tuning | 可发现链接，但图片选择器需调优 |
| 材料科学与工程学院 | Corning News | 0 | 0 | 0 | 0 | needs_adapter_tuning | 列表页未发现文章 |
| 材料科学与工程学院 | Dow Press Releases | 5 | 2 | 2 | 0 | active_static | 补齐本方向自动采集入口；active-batch 需过滤品牌/公益页 |
| 环境科学与工程学院 | Xylem Newsroom | 5 | 2 | 72 | 38 | needs_adapter_tuning | dry-run 可提图，但 logo/icon 误收过高且 active-batch 链接质量不足 |
| 环境科学与工程学院 | Veolia Newsroom | 5 | 2 | 17 | 0 | active_static | 环境服务图像候选稳定，active-batch 需过滤 ESG/奖项/赞助页 |
| 环境科学与工程学院 | Orsted News | 0 | 0 | 0 | 0 | blocked_cloudflare | HTTP 403 |
| 生物医学工程学院 | Siemens Healthineers | 0 | 0 | 0 | 0 | manual | fetch failed |
| 生物医学工程学院 | GE HealthCare Press Releases | 0 | 0 | 0 | 0 | needs_adapter_tuning | active-batch 静态发现不足；后续考虑 browser_render/API |
| 生物医学工程学院 | Boston Scientific Newsroom | 5 | 2 | 13 | 1 | active_static | 补齐本方向自动采集入口，已过滤财务/投资类链接 |
| 航空航天学院 | Airbus Newsroom | 5 | 2 | 100 | 0 | active_static | 可进入小批量采集；候选图数量很高，需采集限额 |
| 航空航天学院 | Boeing Newsroom | 5 | 2 | 2 | 2 | needs_adapter_tuning | 可发现链接，但抽样图像疑似低价值 |

## 下一轮优先级

优先对 12 个 `active_static` 来源做小批量真实采集验证，每源最多 3-5 篇：

```text
Autodesk Construction Blog
Caterpillar News
NVIDIA Technical Blog
Eaton News Releases
Boston Dynamics Blog
Google Research Blog
Microsoft Research Blog
Arm Newsroom
Dow Press Releases
Veolia Newsroom
Boston Scientific Newsroom
Airbus Newsroom
```

随后调优“已能发现链接但图片候选不足或误收偏高”的来源：

```text
ASML News
BASF News
GE HealthCare Press Releases
Boeing Newsroom
Huawei News
Schneider Electric Newsroom
```

强反爬或 manual 来源不做绕过，只保留人工精选、插件采集或替代来源策略。

## Active-batch 校正

后续运行：

```bash
npm run enterprise:active-batch -- --max-links=3 --max-pages=1
```

结果显示部分 dry-run 可提图来源在真实批次的链接发现阶段仍会混入列表页、支持页、政策页、作者/标签页、财报、投资者关系或品牌公益页。因此已收紧多个 adapter 的排除规则，并在 `runEnterpriseActiveBatch.ts` 增加企业批次低价值 URL 过滤层。Xylem 从 `active_static` 降级为 `needs_adapter_tuning`；环境方向改用 Veolia Newsroom，材料方向改用 Dow Press Releases，生医方向保留 Boston Scientific Newsroom 并将 GE HealthCare 作为调优候选。

当前通过 active-batch 链接质量检查的 `active_static` 来源为 12 家：

```text
Autodesk Construction Blog
Caterpillar News
NVIDIA Technical Blog
Eaton News Releases
Boston Dynamics Blog
Google Research Blog
Microsoft Research Blog
Arm Newsroom
Dow Press Releases
Veolia Newsroom
Boston Scientific Newsroom
Airbus Newsroom
```

环境科学与工程学院已恢复 1 个 active 来源。已尝试但未进入正式 seed 池或已降级的替代候选包括：

```text
Xylem Newsroom
Arcadis News
WSP Insights
SUEZ Press Releases
Vestas News
Pentair News Releases
Ecolab Newsroom
Jacobs Newsroom
Tetra Tech News
WM Newsroom
Climeworks Newsroom
```
