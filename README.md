# 科研影像项目文档入口

本仓库包含科研影像视觉调研资料与 `sci-viz-case-hub/` Web 应用。为避免 Markdown 文档分散后难以检索，后续请按本页进入。

## 先读顺序

1. `AGENTS.md`：本仓库的 AI / agent 工作规则。
2. `sci-viz-case-hub/PROJECT_CONTROL.md`：Sci-Viz Case Hub 项目总控。
3. `sci-viz-case-hub/docs/README.md`：应用文档索引与归档规则。
4. `sci-viz-case-hub/docs/ARCHITECTURE_AND_DELEGATION.md`：架构、分工与风险边界。

## 根目录文档

- `AGENTS.md`：项目级 agent 指令，保持在根目录。
- `CRAWL_SOURCE_TARGETS.md`：URL 池来源清单。注意：`sci-viz-case-hub/server/src/seedPool.ts` 会读取这个固定路径，暂时不要移动。
- `视觉调研流程_人机分工.md`：视觉调研方法论与人机协作流程。
- `自动收集信息进度汇报_20260531.md`：2026-05-31 自动采集阶段汇报，属于历史进度记录。

## 文档维护规则

- 长期项目判断、架构边界和开发规则：放在 `sci-viz-case-hub/PROJECT_CONTROL.md` 或 `sci-viz-case-hub/docs/ARCHITECTURE_AND_DELEGATION.md`。
- 应用功能、实现状态、报告和 agent 计划：放在 `sci-viz-case-hub/docs/`，并同步更新 `sci-viz-case-hub/docs/README.md`。
- 脚本生成的报告先保留原路径，避免后续运行脚本时生成重复文件。
- 新增 Markdown 时优先使用日期前缀或明确主题名，避免“临时说明”“最终版2”这类名称。
