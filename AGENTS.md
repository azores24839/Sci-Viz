# 科研影像 - 项目指南

## 项目概述
这是科研影像视觉调研项目，目标是建立科学可视化案例库并进行风格谱系分析。
核心是 `sci-viz-case-hub/`（Node.js Web应用），辅以 Python 爬虫和处理脚本。

## 技术栈
- Web应用：Node.js (sci-viz-case-hub/)
- 数据采集：Python (scrape_all_journals.py, scrape_nature_covers.py)
- 数据库：SQLite (已入库2837条案例)
- 图像处理：感知哈希去重、视觉分析
- 测试：Playwright (sci-viz-case-hub/.playwright-cli/)

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
