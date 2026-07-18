# Sampling Rigor Audit - 2026-07-14

## 结论摘要

- 当前案例池共有 6147 条，非 rejected 案例 6136 条，approved 案例 6131 条。
- 建议继续把数据库定位为“案例池”，正式分析另设“均衡分析样本”。这样不会浪费现有大样本，也能避免大来源支配结论。
- 当前可执行的均衡样本口径：从 approved 且每域名不少于 20 条的来源中，按每来源 20 条抽样；预计覆盖 38 个来源、760 条案例。
- 同时导出两份可复现 CSV：minimum-balanced 覆盖 38 个来源、760 条；standard-balanced 覆盖 20 个来源、600 条。
- 对公众号/文章型来源，采样强度仍建议记录为“每单位 200 篇文章”；对现有站点型来源，用 approved 案例数分为 below_minimum / minimum / standard / strong 四档。

## 判定规则

| 层级 | approved 案例数/来源 | 用途 |
| --- | --- | --- |
| below_minimum | < 20 | 只能作为线索或案例展示，不单独写比例结论 |
| minimum | 20-29 | 可做保守比较，需要在文中提示样本较小 |
| standard | 30-49 | 可进入分层比较和来源间对照 |
| strong | >= 50 | 可用于稳定趋势判断，并进入全库/均衡双轨报告 |

## 来源组概览

| 来源组 | 非 rejected | approved | approved 域名数 | >=20 域名 | <20 域名 | 域名中位数 | 最大来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 交大现状 | 344 | 344 | 24 | 4 | 20 | 7.0 | ime.sjtu.edu.cn (32.8%) |
| 国内高校 | 353 | 353 | 15 | 8 | 7 | 20.0 | www.tsinghua.edu.cn (28.0%) |
| 国际研究 | 3244 | 3243 | 10 | 9 | 1 | 134.0 | www.nature.com (48.0%) |
| 企业参照 | 1039 | 1039 | 50 | 11 | 39 | 3.0 | www.nvidia.cn (50.9%) |
| 其他来源 | 1156 | 1152 | 28 | 6 | 22 | 4.0 | www.harvard.edu (55.5%) |

## 下一轮补采优先级

| 来源组 | 来源 | 域名 | approved | 已爬文章/URL | 状态 | 建议动作 |
| --- | --- | --- | --- | --- | --- | --- |
| 国内高校 | 东南大学-新闻网 | news.seu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 高新船舶与深海开发装备协同创新中心 | cisse.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 国家双创示范基地（双创推进办公室） | inen.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 轻合金精密成型国家工程研究中心 | laf.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 上海交大-媒体与传播学院 | smc.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 上海交大-密西根学院（全球学院） | www.ji.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 上海交大-生命科学技术学院 | life.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 上海交大-数学科学学院 | math.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 上海转化医学国际联合研究中心 | transmed.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 微生物代谢全国重点实验室 | skmml.sjtu.edu.cn | 0 | 8 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 未来媒体网络协同创新中心 | cmic.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | 转化医学国家重大科技基础设施（上海） | transmed.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | ABB Electrification Medium Voltage | new.abb.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | ABB News | new.abb.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Agility Robotics | agilityrobotics.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | BASF Battery Materials Research | www.basf.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | BASF News | www.basf.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Boeing Newsroom | boeing.mediaroom.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Corning News | www.corning.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Dow Press Releases | corporate.dow.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | FANUC America News | www.fanucamerica.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | GE HealthCare Press Releases | www.gehealthcare.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | IFSA协同创新中心 | llp.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Optics.org News | optics.org | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Orsted News | orsted.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Oura Ring | ouraring.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Rivian | rivian.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Rolls-Royce | www.rolls-royce.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Samsung Mobile | www.samsung.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Sony Electronics | electronics.sony.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |

## 学科分布

| 学科 | approved | 占比 |
| --- | --- | --- |
| 物理 | 1075 | 17.5% |
| 信息科学 | 1054 | 17.2% |
| 生命科学 | 976 | 15.9% |
| 综合交叉 | 821 | 13.4% |
| 工程 | 639 | 10.4% |
| 材料 | 576 | 9.4% |
| 医学 | 322 | 5.3% |
| 环境科学 | 295 | 4.8% |
| 化学 | 221 | 3.6% |
| 不确定 | 152 | 2.5% |

## 审核状态分布

| reviewStatus | 案例数 | 占比 |
| --- | --- | --- |
| approved | 6131 | 99.7% |
| rejected | 11 | 0.2% |
| analysis_failed | 5 | 0.1% |

### 交大现状 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| ime.sjtu.edu.cn | 113 | strong | 可进入全量/均衡双轨分析 |
| news.sjtu.edu.cn | 29 | minimum | 可做保守比较；补 1 条达 standard |
| www.aero.sjtu.edu.cn | 22 | minimum | 可做保守比较；补 8 条达 standard |
| sese.sjtu.edu.cn | 21 | minimum | 可做保守比较；补 9 条达 standard |
| smse.sjtu.edu.cn | 19 | below_minimum | 优先补 1 条达 minimum |
| www.seiee.sjtu.edu.cn | 19 | below_minimum | 优先补 1 条达 minimum |
| bme.sjtu.edu.cn | 18 | below_minimum | 优先补 2 条达 minimum |
| oce.sjtu.edu.cn | 17 | below_minimum | 优先补 3 条达 minimum |
| cs.sjtu.edu.cn | 13 | below_minimum | 优先补 7 条达 minimum |
| me.sjtu.edu.cn | 13 | below_minimum | 优先补 7 条达 minimum |
| design.sjtu.edu.cn | 7 | below_minimum | 优先补 13 条达 minimum |
| www.agri.sjtu.edu.cn | 7 | below_minimum | 优先补 13 条达 minimum |
| www.cs.sjtu.edu.cn | 7 | below_minimum | 优先补 13 条达 minimum |
| imr.sjtu.edu.cn | 6 | below_minimum | 优先补 14 条达 minimum |
| tdli.sjtu.edu.cn | 6 | below_minimum | 优先补 14 条达 minimum |
| loct.sjtu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| msv.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| pharm.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| soo.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| speit.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |

### 国内高校 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| www.tsinghua.edu.cn | 99 | strong | 可进入全量/均衡双轨分析 |
| news.pku.edu.cn | 57 | strong | 可进入全量/均衡双轨分析 |
| news.fudan.edu.cn | 26 | minimum | 可做保守比较；补 4 条达 standard |
| www.news.zju.edu.cn | 23 | minimum | 可做保守比较；补 7 条达 standard |
| news.hust.edu.cn | 21 | minimum | 可做保守比较；补 9 条达 standard |
| news.xjtu.edu.cn | 21 | minimum | 可做保守比较；补 9 条达 standard |
| news.buaa.edu.cn | 20 | minimum | 可做保守比较；补 10 条达 standard |
| www.bit.edu.cn | 20 | minimum | 可做保守比较；补 10 条达 standard |
| news.ustc.edu.cn | 19 | below_minimum | 优先补 1 条达 minimum |
| news.hit.edu.cn | 17 | below_minimum | 优先补 3 条达 minimum |
| www.ri.cmu.edu | 10 | below_minimum | 优先补 10 条达 minimum |
| kjc.seu.edu.cn | 7 | below_minimum | 优先补 13 条达 minimum |
| arch.seu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| automation.seu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| me.seu.edu.cn | 3 | below_minimum | 优先补 17 条达 minimum |

### 国际研究 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| www.nature.com | 1558 | strong | 可进入全量/均衡双轨分析 |
| newscenter.lbl.gov | 657 | strong | 可进入全量/均衡双轨分析 |
| news.harvard.edu | 375 | strong | 可进入全量/均衡双轨分析 |
| news.mit.edu | 261 | strong | 可进入全量/均衡双轨分析 |
| images.nasa.gov | 187 | strong | 可进入全量/均衡双轨分析 |
| www.mpg.de | 81 | strong | 可进入全量/均衡双轨分析 |
| engineering.stanford.edu | 52 | strong | 可进入全量/均衡双轨分析 |
| public.tableau.com | 29 | minimum | 可做保守比较；补 1 条达 standard |
| news.stanford.edu | 26 | minimum | 可做保守比较；补 4 条达 standard |
| nature.com | 17 | below_minimum | 优先补 3 条达 minimum |

### 企业参照 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| www.nvidia.cn | 529 | strong | 可进入全量/均衡双轨分析 |
| www.siemens-healthineers.com | 77 | strong | 可进入全量/均衡双轨分析 |
| www.asml.com | 50 | strong | 可进入全量/均衡双轨分析 |
| physicsworld.com | 39 | standard | 可进入标准分层分析；补 11 条达 strong |
| www.airbus.com | 35 | standard | 可进入标准分层分析；补 15 条达 strong |
| news.xbox.com | 30 | standard | 可进入标准分层分析；补 20 条达 strong |
| www.nvidia.com | 28 | minimum | 可做保守比较；补 2 条达 standard |
| azure.microsoft.com | 27 | minimum | 可做保守比较；补 3 条达 standard |
| bostondynamics.com | 24 | minimum | 可做保守比较；补 6 条达 standard |
| developer.nvidia.com | 23 | minimum | 可做保守比较；补 7 条达 standard |
| www.zeiss.com | 21 | minimum | 可做保守比较；补 9 条达 standard |
| www.spacex.com | 17 | below_minimum | 优先补 3 条达 minimum |
| www.medicaldesignandoutsourcing.com | 16 | below_minimum | 优先补 4 条达 minimum |
| www.wateronline.com | 13 | below_minimum | 优先补 7 条达 minimum |
| news.bostonscientific.com | 12 | below_minimum | 优先补 8 条达 minimum |
| www.xylem.com | 12 | below_minimum | 优先补 8 条达 minimum |
| www.kongsbergmaritime.com | 11 | below_minimum | 优先补 9 条达 minimum |
| developer.nvidia.cn | 8 | below_minimum | 优先补 12 条达 minimum |
| adsknews.autodesk.com | 6 | below_minimum | 优先补 14 条达 minimum |
| www.siemens-energy.com | 6 | below_minimum | 优先补 14 条达 minimum |

## 方法建议

1. 保留全库统计，但所有“整体比例”都标注为案例池结果。
2. 正式比较使用均衡样本：先按来源组，再按 sourceDomain 或学院/企业/机构单元分层，每层抽取同样数量。
3. 同时报告全库结果和均衡样本结果。若两者一致，结论较稳；若不一致，说明来源结构本身影响视觉谱系。
4. 对国内公众号继续记录“每学院 200 篇文章”的采样强度；对现有库补充 CrawlJob 的 crawledCount 或在报告中记录固定时间范围/栏目入口。
5. below_minimum 来源优先补到 20，standard 以下来源优先补到 30，核心比较对象再补到 50。
