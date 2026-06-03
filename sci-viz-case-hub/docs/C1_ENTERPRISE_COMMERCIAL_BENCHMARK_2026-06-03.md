# C1 企业商业化科研视觉参照组补强记录

日期：2026-06-03

## 目标重定义

enterprise 组从“头部企业研究/新闻案例”调整为“商业化科研视觉呈现基准”。它用于观察企业如何把科研、工程和技术成果转译为客户可理解、可购买、可部署的价值表达。

优先入口从纯 news / press release / generic blog 调整为：

- case studies / customer stories / success stories
- solutions / industries / applications / use cases
- product pages / product demos
- technology / innovation pages
- whitepaper landing pages / application notes

## 机制改动

- `enterpriseSources.ts` 增加商业化入口：NVIDIA Customer Stories、Microsoft AI Customer Stories、Microsoft AI Co-Innovation Labs，并把 Autodesk、Caterpillar、Arm 的商业化入口写入来源池。
- `discoverLinks.ts` 对 case-study、customer-story、solution、industry、application、product、technology、innovation、whitepaper 等路径加权。
- `runEnterpriseActiveBatch.ts` 对企业批次 URL 做商业化优先排序，news / press / blog 仅降权而非完全排除。
- `collectionScoring.ts` 对 enterprise 来源中的 commercial/application/story/product/solution 等语义加分，避免应用场景页被纯科研关键词体系压低。
- `insights/comparison` 增加 `enterpriseCommercialSignals`，统计应用场景化、产品/解决方案绑定、性能指标或成果可视化、品牌化叙事、商业转化路径、面向客户/行业受众、动图/视频/3D/演示潜力。
- `/comparison` 企业侧栏文案改为“商业化视觉参照”，并展示商业化信号条。
- enterprise 代表样本改为“商业化信号优先 + 来源域名多样化”抽样，避免旧 technical blog 或单一公司挤占样本位。

## 采集验证

运行：

```bash
npm run enterprise:active-batch -- --max-links=3 --max-pages=1 --only=Autodesk,Caterpillar,NVIDIA,Microsoft,Arm
npm run enterprise:active-batch -- --max-links=2 --max-pages=1 --only=NVIDIA Customer --execute
```

结果：

- NVIDIA Customer Stories 静态发现成功，发现 case-study 链接并完成小批量真实采集。
- 新增并放行 `www.nvidia.com` case-study approved 5 条。
- 同一批误带入的 `developer.nvidia.com` technical blog 新样本保持 `needs_review`，避免稀释商业化口径。
- 复核并放行非 AI 商业化参照样本 19 条：
  - Boston Scientific 医疗器械/医学机制 9 条
  - Airbus 工程制造/野火应用 6 条
  - Xylem 水处理应用 4 条
- Schneider、Xylem、Boston Scientific、Airbus 小批量重跑显示：部分高分候选图未新增，主要原因是已有重复图或图片服务下载/content-type 限制。
- Autodesk Customer Stories、Caterpillar Customer Stories、Microsoft AI Customer Stories、Microsoft AI Co-Innovation Labs、Arm Success Library 静态 fetch 失败，已标为 `needs_adapter_tuning`，下一轮应使用 browser_render 或替代入口。

## 当前企业栏

- 企业相关案例：116 条
- enterprise approved：80 条
- enterprise needs_review：22 条
- enterprise rejected：14 条
- 企业 approved 来源包括 `www.kongsbergmaritime.com`、`developer.nvidia.com`、`www.microsoft.com`、`bostondynamics.com`、`www.airbus.com`、`www.nvidia.com`、`www.cat.com`、`research.google`、`www.xylem.com`、`www.siemens-healthineers.com`、`www.arup.com`、`www.eaton.com`、`newsroom.arm.com`、`www.autodesk.com`、`www.se.com`
- 第二轮新增放行商业化/技术解释参照样本：34 条
- 第二轮拒绝低价值样本：14 条（消费电商页、人物肖像/团队照、装饰空白图、普通 PR 标志图）
- 企业商业化信号 Top 4：
  - 产品/解决方案绑定：89.1%
  - 性能指标或成果可视化：52.2%
  - 面向客户/行业受众：39.1%
  - 品牌化叙事：30.4%

## 第二轮质量初筛处理

DeepSeek 初筛报告将 68 条 `needs_review` 和 2 条 `low_confidence_review` 分为 A/B/C/D 四层。实际执行时采用保守口径：把初筛结果作为候选，不机械全量放行。

已放行 34 条：

- Kongsberg Maritime 11 条产品/系统/仿真页面全部放行，补上船舶海洋工程商业化参照。
- Boston Dynamics 7 条产品 demo、设施巡检、Atlas/Spot 工业应用放行。
- Microsoft 4 条客户案例和系统架构图放行。
- NVIDIA Technical Blog 5 条 Cosmos 3 架构、数据集和物理 AI 可视化作为“技术解释型企业视觉”放行。
- Airbus Wildfire Sentinel 1 条、Arup 工程项目 2 条、Siemens Healthineers 医疗设备/成像 3 条、Schneider EcoCare 1 条放行。

已拒绝 14 条：

- Huawei consumer wearable 5 条：偏消费电商，不适合作为工科 B2B/科研商业化参照。
- Boeing 标志图、Boston Dynamics 工程师访谈、Microsoft 团队合影、Schneider 人事任命、Xylem 公益合影拒绝。
- Veolia 空白装饰图、CEO 肖像、剪彩/合影类图拒绝。

继续保留 `needs_review` 的主要类型：

- Boston Scientific 患者故事/人物访谈。
- Qualcomm 消费手机或品牌宣传图。
- Xylem Watermark 公益/CSR 图标和水安全教育图。
- Siemens Healthineers 医疗科技肖像或泛新闻人物图。
- Airbus 团队合影和 Arup 纯风景图。

当前企业代表样本覆盖：

- `www.nvidia.com`：AI 法律服务 / 蛋白折叠等 case-study
- `www.airbus.com`：野火灭火应用、A350F 工程制造
- `www.eaton.com`：电力传输与能源设备
- `newsroom.arm.com`：数据中心服务器阵列
- `www.cat.com`：工程机械/矿用卡车
- `www.microsoft.com`：企业 AI 数据分析界面
- `news.bostonscientific.com`：医疗器械和医学机制图
- `www.xylem.com`：废水处理厂和水处理应用

## 阶段判断

企业栏已经不再是空占位，也不再只按普通新闻口径展示。当前样本从 NVIDIA AI case studies 扩展到医疗器械、航天工程、环境水处理、电气能源、工程机械和企业 AI 工具，能初步体现科研/工程技术向应用场景、产品能力和客户价值的转译。

仍然不足：

- 商业化样本仍缺材料、机器人、半导体制造、能源解决方案的高质量 case-study / solution page。
- 多个高价值企业商业入口需要 browser_render。
- 仍有旧 research/news 样本留在 approved 中，后续可用更严格的人工复核或商业化信号评分进行降权。
