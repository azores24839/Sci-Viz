# Sci-Viz Case Hub 实现进度总结

> 更新于 2026-05-28 (17:00)

---

## 一、已完成功能

### 后端 API（7个路由模块）

| 路由 | 端点 | 说明 |
|------|------|------|
| `cases.ts` | `GET/PATCH/DELETE /api/cases`, `GET /api/cases/:id` | 案例 CRUD，11项查询参数筛选+分页，18个可更新字段 |
| `captures.ts` | `POST /api/captures` | Multer上传(50MB)，支持image_file或image_url，fire-and-forget分析触发 |
| `analysis.ts` | `POST /api/cases/:id/analyze` | 重置为pending状态，后台异步重分析 |
| `crawl.ts` | `POST /api/crawl/urls`、`GET /api/crawl/test-network` | 手动URL采集(最多20条)，URL规范化，cookie支持，网络测试 |
| `pool.ts` | 完整CRUD `/api/pool/sources`、`POST /:id/crawl`、`GET /jobs/:id` | 源池管理，异步发现→采集管道，p-limit(2)并发，冲突检测，进度轮询 |
| `collection.ts` | `/api/collection/kpis` 系列 | 分类 KPI 初始化、进度统计、缺口查询、目标更新 |
| `exportRoutes.ts` | `GET /api/export/csv`、`GET /api/export/markdown` | 21字段CSV(BOM)、Markdown逐条导出 |

### 数据库（Prisma + SQLite，4张表）

| 模型 | 字段数 | 说明 |
|------|--------|------|
| VisualCase | 36+ | `imageHash` SHA-256 精确去重；自动去重仅使用 `imageHash` 精确匹配 |
| CrawlSource | 15+ | 增加 `adapterType` / `crawlStatus` / `crawlTier` / `lastDiagnosis`，用于来源分层和降级 |
| CrawlJob | 11 | id/sourceId(FK CASCADE)/status/discoveredUrls/crawledUrls/totalCount/crawledCount/newCases/error + 时间戳，sourceId索引 |
| CollectionKpi | 9 | dimension/category/targetCount/priority/enabled/notes + 时间戳，用于分类配额 |

### 爬虫引擎

| 模块 | 功能 |
|------|------|
| `discoverLinks.ts` | 多页遍历(最多5页)，智能评分(URL模式+链接文本+结构位置)，去重，分页检测(`link[rel="next"]`/`?page=N`/`/page/N`) |
| `runUrlCrawl.ts` | fetch→redirect检测→认证墙检测(域名/关键词/标题)→图片提取管道→p-limit(2)并发→汇总 |
| `extractImagesFromPage.ts` | Cheerio解析，srcset(取最大分辨率)，data-src懒加载，figcaption上下文，占位符过滤 |
| `filterImageCandidates.ts` | 过滤data:URI/SVG/ICO/logo/icon/avatar/sprite/ads/pixel，尺寸<300x300，host黑名单 |
| `staticSourceAdapters.ts` | MIT/Harvard/Berkeley/Max Planck/Nature 静态来源选择器配置 |
| `sourceJobRunner.ts` | 统一来源采集 Job runner，支持小批量 easy crawl |

### 已补地基能力

| 能力 | 状态 | 说明 |
|------|------|------|
| URL/下载安全 | ✅ | 公网 URL 校验、私网/DNS 拦截、响应体大小限制 |
| 图片去重 | ✅ | SHA-256 精确哈希自动去重；感知哈希只保存，不自动跳过 |
| 分类 KPI | ✅ | 标准分类归一化、KPI 表、缺口统计 API |
| 候选图片评分 | ✅ | `collectionScore` / `collectionReasons`，用于采集阶段粗筛和排序 |
| 第一批好抓来源 | ✅ | MIT News - Research / Harvard Gazette / Berkeley Lab 已 dry-run 验证 |
| 来源状态 | ✅ | easy_static / needs_adapter_tuning / blocked_cloudflare / manual 等状态字段 |

### 图片处理

- 下载验证：30s超时，content-type校验，≥10KB，≥100x100
- sharp缩略图：300x200 cover，JPEG 80%
- 文件命名：`case_{uuid}_{timestamp}.{ext}` / `case_{uuid}_{timestamp}_thumb.{ext}`

### AI分析（2个服务 + 1个编排器）

| 服务 | 说明 |
|------|------|
| `ocr.ts` | 外部OCR API，环境变量配置，未配置时返回空 |
| `vision.ts` | OpenRouter qwen/qwen3-vl-8b-instruct，image→base64，10维度结构化prompt，温度0.1，未配置时返回mock |
| `analysisRunner.ts` | OCR→Vision→DB更新，confidence≥0.8→needs_review，<0.8→low_confidence_review |

### 种子数据

| 脚本 | 说明 |
|------|------|
| `seed.ts` | 3条示例VisualCase：荧光显微镜神经元/COVID-19 3D渲染/量子计算摄影 |
| `seedPool.ts` | 解析`CRAWL_SOURCE_TARGETS.md`，导入13个源到CrawlSource，幂等 |

### 前端（6个页面，10个组件）

| 页面 | 说明 |
|------|------|
| CaseList `/` | 案例列表，筛选+分页 |
| CaseDetail `/cases/:id` | 案例详情，图片/分类/评审 |
| UrlCrawlPage `/crawl` | 手动URL采集，cookie支持，网络测试 |
| ReviewPage `/review` | 评审列表，星级评分，状态筛选 |
| ExportPage `/export` | CSV/Markdown导出 |
| PoolPage `/pool` | 分类侧边栏，源卡片，采集进度弹窗(2s轮询) |

完整TypeScript类型层(229行)，14个API方法客户端。

### Chrome扩展（MV3）

- 右键菜单：保存图片/选中内容到案例库
- Popup：截图采集、图片采集、API URL配置、连接状态
- Content Script：图片筛选(naturalWidth/Height≥200，最多10张)、选区提取

---

## 二、未实现功能

### 🔴 当前5阶段计划

| 阶段 | 内容 | 状态 |
|------|------|------|
| **阶段一** | A类静态HTML源适配器 — 列表页→文章URL发现→文章页采集→图片+上下文提取→验证→入库 | ✅ 已完成 (2026-05-28) |
| | 源专属选择器配置(source_config JSON字段) | ❌ |
| | 增强图片提取：`picture source[srcset]`, `meta[og:image]`, `meta[twitter:image]` | ✅ 已修复 |
| | 上下文提取优先级：每张图关联 nearby paragraph | ✅ 已实现 |
| | 精细DOM过滤：排除 nav/header/footer/form/GTM/comments/cookie | ✅ 已增强 |
| | 修复三大管线bug：srcset逗号分割、scoped selector不匹配、skip_pattern误杀/uploads/ | ✅ 已修复 |
| **阶段二** | NASA API adapter (source_type=api) | ❌ |
| | API字段→VisualCase统一映射 | ❌ |
| **阶段三** | CERN详情页HTML adapter (source_type=gallery_html) | ❌ |
| **阶段四** | 源池状态管理(active_static/blocked_cloudflare/blocked_network/paused等) | ❌ |
| **阶段五** | 采集汇总报告(8项统计指标) | ❌ |

### 🟡 PROJECT_CONTROL.md 规划中未实施

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 用户认证 | 中 | `middleware/`已建但为空，无登录/管理员/编辑角色 |
| 云存储(OSS) | 中 | 仅本地`uploads/`，无`storage_provider`/`storage_key`字段 |
| 工作台仪表盘 | 低 | 无概览页面 |
| 视频/PDF采集 | 低 | 当前仅图片支持 |
| 批量操作 | 低 | 无多选审批/删除 |
| 定时采集 | 低 | 仅手动触发 |
| 图像去重 | 已完成 | SHA-256 完全一致才自动跳过 |
| 结构化日志/审计 | 低 | 仅console输出，无文件持久化 |
| 采集配置UI | 低 | 前端无API密钥/存储/参数设置页面 |

---

## 三、采集源现状

| 源 | 状态 | 能否入库 | 障碍 |
|----|------|---------|------|
| MIT News | ✅ 已验证 | ✅ 已入库 (12 cases) | — |
| MIT News Research | ✅ 已验证 | ✅ 可小批量入库 | 已验证端到端 |
| Harvard Gazette | ✅ 已验证 | ✅ 已入库 (15 cases) | — |
| Berkeley Lab | ✅ 已验证 | ✅ 已入库 (5 cases) | URL排除规则已添加 |
| Max Planck Society | ⚠️ 二阶段 | 暂缓批量 | 需二跳/专题页调优 |
| Nature | ⚠️ 二阶段 | 暂缓批量 | 需新闻/文章页 source-specific 调优 |
| **NASA** | ✅ API可用 | 需API adapter | 首页为React SPA |
| **CERN** | ✅ HTML可用 | 需详情页adapter | 旧REST API已404 |
| Stanford | ❌ Cloudflare拦截 | 暂缓 | Cloudflare Bot Management |
| Science | ❌ Cloudflare拦截 | 暂缓 | 同上 |
| Wikimedia | ❌ GFW阻断 | 暂缓 | 连接超时 |
| Flickr | ❌ GFW阻断 | 暂缓 | 连接超时 |
| ScienceDaily | ❌ JS动态加载 | 暂缓 | 首页无img标签 |
