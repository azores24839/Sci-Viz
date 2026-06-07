# 科研影像 - 项目指南

## 项目概述
这是科研影像视觉调研项目，目标是建立科学可视化案例库并进行风格谱系分析。
核心是 `sci-viz-case-hub/`（Node.js Web应用），辅以 Python 爬虫和处理脚本。

## 技术栈
- Web应用：Node.js (sci-viz-case-hub/)
- 数据采集：Python (scrape_all_journals.py, scrape_nature_covers.py)
- 数据库：SQLite（案例数量以实时数据库统计为准，不在长期文档中写死）
- 图像处理：感知哈希去重、视觉分析
- 测试：Playwright (sci-viz-case-hub/.playwright-cli/)

## 三轴分类标准口径
长期分析以三轴为主，不把旧字段、采集方式或自由 tag 混入三轴结论。

| 维度 | 字段 | 核心问题 | 类别 |
| --- | --- | --- | --- |
| 功能维度 | `functionalPurpose` | 影像为什么存在 / 用来做什么 | 记录、解释、数据、展示、传播、交互 |
| 媒介维度 | `distributionMedium` | 影像以什么形式呈现 | 静图、动图、视频、图组、交互、实体 |
| 技术维度 | `technicalMethod` | 影像通过什么方式生产 | 拍摄、成像、绘设、数据、渲染、生成 |

辅助字段边界：
- `mediaType` 是旧的呈现方式字段，混合了技术、风格和媒介线索，只作辅助筛选或迁移参考。
- `contentType` 是内容对象/题材线索，不属于三轴。
- `discipline` 是学科分层维度，不属于三轴。
- `captureType`、`检索补采`、`浏览器截图` 等属于采集方式或处理方式，不能写入技术维度结论。

## 任务路由规则（主agent自动判断）
遇到以下任务时，优先派出subagent：
- 搜索代码库中的函数/类/模式 → @explore
- 阅读日志、汇总测试结果、查看文件内容 → @explore
- 查找外部库文档或API用法 → @scout
- 资料整理、数据格式转换、批量文本处理 → @general
- 网页抓取脚本编写或调试 → @general（框架已定，主要是参数调整）
- 数据库查询/统计/导出 → @general

主agent自己处理（GLM-5.1）：
- 新的架构设计或功能开发
- 复杂bug修复
- 分析报告撰写
- 编码本/方法论设计（阶段0-6中的关键决策）
- 任何涉及项目方向性判断的任务

## 当前项目状态
详见 `docs/superpowers/harness/2026-06-02-execution-harness.md`

### 刚刚完成
- ✅ 国内扩展：7 所大学（浙大/哈工大/华科/北航/西交/东南/北理工）爬虫适配器已写入 `staticSourceAdapters.ts`
- ✅ 7 所大学域名已加入 `COMPARISON_GROUPS.domestic`，对比页可见

### 待办
1. 启动开发服务器 → seed 7 所大学的 CrawlSource → 执行爬虫获取数据
2. 检查 C1 企业爬虫适配器结果
3. D-cross 2: 三轴频谱可视化
4. A4: 人工抽检三轴标注
