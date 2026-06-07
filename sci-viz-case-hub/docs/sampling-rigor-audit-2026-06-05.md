# Sampling Rigor Audit - 2026-06-05

## 结论摘要

- 当前案例池共有 4826 条，非 rejected 案例 4817 条，approved 案例 2748 条。
- 建议继续把数据库定位为“案例池”，正式分析另设“均衡分析样本”。这样不会浪费现有大样本，也能避免大来源支配结论。
- 当前可执行的均衡样本口径：从 approved 且每域名不少于 20 条的来源中，按每来源 20 条抽样；预计覆盖 15 个来源、300 条案例。
- 同时导出两份可复现 CSV：minimum-balanced 覆盖 15 个来源、300 条；standard-balanced 覆盖 7 个来源、210 条。
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
| 交大现状 | 148 | 148 | 23 | 2 | 21 | 5.0 | news.sjtu.edu.cn (19.6%) |
| 国内高校 | 245 | 245 | 11 | 5 | 6 | 15.0 | www.tsinghua.edu.cn (23.7%) |
| 国际研究 | 3556 | 2075 | 10 | 6 | 4 | 22.5 | www.nature.com (88.2%) |
| 企业参照 | 498 | 86 | 38 | 0 | 38 | 2.0 | bostondynamics.com (7.0%) |
| 其他来源 | 370 | 194 | 21 | 2 | 19 | 3.0 | www.cas.cn (37.6%) |

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
| 企业参照 | Boston Scientific Cardiology | www.bostonscientific.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Boston Scientific Electrophysiology | www.bostonscientific.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Boston Scientific Endoscopy | www.bostonscientific.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Boston Scientific Interventional Cardiology | www.bostonscientific.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Boston Scientific Products | www.bostonscientific.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Corning News | www.corning.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Dow Press Releases | corporate.dow.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | FANUC America News | www.fanucamerica.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | GE HealthCare Press Releases | www.gehealthcare.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Huawei News | www.huawei.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 交大现状 | IFSA协同创新中心 | llp.sjtu.edu.cn | 0 | 0 | below_minimum | 优先补 20 条达 minimum |
| 企业参照 | Laser Focus World - ZEISS Search | www.laserfocusworld.com | 0 | 0 | below_minimum | 优先补 20 条达 minimum |

## 学科分布

| 学科 | approved | 占比 |
| --- | --- | --- |
| 生命科学 | 546 | 19.9% |
| 综合交叉 | 546 | 19.9% |
| 物理 | 452 | 16.4% |
| 材料 | 430 | 15.6% |
| 信息科学 | 321 | 11.7% |
| 工程 | 163 | 5.9% |
| 化学 | 151 | 5.5% |
| 医学 | 69 | 2.5% |
| 环境科学 | 50 | 1.8% |
| 综合科研 | 20 | 0.7% |

## 审核状态分布

| reviewStatus | 案例数 | 占比 |
| --- | --- | --- |
| approved | 2748 | 56.9% |
| needs_review | 1310 | 27.1% |
| low_confidence_review | 759 | 15.7% |
| rejected | 9 | 0.2% |

### 交大现状 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| news.sjtu.edu.cn | 29 | minimum | 可做保守比较；补 1 条达 standard |
| ime.sjtu.edu.cn | 28 | minimum | 可做保守比较；补 2 条达 standard |
| design.sjtu.edu.cn | 8 | below_minimum | 优先补 12 条达 minimum |
| oce.sjtu.edu.cn | 8 | below_minimum | 优先补 12 条达 minimum |
| www.seiee.sjtu.edu.cn | 8 | below_minimum | 优先补 12 条达 minimum |
| www.agri.sjtu.edu.cn | 7 | below_minimum | 优先补 13 条达 minimum |
| imr.sjtu.edu.cn | 6 | below_minimum | 优先补 14 条达 minimum |
| tdli.sjtu.edu.cn | 6 | below_minimum | 优先补 14 条达 minimum |
| cs.sjtu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| loct.sjtu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| msv.sjtu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| speit.sjtu.edu.cn | 5 | below_minimum | 优先补 15 条达 minimum |
| bme.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| pharm.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| soo.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| www.aero.sjtu.edu.cn | 4 | below_minimum | 优先补 16 条达 minimum |
| scce.sjtu.edu.cn | 3 | below_minimum | 优先补 17 条达 minimum |
| smse.sjtu.edu.cn | 3 | below_minimum | 优先补 17 条达 minimum |
| me.sjtu.edu.cn | 2 | below_minimum | 优先补 18 条达 minimum |
| oe.sjtu.edu.cn | 1 | below_minimum | 优先补 19 条达 minimum |

### 国内高校 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| www.tsinghua.edu.cn | 58 | strong | 可进入全量/均衡双轨分析 |
| news.pku.edu.cn | 57 | strong | 可进入全量/均衡双轨分析 |
| news.fudan.edu.cn | 28 | minimum | 可做保守比较；补 2 条达 standard |
| www.news.zju.edu.cn | 23 | minimum | 可做保守比较；补 7 条达 standard |
| news.ustc.edu.cn | 20 | minimum | 可做保守比较；补 10 条达 standard |
| www.bit.edu.cn | 15 | below_minimum | 优先补 5 条达 minimum |
| news.hust.edu.cn | 13 | below_minimum | 优先补 7 条达 minimum |
| news.xjtu.edu.cn | 11 | below_minimum | 优先补 9 条达 minimum |
| www.ri.cmu.edu | 10 | below_minimum | 优先补 10 条达 minimum |
| news.buaa.edu.cn | 9 | below_minimum | 优先补 11 条达 minimum |
| news.hit.edu.cn | 1 | below_minimum | 优先补 19 条达 minimum |

### 国际研究 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| www.nature.com | 1830 | strong | 可进入全量/均衡双轨分析 |
| images.nasa.gov | 95 | strong | 可进入全量/均衡双轨分析 |
| news.mit.edu | 32 | standard | 可进入标准分层分析；补 18 条达 strong |
| news.harvard.edu | 30 | standard | 可进入标准分层分析；补 20 条达 strong |
| public.tableau.com | 24 | minimum | 可做保守比较；补 6 条达 standard |
| news.stanford.edu | 21 | minimum | 可做保守比较；补 9 条达 standard |
| nature.com | 17 | below_minimum | 优先补 3 条达 minimum |
| engineering.stanford.edu | 12 | below_minimum | 优先补 8 条达 minimum |
| www.mpg.de | 12 | below_minimum | 优先补 8 条达 minimum |
| newscenter.lbl.gov | 2 | below_minimum | 优先补 18 条达 minimum |

### 企业参照 approved 来源分布

| sourceDomain | approved | status | 建议 |
| --- | --- | --- | --- |
| bostondynamics.com | 6 | below_minimum | 优先补 14 条达 minimum |
| www.siemens-energy.com | 6 | below_minimum | 优先补 14 条达 minimum |
| news.bostonscientific.com | 5 | below_minimum | 优先补 15 条达 minimum |
| www.nvidia.com | 5 | below_minimum | 优先补 15 条达 minimum |
| www.zeiss.com | 5 | below_minimum | 优先补 15 条达 minimum |
| www.siemens-healthineers.com | 4 | below_minimum | 优先补 16 条达 minimum |
| adsknews.autodesk.com | 3 | below_minimum | 优先补 17 条达 minimum |
| store.google.com | 3 | below_minimum | 优先补 17 条达 minimum |
| www.airbus.com | 3 | below_minimum | 优先补 17 条达 minimum |
| www.apple.com | 3 | below_minimum | 优先补 17 条达 minimum |
| www.kongsbergmaritime.com | 3 | below_minimum | 优先补 17 条达 minimum |
| www.mi.com | 3 | below_minimum | 优先补 17 条达 minimum |
| www.microsoft.com | 3 | below_minimum | 优先补 17 条达 minimum |
| www.unitree.com | 3 | below_minimum | 优先补 17 条达 minimum |
| developer.nvidia.com | 2 | below_minimum | 优先补 18 条达 minimum |
| research.google | 2 | below_minimum | 优先补 18 条达 minimum |
| www.asml.com | 2 | below_minimum | 优先补 18 条达 minimum |
| www.meta.com | 2 | below_minimum | 优先补 18 条达 minimum |
| www.qualcomm.com | 2 | below_minimum | 优先补 18 条达 minimum |
| www.veolia.com | 2 | below_minimum | 优先补 18 条达 minimum |

## 方法建议

1. 保留全库统计，但所有“整体比例”都标注为案例池结果。
2. 正式比较使用均衡样本：先按来源组，再按 sourceDomain 或学院/企业/机构单元分层，每层抽取同样数量。
3. 同时报告全库结果和均衡样本结果。若两者一致，结论较稳；若不一致，说明来源结构本身影响视觉谱系。
4. 对国内公众号继续记录“每学院 200 篇文章”的采样强度；对现有库补充 CrawlJob 的 crawledCount 或在报告中记录固定时间范围/栏目入口。
5. below_minimum 来源优先补到 20，standard 以下来源优先补到 30，核心比较对象再补到 50。
