# Sampling Statistical Analysis - 2026-06-05

## Executive Summary

- 当前 approved 案例为 2748 条；正式比较建议使用“全库 + 均衡样本”双轨。
- minimum-balanced 样本：15 个来源，每来源 20 条，共 300 条。
- standard-balanced 样本：7 个来源，每来源 30 条，共 210 条。
- 来源集中度最高的是国际研究组，HHI=0.781，有效来源数约 1.3；这说明全库统计会明显受 Nature 影响。
- 企业参照组的有效来源数较高但单源样本薄，适合做案例谱系展示；若要做比例结论，应先补到每核心企业/域名不少于 20-30 条。

## 来源集中度

HHI 越高代表越集中；有效来源数可以理解为“按当前分布折算后相当于多少个均衡来源”。

| 来源组 | approved | 域名数 | 最大来源 | HHI | 有效来源数 | 均匀度 |
| --- | --- | --- | --- | --- | --- | --- |
| 交大现状 | 148 | 23 | news.sjtu.edu.cn (19.6%) | 0.097 | 10.3 | 0.865 |
| 国内高校 | 245 | 11 | www.tsinghua.edu.cn (23.7%) | 0.150 | 6.7 | 0.874 |
| 国际研究 | 2075 | 10 | www.nature.com (88.2%) | 0.781 | 1.3 | 0.252 |
| 企业参照 | 86 | 38 | bostondynamics.com (7.0%) | 0.038 | 26.4 | 0.946 |
| 其他来源 | 194 | 21 | www.cas.cn (37.6%) | 0.184 | 5.4 | 0.734 |

## 组间差异效应量

Cramer's V 用于衡量来源组与分类轴之间的关联强度。这里不把 p 值作为重点，因为样本量较大时微小差异也容易显著；更适合看效应量。

| 分类轴 | 全库N | 全库V | 均衡N | 均衡V | 解释 |
| --- | --- | --- | --- | --- | --- |
| 功能用途 | 2554 | 0.364 | 180 | 0.304 | 强 |
| 技术手段 | 2554 | 0.284 | 180 | 0.398 | 中 |
| 内容对象 | 2554 | 0.564 | 180 | 0.436 | 强 |
| 学科 | 2554 | 0.317 | 180 | 0.189 | 强 |

## 全库与均衡样本分布偏移

TVD 为 0 表示两种口径分布一致，越接近 1 表示越不同。若某轴 TVD 较高，报告中应同时展示全库与均衡样本。

| 分类轴 | minimum TVD | standard TVD | 全库前三 | standard前三 |
| --- | --- | --- | --- | --- |
| 功能用途 | 0.331 | 0.312 | 展示 36.1% / 记录 25.9% / 数据 16.9% | 记录 42.8% / 数据 22.2% / 解释 21.1% |
| 技术手段 | 0.340 | 0.232 | 渲染 36.4% / 拍摄 26.8% / 绘设 21.0% | 拍摄 39.4% / 绘设 22.2% / 渲染 17.2% |
| 内容对象 | 0.617 | 0.592 | 科普传播 72.0% / 机制模型 6.2% / 团队场景 4.8% | 机制模型 22.8% / 科研人员 16.1% / 科普传播 15.6% |
| 学科 | 0.258 | 0.191 | 综合交叉 21.2% / 生命科学 20.6% / 物理 17.2% | 物理 27.8% / 生命科学 20.0% / 综合交叉 19.4% |

## 补采优先级

| 来源组 | sourceDomain | approved | 状态 | 补到20 | 补到30 | 补到50 |
| --- | --- | --- | --- | --- | --- | --- |
| 交大现状 | sese.sjtu.edu.cn | 1 | below_minimum | 19 | 29 | 49 |
| 交大现状 | www.physics.sjtu.edu.cn | 1 | below_minimum | 19 | 29 | 49 |
| 交大现状 | sklcm.sjtu.edu.cn | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.autodesk.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.cat.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.eaton.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | newsroom.arm.com | 1 | below_minimum | 19 | 29 | 49 |
| 国内高校 | news.hit.edu.cn | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.se.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.arup.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.dji.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.dreametech.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.byd.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.garmin.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.nio.cn | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.whoop.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.xpeng.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.roborock.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.figure.ai | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.ecovacs.com | 1 | below_minimum | 19 | 29 | 49 |
| 企业参照 | www.dyson.com | 1 | below_minimum | 19 | 29 | 49 |
| 其他来源 | wyss.harvard.edu | 1 | below_minimum | 19 | 29 | 49 |
| 其他来源 | transmission.epri.com | 1 | below_minimum | 19 | 29 | 49 |
| 其他来源 | techportal.epri.com | 1 | below_minimum | 19 | 29 | 49 |
| 其他来源 | thermocalc.com | 1 | below_minimum | 19 | 29 | 49 |
| 交大现状 | oe.sjtu.edu.cn | 1 | below_minimum | 19 | 29 | 49 |
| 国际研究 | newscenter.lbl.gov | 2 | below_minimum | 18 | 28 | 48 |
| 其他来源 | prod-01-alb-www-noaa.woc.noaa.gov | 2 | below_minimum | 18 | 28 | 48 |
| 交大现状 | me.sjtu.edu.cn | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | developer.nvidia.com | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | research.google | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | www.veolia.com | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | www.xylem.com | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | www.qualcomm.com | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | www.meta.com | 2 | below_minimum | 18 | 28 | 48 |
| 其他来源 | distill.pub | 2 | below_minimum | 18 | 28 | 48 |
| 其他来源 | top.epri.com | 2 | below_minimum | 18 | 28 | 48 |
| 其他来源 | distribution.epri.com | 2 | below_minimum | 18 | 28 | 48 |
| 其他来源 | www.mpie.de | 2 | below_minimum | 18 | 28 | 48 |
| 企业参照 | www.asml.com | 2 | below_minimum | 18 | 28 | 48 |

## 统计执行建议

1. 报告正文使用 standard-balanced 作为主要比较样本，保留全库作为背景案例池。
2. 对国际研究组，任何“总体比例”都要注明 Nature 占比高；最好单独报告 Nature 与非 Nature 两套结果。
3. 对企业参照组，当前更适合做视觉策略归纳，不适合直接和高校组做比例强比较；先补 ZEISS、Boston Scientific、NVIDIA、Microsoft、ASML、Airbus、Siemens Healthineers 等核心域名。
4. 对交大组，综合新闻已足够，但学院/中心域名偏薄；如果研究问题是“学院视觉传播能力”，应按学院补采，而不是只继续抓 news.sjtu.edu.cn。
5. 方法章节建议写明：案例池用于覆盖多样性，均衡样本用于统计比较，来源低于 20 条不单独作比例结论。
