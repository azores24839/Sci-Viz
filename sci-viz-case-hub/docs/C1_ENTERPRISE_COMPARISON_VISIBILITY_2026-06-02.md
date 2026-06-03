# C1 企业对比可视化阶段报告

日期：2026-06-02

## 阶段目标

让 C1 企业科研视觉标杆库在 Sci-Viz Case Hub 中真正可见，并能在“三栏对比”页面中作为可展开的“头部企业”第四栏，与 SJTU、国内研究、国际研究来源并排比较。

本阶段不扩充企业来源池，只验证现有 12 个 `active_static` 企业来源的小批量采集、复核、四轴兼容和页面可见性。

## 真实小批量采集

执行命令：

```bash
npm run enterprise:active-batch -- --max-links=1 --max-pages=1 --execute
```

总结果：

| 指标 | 数量 |
|---|---:|
| active_static 来源 | 12 |
| discoveredLinks | 12 |
| processedPages | 11 |
| createdCases | 22 |
| candidateImages | 94 |
| filteredImages | 14 |
| failedPages | 1 |

逐来源结果：

| 来源 | processedPages | createdCases | candidateImages | filteredImages | failedPages | 备注 |
|---|---:|---:|---:|---:|---:|---|
| Autodesk Construction Blog | 1 | 1 | 1 | 0 | 0 | 入库为播客人物封面，建筑/工程视觉价值低 |
| Caterpillar News | 1 | 4 | 16 | 2 | 0 | 工程设备与矿区作业场景质量较好 |
| NVIDIA Technical Blog | 1 | 5 | 7 | 2 | 0 | 自动驾驶闭环训练机制图、架构图质量高 |
| Eaton News Releases | 1 | 1 | 1 | 0 | 0 | 抽象电力技术图，可用但偏宣传 |
| Boston Dynamics Blog | 1 | 1 | 1 | 0 | 0 | 人物访谈为主体，机器人/工程对象不够明确 |
| Google Research Blog | 1 | 4 | 12 | 0 | 0 | AI 研究机制图可用，部分 hero 图偏品牌传播 |
| Microsoft Research Blog | 1 | 5 | 11 | 6 | 0 | 数据分析界面和架构图可用 |
| Arm Newsroom | 1 | 1 | 7 | 2 | 0 | 算力基础设施摄影可用 |
| Dow Press Releases | 1 | 0 | 0 | 0 | 1 | 目标页 HTTP 403，不绕过 |
| Veolia Newsroom | 0 | 0 | 0 | 0 | 0 | 发现链接后被低价值批次过滤 |
| Boston Scientific Newsroom | 1 | 0 | 11 | 1 | 0 | 候选图多，但本轮未产生有效新案例 |
| Airbus Newsroom | 1 | 0 | 27 | 1 | 0 | 候选图多，但本轮未产生有效新案例 |

## 入库字段审计

本轮企业入库案例数量：22。

所有企业案例均保留以下字段：

- `sourceUrl`
- `sourceDomain`
- `pageTitle`
- `imageUrl`
- `contextText`
- `collectionScore`
- `reviewStatus`
- `userHint`，格式如 `NVIDIA Technical Blog / enterprise`

初始状态均为 `needs_review`，没有直接进入最终高价值案例。

## 人工复核样本

初次复核后曾保留 9 条 `approved`、10 条 `needs_review`、3 条 `rejected`。随后按用户要求，为了让企业对比栏完整呈现本轮小批量企业采集结果，已将本轮 22 条企业案例全部批量放行为 `approved`，并在 `manualNotes` 中追加批量放行说明。

当前复核后状态：

| reviewStatus | 数量 |
|---|---:|
| approved | 22 |
| needs_review | 0 |
| rejected | 0 |

approved 样本来源分布：

| sourceDomain | approved 数 |
|---|---:|
| developer.nvidia.com | 5 |
| www.microsoft.com | 5 |
| research.google | 4 |
| www.cat.com | 4 |
| www.eaton.com | 1 |
| newsroom.arm.com | 1 |
| bostondynamics.com | 1 |
| www.autodesk.com | 1 |

批准样本类型：

- 高价值工程/科研视觉：Caterpillar 矿区设备作业图、NVIDIA 自动驾驶闭环训练流程图、Microsoft 数据分析界面、Google AI 机制图。
- 可用但偏宣传：Eaton 抽象电力技术图、Arm 数据中心基础设施摄影。

拒绝样本：

- Autodesk 播客人物封面：偏节目/品牌传播，不适合作为建筑工程视觉标杆。
- Boston Dynamics 人物访谈：人物为主体，机器人/工程对象不够明确。
- Microsoft Research Forum 抽象 hero 图：与文章技术内容弱相关，偏品牌传播。

边界样本和低价值样本虽然已按用户指令放行到 `approved`，仍通过 `manualNotes` 保留质量判断：Autodesk 播客人物封面、Boston Dynamics 人物访谈、Microsoft 抽象会议 hero 图等不宜作为长期高价值标杆，应在下一轮评分或筛选中降权。

## 四轴分类兼容

本轮 22 条企业案例已补齐：

- `mediaType`
- `contentType`
- `visualStyle`
- `functionalPurpose`
- `distributionMedium`
- `mediaSubType`
- `contentSubType`

企业案例四轴缺失数：0。

approved 企业案例的 `mediaType` 分布：

| mediaType | 数量 |
|---|---:|
| 信息图 | 13 |
| 摄影 | 7 |
| 3D渲染 | 1 |
| 手绘图 | 1 |

代表性四轴标注：

| 案例 | functionalPurpose | distributionMedium | mediaSubType | contentSubType |
|---|---|---|---|---|
| Caterpillar 矿用卡车 | 展示 | 静图 | 纪实摄影 | 设备空间 |
| NVIDIA 闭环训练流程图 | 解释 | 静图 | 科学插画 | 机制图解 |
| Microsoft AI 数据分析界面 | 数据 | 静图 | 统计图表 | 实验结果 |
| Arm 数据中心服务器阵列 | 展示 | 静图 | 纪实摄影 | 设备空间 |

本次补标只更新企业域名对应的 22 条案例，没有改动 SJTU、国内研究或国际研究案例。

## 系统可视化验证

后端 comparison 分组已经将企业正式来源域名纳入 `enterprise` 分组，并且只统计 `reviewStatus = approved` 的案例。

页面验证：

- 本地启动 `npm run dev` 后打开 `http://localhost:5174/comparison`。
- Playwright 快照显示三栏对比页面正常加载。
- 页面显示 `展开头部企业对比（22 条）`，说明企业分组不再是空占位。
- 使用项目本地 Playwright 依赖和系统 Chrome 做无头验证，展开企业栏后读取到：
  - `头部企业 9 条案例`，这是初次复核只批准 9 条时的验证结果。
  - 批量放行后，企业栏应统计 22 条 `approved` 企业案例。
  - 企业样例缩略图包括 NVIDIA、Microsoft、Google、Caterpillar、Arm 等 6 个可识别样本。
- 点击企业样例可跳转到案例详情页，例如 `/cases/86758110-8d2c-410c-bce7-7bf656ffc9d6`。
- 首屏同时显示：
  - 交大现状：97 条案例
  - 国内研究：496 条案例
  - 国际研究：2240 条案例
  - 头部企业：22 条，可展开

前端最小修复：

- 修复 `/comparison` 条形图跳转到案例列表时的查询参数映射。
- `mediaType`、`contentType`、`visualStyle`、`discipline` 会映射为案例列表支持的 `media_type`、`content_type`、`visual_style`、`discipline`。
- 来源域名参数修正为 `source_domain`。
- 企业样例缩略图继续跳转到 `/cases/:id` 详情页。

## 第一版观察

从 22 条 approved 企业样本看，企业视觉表达与现有来源差异已经开始显现：

- 企业 AI/计算来源偏向流程图、系统架构图、产品界面截图，强调技术路径和工具使用场景。
- 工程装备企业更容易产出真实场景摄影，视觉上接近工程纪实与设备展示。
- 企业新闻稿容易混入品牌 hero 图、人物访谈、抽象传播图，需要更严格的低价值过滤和人工复核。
- 与 SJTU 当前样本相比，企业样本的人物合影比例更低，机制解释和产品/设备场景占比更高。
- 与国际期刊/封面来源相比，企业样本更少艺术化，更多产品化、工程化和流程化表达。

## 下一轮调优建议

1. 优先调优 Caterpillar、NVIDIA、Microsoft、Google、Arm 等已产生可用样本的来源。
2. Autodesk 和 Boston Dynamics 需要更精确的文章选择器或过滤规则，避免人物访谈/播客封面。
3. Dow 的 HTTP 403 保持记录，不做绕过；如需材料方向样本，优先换用已在来源池中的其他材料企业。
4. Boston Scientific、Airbus 需要检查候选图被过滤或未入库原因，下一轮只做小批量诊断。
5. 如果要在案例列表中完整支持四轴字段筛选，可新增 `functional_purpose`、`distribution_medium` 等查询参数；本阶段只完成企业可定位的最小修复。
