# Sci-Viz Case Hub 文档索引

这个目录用于沉淀 `sci-viz-case-hub/` 应用相关文档。若只想快速理解项目，请按“核心入口”阅读；若要查历史执行结果，再看“采集与批处理报告”。

## 核心入口

- `../PROJECT_CONTROL.md`：项目总控、产品边界、核心流程、开发助手工作规则。
- `ARCHITECTURE_AND_DELEGATION.md`：架构接力、风险边界、哪些任务可以拆给低成本 AI。
- `IMPLEMENTATION_STATUS.md`：当前实现进度与尚未落地事项。
- `../README.md`：本地启动与使用说明。
- `../检查清单.md`：本地联调检查清单。

## 方法论与分类体系

- `superpowers/specs/2026-06-02-project-phases-and-3-axis-design.md`：项目阶段规划与三轴分类体系设计。
- `superpowers/specs/2026-06-02-3axis-classification-dictionary.md`：三轴分类体系完整字典。
- `../../视觉调研流程_人机分工.md`：科研影像视觉调研流程与人机分工方案。

## 来源池与专题资料

- `../../CRAWL_SOURCE_TARGETS.md`：URL 池来源清单。该文件被 `server/src/seedPool.ts` 读取，暂不移动。
- `superpowers/specs/2026-05-27-url-pool-design.md`：URL 池与智能发现采集设计。
- `superpowers/specs/2026-06-02-sjtu-secondary-urls.md`：上海交通大学二级网站 URL 列表。
- `superpowers/specs/2026-06-02-sjtu-discipline-journal-mapping.md`：上海交通大学学科到顶刊映射表。
- `superpowers/specs/2026-06-02-sjtu-presentation-stats.md`：交大学科视觉呈现方式比例统计。

## 阶段目标与 agent 计划

- `superpowers/README.md`：agent 规格、目标和执行计划的说明。
- `superpowers/specs/2026-06-02-phase-a-goals.md`：阶段 A 目标。
- `superpowers/specs/2026-06-02-phase-a3-goals.md`：阶段 A 续目标。
- `superpowers/specs/2026-06-02-phase-b-goals.md`：阶段 B 目标。
- `superpowers/specs/2026-06-02-phase-c-goals.md`：阶段 C 目标。
- `superpowers/specs/2026-06-02-phase-d-ui-goals.md`：阶段 D UI 目标。
- `superpowers/specs/2026-06-02-c1-enterprise-crawler-task.md`：企业视觉案例爬虫适配器任务说明。
- `superpowers/plans/2026-05-27-url-pool-implementation.md`：URL 池实现计划。
- `superpowers/plans/2026-06-02-three-column-comparison-view.md`：三栏对比视图实现计划。

## 采集与批处理报告

这些文件多由脚本生成或服务于一次性执行复盘。当前先保留在 `docs/` 根部，因为部分脚本写死了输出路径。

- `gap-crawl-dry-run-2026-05-31.md`
- `gap-crawl-execution-plan-2026-05-31.md`
- `gap-batch1-ingest-report-2026-05-31.md`
- `gap-engineering-batch-ingest-report-2026-05-31.md`
- `gap-med-env-batch-ingest-report-2026-05-31.md`
- `gap-noaa-supplement-report-2026-05-31.md`
- `gap-batch-tag-normalization-report-2026-05-31.md`
- `gap-coverage-audit-2026-05-31.md`
- `finalize-local-image-assets-report-2026-05-31.md`
- `fill-incomplete-metadata-local-report-2026-05-31.md`
- `local-ocr-missing-report-2026-05-31.md`
- `C1_SYNC_VALIDATION_2026-06-02.md`
- `C1_ENTERPRISE_COMPARISON_VISIBILITY_2026-06-02.md`
- `superpowers/specs/2026-06-02-backfill-report.md`

## 新增文档放置规则

- 长期有效的产品、架构、数据模型判断：优先更新核心入口文档，不新增散落文件。
- 一次性执行记录、批处理结果、审计结果：用 `YYYY-MM-DD` 或主题日期命名，并在本索引登记。
- agent 任务书、阶段目标、执行计划：放入 `superpowers/specs/` 或 `superpowers/plans/`，并更新 `superpowers/README.md`。
- 涉及脚本输出路径的报告，先检查 `server/src/*.ts` 是否写死路径，再决定是否移动。
