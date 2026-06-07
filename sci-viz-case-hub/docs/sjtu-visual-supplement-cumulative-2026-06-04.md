# SJTU 工科学院高质量科研可视化补强累计审计

更新时间：2026-06-05

## 累计结果

当前全库总量：3733  
SJTU 高质量科研可视化补强标记案例：261  
其中 collectionScore >= 60：250  
补强标记集中新闻/报告类计数：0

说明：环境、船舶、电气部分包含“既有已批准高分案例映射入 SJTU 补强集”的记录，manualNotes 保留原备注并追加 `SJTU 高质量科研可视化补强批次` 标记；这些不是重复下载。

## 完成标准口径

| 学院 | 原 SJTU 当前数 | 补强标记数 | 补强 score>=60 | 原有+高分补强有效数 | 结论 |
|---|---:|---:|---:|---:|---|
| 电气工程学院 | 0 | 31 | 21 | 21 | 达到 20+ |
| 自动化与感知学院 | 0 | 51 | 51 | 51 | 达到 20+ |
| 集成电路学院 | 0 | 34 | 34 | 34 | 达到 20+ |
| 机械与动力工程学院 | 6 | 42 | 42 | 48 | 达到 25+ |
| 材料科学与工程学院 | 9 | 17 | 16 | 25 | 达到 25 |
| 环境科学与工程学院 | 4 | 53 | 53 | 57 | 达到 25+ |
| 船舶海洋与建筑工程学院 | 14 | 22 | 22 | 36 | 达到 25+ |

## 学院分布

| 学院 | 补强标记数 | score>=60 | score>=68 | 平均分 |
|---|---:|---:|---:|---:|
| 环境科学与工程学院 | 53 | 53 | 53 | 81.7 |
| 自动化与感知学院 | 51 | 51 | 36 | 72.8 |
| 机械与动力工程学院 | 42 | 42 | 42 | 70.9 |
| 集成电路学院 | 34 | 34 | 19 | 80.7 |
| 船舶海洋与建筑工程学院 | 22 | 22 | 18 | 81.2 |
| 电气工程学院 | 31 | 21 | 14 | 63.5 |
| 材料科学与工程学院 | 17 | 16 | 16 | 81.2 |
| 电子信息与电气工程学院 | 5 | 5 | 5 | 96.4 |
| 生物医学工程学院 | 4 | 4 | 3 | 75.0 |
| 计算机学院 | 2 | 2 | 2 | 68.0 |

## 来源分布

| 域名 | 补强标记数 | score>=60 |
|---|---:|---:|
| www.fraunhofer.de | 42 | 42 |
| rpg.ifi.uzh.ch | 37 | 37 |
| science.nasa.gov | 32 | 32 |
| www.zeiss.com | 25 | 25 |
| www.usgs.gov | 21 | 21 |
| www.ri.cmu.edu | 14 | 14 |
| www.kongsbergmaritime.com | 11 | 11 |
| top.epri.com | 9 | 9 |
| distribution.epri.com | 9 | 1 |
| www.asml.com | 9 | 9 |
| www.mpie.de | 8 | 8 |
| www.asminternational.org | 8 | 8 |
| www.siemens-energy.com | 6 | 6 |
| www.marin.nl | 5 | 5 |
| news.mit.edu | 5 | 5 |
| transmission.epri.com | 4 | 2 |
| www.arup.com | 3 | 3 |
| adsknews.autodesk.com | 3 | 3 |
| www.janelia.org | 3 | 3 |
| distill.pub | 2 | 2 |
| www.eaton.com | 1 | 1 |
| www.se.com | 1 | 1 |
| wyss.harvard.edu | 1 | 1 |
| techportal.epri.com | 1 | 1 |
| thermocalc.com | 1 | 0 |

## 媒体类型

| 媒体类型 | 数量 |
|---|---:|
| 摄影 | 125 |
| 信息图 | 75 |
| 3D渲染 | 30 |
| 数据可视化 | 18 |
| 未分析/空 | 6 |
| 不确定 | 3 |
| 手绘图 | 2 |
| 显微图 | 2 |

## 新增/修复来源

已新增或修复为可复跑 CrawlSource / adapter 的来源：

| 来源 | 目标学院 | 状态 |
|---|---|---|
| Zeiss Semiconductor Manufacturing Technology | 集成电路 | active_static，已入库 25 |
| ASML Lithography Systems | 集成电路 | active_static，已入库 9 |
| Siemens Energy Grid Technologies | 电气工程 | active_static，已入库 6 |
| ABB Electrification Medium Voltage | 电气工程 | active_static，当前 0 产出，需继续调过滤规则 |
| ASM International Metallography | 材料 | active_static，已入库 8 |
| BASF Battery Materials Research | 材料 | active_static，当前 0 产出 |
| Thermo-Calc Resources | 材料 | active_static，已入库 1，低于 60 |
| MARIN News | 船舶海洋 | active_static，已入库 5 |
| NASA Earth Observatory | 环境 | 既有 approved 高分案例映射 32 |
| USGS Landsat Multimedia | 环境 | 既有 approved 高分案例映射 21 |
| Kongsberg Maritime | 船舶海洋 | 既有 approved 高分案例映射 11 |
| Arup Projects | 船舶海洋 | 既有 approved 高分案例映射 3 |
| Autodesk Newsroom | 船舶海洋 | 既有 approved 高分案例映射 3 |
| Schneider Electric Newsroom | 电气工程 | 既有 approved 高分案例映射 1 |
| Eaton News Releases | 电气工程 | 既有 approved 高分案例映射 1 |

## 仍需调优来源

| 来源 | 当前问题 |
|---|---|
| JAMSTEC Images | 受控图库页可访问但未产出，需图库专用图片抽取 |
| CERN Photos | CDS 详情页图片规则仍需专用适配 |
| IEEE Power & Energy Society | 静态 fetch 不稳定，需替代入口或受控 URL |
| DLR Robotics and Mechatronics | 静态 fetch 失败，需替代入口 |
| IEEE Electron Devices Society | 原 news 路径不稳定，需改资源入口 |
| IRENA Publications | HTTP 403，需替代公开页面或人工清单 |
| NREL Energy Visualization Pages | 页面请求 fetch failed，未产出 |
| ABB Electrification Medium Voltage | 页面可跑但图片过滤后 0 产出 |
| BASF Battery Materials Research | 页面可跑但图片过滤后 0 产出 |

## 验证记录

- `npm run sjtu:seed-visual-sources`：成功，新增/更新 CrawlSource。
- `node --import tsx src/mapSjtuExistingEnvironmentCases.ts`：成功，映射 NASA/USGS/Kongsberg/Arup/Autodesk/Schneider/Eaton 既有高分案例。
- `npm run sjtu:visual-supplement -- --execute ...`：成功执行多批真实入库。
- SQLite 审计：补强标记 261，score>=60 为 250；重点学院完成标准口径全部达标。
- `npm run build`：通过。
- `/api/health`：返回 ok。
- `/api/insights/comparison?dimension=mediaType`：鉴权后返回 `success:true`。
- `/api/cases?source_name=ASM International Metallography&limit=2`：鉴权后返回 `success:true`，pagination.total = 8，样例包含 `SJTU 高质量科研可视化补强批次：材料科学与工程学院`。

## 结论

本阶段已完成 SJTU 重点工科学院高质量科研可视化补强集的数据库入库与标记目标。新闻/报告占比问题在补强集中已降为 0；三个原本无独立源学院均超过 20 条高分案例；机械、材料、环境、船舶海洋按“原有案例 + 高分补强”均达到 25 条以上有效案例。已同步修复服务端代码中的 `visualStyle` 到 `technicalMethod` 字段迁移问题，恢复 build 和 API 查询验证。
