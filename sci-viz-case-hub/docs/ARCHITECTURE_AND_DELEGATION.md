# Sci-Viz Case Hub 架构与任务分工接力文档

> 面向后续 AI / 开发者。先读 `PROJECT_CONTROL.md`，再读 `docs/README.md`，最后读本文。本文用于说明当前项目最重要的地基、哪些工作必须由高级工程判断把关、哪些可以拆给低成本 AI 执行。

---

## 1. 产品判断基准

Sci-Viz Case Hub 不是普通图库，也不是越爬越好的爬虫系统。它的目标是：

```text
把科研相关视觉材料转化为可追溯、可分类、可复核、可评分、可导出的结构化案例库。
```

因此，所有自动采集、AI 分析、UI、数据库字段和导出功能，都要服务于：

```text
高质量来源
明确来源与上下文
分类覆盖均衡
人工复核高效
沉淀 4-5 分高价值案例
```

不要为了“多抓图片”牺牲数据质量。不要把系统做成无边界全网爬虫。

---

## 2. 当前已打好的地基

### 2.1 采集安全与稳定性

相关文件：

```text
server/src/utils/httpSafety.ts
server/src/services/image.ts
server/src/routes/crawl.ts
server/src/crawler/runUrlCrawl.ts
```

已完成：

```text
公网 http/https URL 校验
私网/localhost/DNS 指向私网拦截
远程响应体大小限制
图片真实格式校验
远程图片保存本地副本
上传扩展名归一化
```

后续 AI 不应绕过这些工具直接 `fetch(url)` 下载外部资源。所有外部网页/图片请求必须走安全工具或现有 crawler 服务。

### 2.2 图片去重

相关文件：

```text
server/src/services/image.ts
server/src/services/dedupe.ts
server/src/routes/captures.ts
server/src/crawler/runUrlCrawl.ts
server/src/backfillImageHashes.ts
server/prisma/schema.prisma
```

已完成：

```text
imageHash: SHA-256 精确去重
插件/手动采集入库前查重
爬虫入库前查重
重复时删除刚保存的新文件
历史本地图片哈希回填
```

当前自动去重只允许跳过 `imageHash` 完全相同的图片。后续任何新增入库路径，都必须在写入 `VisualCase` 前做精确哈希去重。

### 2.3 分类 KPI 配额

相关文件：

```text
server/src/services/taxonomy.ts
server/src/services/collectionKpi.ts
server/src/routes/collection.ts
web/src/types/index.ts
web/src/api/index.ts
server/prisma/schema.prisma
```

已完成：

```text
CollectionKpi 表
标准分类体系
分类归一化
KPI 进度统计 API
缺口最大的类别查询 API
```

KPI 判断必须使用标准分类，不要直接把 AI 的任意输出当统计维度。数据库里已经出现过组合分类和漂移分类，例如：

```text
纪实 / 科技
地球科学
卫星遥感图
科研人员 / 实验设备
```

这些应归一化后再进入配额判断。

### 2.4 静态来源适配器

相关文件：

```text
server/src/crawler/staticSourceAdapters.ts
server/src/crawler/discoverLinks.ts
server/src/crawler/extractImagesFromPage.ts
server/src/crawler/sourceJobRunner.ts
server/src/routes/pool.ts
```

已完成第一批：

```text
MIT News - Research
Harvard Gazette
Berkeley Lab News Center
```

已验证这些来源可以发现文章链接，并从文章页提取主图/正文图。当前适合小批量采集，不适合无上限大跑。

暂缓/二阶段：

```text
Max Planck: 需要二跳/专题页调优
Nature: 需要 source-specific 细调
Stanford / Science: Cloudflare 或强反爬，暂时 manual_only / 插件兜底
NASA: 应优先 API adapter
CERN: 应做详情页 HTML adapter
```

### 2.5 候选图片价值评分

相关文件：

```text
server/src/crawler/collectionScoring.ts
server/src/crawler/runUrlCrawl.ts
server/prisma/schema.prisma
```

已完成第一版：

```text
collectionScore: 0-100 采集候选分
collectionReasons: JSON 数组，记录加减分原因
每页候选图先评分排序
默认每页最多处理前 5 张候选
明显低价值图低于 35 分跳过
```

重要原则：

```text
collectionScore 不是最终质量评分
collectionScore 只用于采集阶段粗筛和排序
最终是否保留仍由人工复核和 rating 决定
规则必须保守，宁可多留，不要误杀科研图
```

当前评分主要参考：

```text
来源可信度
图片尺寸
是否有 alt / caption / nearby context
页面是否有科研关键词
图片上下文是否包含显微、模型、图解、设备、实验等视觉价值关键词
是否命中 logo / icon / avatar / social / banner 等低价值模式
```

---

## 3. 我作为高级程序员应优先负责的部分

这些是地基、架构边界或高风险逻辑，不建议交给便宜 AI 独立做。

### 3.1 采集架构与 adapter 设计

我负责：

```text
定义 adapter 接口
决定 static_html / api / browser_render / manual_only 分层
决定来源状态机
控制采集边界、并发、失败降级
确保 source-specific 逻辑不会污染通用爬虫
```

原因：这里一旦设计坏，后面会出现大量低质量图片、重复数据、错误来源和难以维护的一次性脚本。

### 3.2 数据模型演进

我负责：

```text
VisualCase 核心字段
CrawlSource / CrawlJob / CollectionKpi
未来 CollectionPlan
未来 storage provider 抽象
去重字段与索引
迁移兼容策略
```

原则：新增字段必须向后兼容，不破坏已有案例库。

### 3.3 去重、质量评分、KPI 决策

我负责：

```text
精确/近似去重策略
collection_score 设计
分类归一化
KPI 缺口驱动采集
达到配额后的停止/降级策略
```

原因：这是“从抓图工具升级为策展系统”的核心。

### 3.4 反爬与采集降级策略

我负责：

```text
判断哪些站点应走 API
哪些可 static HTML
哪些需要 browser render
哪些必须 manual/plugin 兜底
不要硬破 Cloudflare/登录/订阅墙
```

原则：系统应该知道“这个源为什么不能自动采”，而不是无限失败。

### 3.5 安全、备份、部署地基

我负责：

```text
简单登录/权限边界
SQLite 备份策略
uploads 与 DB 成对备份
OSS storage provider 抽象
环境变量和 API key 管理
```

内部工具不需要重型安全平台，但不能后台裸奔。

---

## 4. 可以拆给低成本 AI 的工作

这些任务相对机械，适合给其他 AI 做，但必须提供明确输入、输出和验收标准。

### 4.1 来源 adapter 填配置

适合外包：

```text
为某个静态 HTML 来源补 articleLinkSelectors
补 contentSelectors / imageSelectors / titleSelectors
补 excludeSelectors
写 dry-run 结果摘要
```

不适合外包：

```text
改变 adapter 总接口
改变通用 discoverLinks 行为
新增无边界爬虫逻辑
绕过 httpSafety 直接请求外部资源
```

验收：

```text
dry-run 能发现 3-10 个真实文章页
文章页能提取主图或正文图
无 logo/icon/share 图片为主
server npm run build 通过
```

### 4.2 前端展示和表格页面

适合外包：

```text
KPI 进度页面
来源池状态 badge
采集 job 详情展示
高价值案例页面
批量按钮 UI
```

验收：

```text
不改 API 语义
不新增 mock 数据污染真实逻辑
web npm run build 通过
移动端不崩，桌面信息密度合理
```

### 4.3 文档维护

适合外包：

```text
README 操作说明
联调清单
每个 adapter 的测试记录
来源池诊断表
```

验收：

```text
命令可复制执行
说明贴合当前代码
不要写不存在的功能
```

### 4.4 低风险脚本

适合外包：

```text
统计当前分类数量
导出 KPI 缺口 CSV
检查 uploads 孤儿文件
列出重复候选报告
```

验收：

```text
只读优先
写操作必须有 dry-run
不删除文件，除非用户明确要求
```

---

## 5. 后续任务分层计划

### 阶段 A：当前最该完成的地基

由高级工程负责：

```text
CollectionPlan 数据模型
collection_score 评分函数
采集前 KPI 决策：达标类别跳过普通候选
来源状态机固化
NASA API adapter
CERN HTML detail adapter
简单登录和备份
```

可交给其他 AI：

```text
KPI 前端页面
来源池状态展示
adapter dry-run 文档
现有 README 更新
```

### 阶段 B：扩大好抓来源

由高级工程负责：

```text
确定每个来源适合的 adapterType
检查反爬/版权/来源质量
定义每个来源的抓取配额
```

可交给其他 AI：

```text
为 MIT News 普通首页补 selector
为 Harvard 不同栏目补 selector
为 Berkeley Lab all-news 做列表过滤
为 Max Planck 做二跳 dry-run
为 Nature 新闻页做 dry-run
```

### 阶段 C：复核效率

由高级工程负责：

```text
复核状态流设计
批量操作的后端语义
高价值案例沉淀规则
```

可交给其他 AI：

```text
复核页面 UI 优化
高价值案例页面
筛选控件
导出字段展示优化
```

---

## 6. 给后续 AI 的硬规则

后续 AI 接手任务前必须：

```text
1. 先读 PROJECT_CONTROL.md
2. 再读本文
3. 再读相关代码文件
4. 不要凭想象改接口
5. 不要大规模重构
6. 不要绕过去重、安全下载、KPI 分类归一化
7. 修改后必须说明改了哪些文件、怎么验证、还剩什么问题
```

如果任务涉及以下内容，必须交回高级工程判断：

```text
数据库核心字段
采集状态机
去重策略
KPI/评分算法
外部下载安全
登录和部署
OSS 存储
反爬处理
AI prompt 结构化输出格式
```

---

## 7. 当前建议的下一步

高级工程继续做：

```text
1. CollectionPlan 模型
2. collection_score
3. 采集前 KPI 缺口判断
4. NASA API adapter
```

可以分给其他 AI：

```text
1. 做 KPI 页面
2. 给 PoolPage 显示 crawlStatus / crawlTier
3. 为 MIT/Harvard/Berkeley 写 dry-run 测试记录
4. 更新 README 的“如何小批量试抓”
```

当前不要做：

```text
不要大规模抓取
不要强行绕过 Cloudflare
不要在没有 storage provider 设计前切 OSS
不要把 AI 输出的新分类直接扩进 KPI
```
