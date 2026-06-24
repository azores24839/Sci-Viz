# 科研影像 AI Studio MVP 设计规格

> 日期：2026-06-24  
> 状态：待用户最终审阅  
> 首个示例：长兴海洋实验室｜科研摄影  
> 产品形态：阶段式 AI 工作台

## 1. 产品结论

科研影像 AI Studio 面向需要服务陌生科研项目的摄影、视频与宣传团队。它不替代科研人员，也不以“自动生成一份漂亮策划案”为终点，而是把混杂资料转化为可追溯、可确认、可执行的影像生产方案。

MVP 只把“科研摄影”做深，完整闭环为：

```text
混合资料进入
  → AI 理解科研项目并标注证据
  → AI 暴露不确定性与待确认问题
  → 科研人员通过轻量链接确认或修正
  → AI 生成摄影策划与画面卡
  → 摄影团队在现场逐项执行和记录
```

未来支持科研视频，但首版 UI 不开放视频项目。数据模型保留 `projectType` 与可扩展产物类型，避免后续破坏式迁移。

## 2. 目标用户与职责

### 2.1 主用户

- 科研摄影、视频与宣传团队
- 对科研内容并不天然熟悉，但需要在有限时间内理解项目并做出专业影像方案
- 负责创建项目、整理材料、调整策划、组织拍摄与记录现场完成情况

### 2.2 协作者

- 科研人员、项目负责人或实验室宣传接口人
- 不需要注册完整账号
- 通过带有效期的审核链接确认科学事实、保密边界、安全要求和关键表达

### 2.3 MVP 成功标准

- 摄影团队能在 15–30 分钟内掌握一个陌生科研项目的核心信息
- 每条关键科研结论可以追溯到资料来源或被明确标记为待确认
- 科研人员能在 10 分钟内完成一次轻量审核
- 已确认内容能直接转化为摄影策划、画面卡和现场清单
- 现场能清楚看到必拍项、完成状态和补拍项，减少漏拍
- 用户能看清当前由哪个 Agent 负责、使用了哪些输入、生成了什么产物、是否需要人工决策

## 3. MVP 范围

### 3.1 必须实现

1. 项目首页与“长兴海洋实验室”示例项目
2. 科研摄影项目类型；数据库预留视频类型
3. 混合资料入口：文件、网页链接、文本；MVP 使用预置 Mock 资料
4. 资料卡片、解析状态、来源信息和异常状态
5. 科研项目理解包：通俗解读、研究目标、关键事实、术语、人物、设备、空间、视觉机会
6. 每条关键事实的证据来源、原文片段与可信状态
7. 科学审校结果：矛盾、风险、待确认问题、保密和安全提示
8. 无需注册的科研人员审核页：确认、修改、留言
9. 摄影策划：目标、受众、核心表达、视觉概念、叙事结构、场景和风险
10. 画面卡：表达目的、拍摄对象、景别、机位、构图、光线、动作、科学信息、参考图、优先级
11. 现场拍摄清单：未拍、已拍、需补拍、备注、文件编号、临时新增
12. 四个可见 Agent 的角色、头像占位、职责、状态、输入、输出和运行记录
13. 黑、白、`#2569ED` 设计系统
14. 版本记录、审计记录和确定性的 Mock Agent 工作流
15. 响应式桌面工作台；现场执行页面兼容手机宽度

### 3.2 明确不做

- 真实论文/PDF/PPT 内容解析
- 真实大模型调用与计费
- AI 生图或高质量分镜图生成
- 原始照片上传、选片、修图和后期交付
- PDF 导出
- 视频脚本、采访提纲、时间码和视频分镜
- 完整团队账号、组织权限和商业计费
- 多 Agent 自由讨论或聊天表演
- 复杂无限画布和可视化工作流编辑器
- 对现有 `sci-viz-case-hub` 的结构重构

## 4. 信息架构与页面

### 4.1 全局结构

桌面工作台采用三栏结构：

```text
左侧：四阶段项目流程与完成度
中间：当前阶段的结构化产物与编辑区
右侧：负责 Agent、运行状态、证据与待处理事项
```

左侧是用户理解项目进度的主导航，不暴露底层节点图。中间永远呈现“可编辑产物”，而不是长篇聊天记录。右侧解释 AI 在做什么，并提供局部重新生成或查看依据的入口。

### 4.2 四阶段工作流

#### 阶段一：理解项目

页面区块：

- 资料概览：文件、网页、文字材料和解析状态
- 一句话理解
- 通俗解读
- 研究目标与价值
- 关键科研事实
- 术语表
- 人物、设备、空间、实验对象
- 值得拍摄的视觉机会
- 来源抽屉：来源页面、原文片段、访问日期、可信状态

完成门槛：资料已就绪，理解包已生成，科学审校已运行。

#### 阶段二：确认事实

页面区块：

- 待确认问题
- 资料之间的矛盾或缺口
- 可公开、需谨慎、禁止公开
- 现场安全与伦理提示
- 审核链接状态
- 科研人员确认、修正和留言记录

完成门槛：所有阻塞级问题已确认、修正或由项目负责人明确接受风险。

#### 阶段三：摄影方案

页面区块：

- 摄影目标与受众
- 核心传播信息
- 视觉概念与关键词
- 视觉叙事顺序
- 场景、人物和设备安排
- 画面卡网格
- 参考案例
- 风险、禁拍和备选方案

完成门槛：方案已生成，至少一张必拍画面卡存在，项目负责人标记“可执行”。

#### 阶段四：现场执行

页面区块：

- 完成度与必拍覆盖率
- 按场景分组的拍摄清单
- 每项状态：未拍、已拍、需补拍
- 文件编号与现场备注
- 临时新增画面
- 补拍项聚合

完成门槛：所有必拍项为“已拍”，或对未完成项记录原因。

### 4.3 页面清单

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 项目列表 | 示例项目、状态、进度、最近更新 |
| `/projects/new` | 新建项目 | 首版只开放科研摄影 |
| `/projects/:id/understand` | 理解项目 | 资料与理解包 |
| `/projects/:id/review` | 确认事实 | 审校与审核链接 |
| `/projects/:id/plan` | 摄影方案 | 策划和画面卡 |
| `/projects/:id/capture` | 现场执行 | 可移动端使用的清单 |
| `/review/:token` | 外部审核 | 科研人员轻量审核页 |

## 5. Agent 设计

### 5.1 用户可见角色

| Agent | 负责 | 不负责 |
| --- | --- | --- |
| 科研分析师 | 资料归纳、通俗解释、术语、事实、视觉机会 | 判断事实最终正确、生成摄影方案 |
| 科学审校员 | 查证依据、发现矛盾、标注不确定性、生成确认问题 | 补写缺失事实、替科研人员做最终决定 |
| 影像策划师 | 摄影目标、核心表达、视觉概念、叙事结构、场景安排 | 具体机位参数、科学事实裁决 |
| 摄影指导 | 画面卡、构图、景别、光线、动作、必拍清单 | 改写已确认的科学事实 |

### 5.2 角色边界原则

- “科研分析师”负责把内容讲明白；“科学审校员”负责确保没有讲错
- Agent 是工作流角色，不承诺使用四个不同模型
- MVP 使用同一个 `MockModelGateway`，通过独立任务定义、输入结构和输出 Schema 体现角色差异
- Agent 输出必须通过 Schema 校验后才能写入产物版本
- Agent 不直接覆盖用户修改，只创建新版本或局部建议
- 阻塞级科学问题未确认时，摄影方案可以预览但不能标记为“可执行”

### 5.3 Agent 状态

```text
idle → queued → running → awaiting_human → completed
                         ↘ failed → retrying
```

UI 显示：

- 当前状态与开始时间
- 本次使用的输入资料数量
- 输出产物及版本
- 失败原因和重试入口
- 需要人工确认的数量
- Mock 模式标识，避免用户误以为内容已由真实模型分析

### 5.4 头像资产契约

用户后续将头像放入：

```text
sci-viz-studio/apps/web/public/agents/
├── research-analyst.png
├── science-reviewer.png
├── visual-planner.png
└── photography-director.png
```

图片建议：正方形 PNG/WebP，至少 512×512，文件大小不超过 1 MB。文件缺失时使用角色中文首字作为占位。

## 6. 长兴海洋实验室示例数据

### 6.1 事实来源

示例内容以公开资料为基础，不把未经确认的信息写成事实。主要来源：

- 上海交通大学长兴海洋实验室单位概况：`https://cxo.sjtu.edu.cn/gywm/dwgk.htm`
- 当前仓库已采集的长兴相关图片与 `image_sources.json`
- 现有案例库中已审核的相关案例（通过只读接口或 Fixture 映射）

### 6.2 可直接作为 Mock 事实的内容

- 实验室面向海洋装备领域建设，是有组织科研集中区和准工业化实验室
- 围绕高端海洋装备研发，连接基础研究、应用研究与产业转化
- 布局智能制造、智能装备、绿色动力、深海装备四大研发方向
- 已建设中小组立无人产线、智能焊接、深海管缆试验、MEMS 传感器、综合电力系统、波浪补偿栈桥、绿色动力系统验证等平台

### 6.3 必须以“待确认”呈现的示例

- 哪些平台在实际拍摄日期可运行
- 哪些设备内部结构、控制屏幕和实时数据可以公开
- 是否可以安排科研人员进行演示性操作
- 是否存在安全培训、防护装备或拍摄距离要求
- 项目最希望对外传播的单一核心成果是什么
- 哪些表述可以使用“领先”“首创”等评价词

### 6.4 示例摄影方向

- “从实验室到海洋装备现场”的工程放大过程
- 人与大型装备之间的尺度关系
- 智能制造产线的秩序、重复与精度
- 传感器、焊接、管缆等细节与准工业化空间的对照
- 科学家与工程师协作，而非仅拍摄会议或站立合影

示例画面只作为策划 Mock，不宣称拍摄条件已经获得实验室确认。

## 7. 技术架构

### 7.1 仓库边界

当前工作区存在大量未提交的案例库改动和采集资产。MVP 必须新建兄弟目录，禁止为了新项目重构现有应用：

```text
科研影像/
├── sci-viz-case-hub/        # 现有案例库，不改动
├── sci-viz-studio/          # 新 MVP
└── docs/superpowers/        # 设计与计划
```

### 7.2 模块化单体

首版不采用多个独立微服务。使用一个 npm workspace、一个 API 代码库和两个运行入口：

```text
sci-viz-studio/
├── apps/
│   ├── web/                 # React + TypeScript + Vite
│   └── server/              # HTTP API 与后台 Worker 两个入口
├── packages/
│   ├── domain/              # 领域类型、状态机和业务规则
│   ├── contracts/           # API / Agent Zod Schema
│   ├── ai-workflows/        # 工作流定义与 ModelGateway
│   └── design-system/       # Token 与通用组件
├── fixtures/                # 长兴示例与 Mock Agent 输出
├── prisma/                  # PostgreSQL Schema 与迁移
├── docker-compose.yml       # 本地 PostgreSQL
└── package.json             # npm workspaces
```

HTTP API 与 Worker 共用领域和数据访问层，但以两个进程运行。未来任务量增加时可独立扩容，无需先承受微服务通信和多仓管理成本。

### 7.3 技术选型

- Node.js LTS；通过 `.nvmrc` 固定版本，不使用当前机器的非 LTS Node 24 作为项目契约
- npm workspaces，避免和现有 npm 项目混用 pnpm/yarn
- React + TypeScript + Vite
- React Router 管理阶段路由
- TanStack Query 管理服务端状态，不把 API 数据散落在组件状态中
- Fastify 提供 HTTP API，Zod 统一输入输出校验
- PostgreSQL 保存项目、版本、运行和审计数据
- Prisma 使用正式 migration，不使用 `db push` 作为长期迁移机制
- PostgreSQL 任务队列优先使用 `pg-boss`，不额外引入 Redis
- Vitest、Testing Library 和 Playwright

### 7.4 为什么修订原方案

| 原方案风险 | 修订 |
| --- | --- |
| Web、API、Worker 三个独立服务过早拆分 | 一个 Server workspace、两个运行入口 |
| 为任务队列额外维护 Redis | 使用 PostgreSQL 持久队列 |
| Mock 数据直接写进页面组件 | 独立 Fixture 与 Mock Gateway |
| 直接读取案例库 SQLite | 只读 API/Fixture Adapter |
| Agent 输出自由文本，后续难迁移 | Zod Schema + 产物版本 |
| 重新生成覆盖人工修改 | 新版本 + 差异确认 |
| 当前仓库脏改动被误触 | 新兄弟目录，现有项目零改动 |

### 7.5 MVP 运行边界

首版是本地或受控演示环境，不直接作为公网生产系统发布。内部工作台使用单一演示工作区，不实现登录与组织权限；只有外部审核页使用受限令牌访问。任何公网部署必须先补齐用户认证、工作区授权、速率限制、文件隔离、密钥管理和生产备份，不能把“本地可运行”误当成“已具备生产安全性”。

## 8. 核心数据模型

所有业务表包含 `id`、`createdAt`、`updatedAt`。需要排序的对象使用显式 `position`，不依赖创建时间。

### 8.1 Workspace

- `name`
- MVP 只有一个默认工作区，但项目从第一天带 `workspaceId`

### 8.2 Project

- `workspaceId`
- `name`
- `projectType`: `PHOTO | VIDEO`
- `status`: `DRAFT | UNDERSTANDING | REVIEWING | PLANNING | CAPTURING | COMPLETED`
- `currentStage`
- `description`
- `mockMode`

### 8.3 SourceDocument

- `projectId`
- `kind`: `FILE | URL | TEXT`
- `title`
- `sourceUrl`
- `storageKey`
- `mimeType`
- `parseStatus`
- `sourceDate`
- `metadataJson`

MVP Fixture 可以模拟 PDF、PPT、网页和访谈记录，但 UI 必须明确标注“示例资料”。

### 8.4 KnowledgeClaim

- `projectId`
- `text`
- `category`
- `confidence`: `SUPPORTED | INFERRED | NEEDS_CONFIRMATION | DISPUTED`
- `riskLevel`: `INFO | WARNING | BLOCKER`
- `sourceDocumentId`
- `sourceExcerpt`
- `sourceLocator`
- `confirmedBy`
- `confirmedAt`

禁止只有一个模糊的浮点“可信度”；用户需要可解释的状态。

### 8.5 ReviewQuestion

- `projectId`
- `claimId`
- `question`
- `reason`
- `severity`
- `status`: `OPEN | CONFIRMED | CORRECTED | ACCEPTED_RISK`
- `response`
- `reviewerName`

### 8.6 ReviewLink

- `projectId`
- `tokenHash`：数据库只保存哈希
- `expiresAt`
- `revokedAt`
- `lastAccessedAt`

访问令牌出现在 URL，但不以明文落库；默认有效期 7 天，可撤销。

### 8.7 Artifact / ArtifactVersion

- `Artifact`: 项目、类型、当前版本
- `ArtifactVersion`: 版本号、结构化内容、生成来源、创建人、AgentRun、变更说明
- 产物类型：`UNDERSTANDING_BRIEF | SCIENCE_REVIEW | PHOTO_PLAN | SHOT_BOARD`

AI 重新生成时创建新版本；用户可以保留当前版本或采纳新版本。

### 8.8 ShotCard

- `projectId`
- `title`
- `purpose`
- `subject`
- `scene`
- `shotSize`
- `cameraAngle`
- `composition`
- `lighting`
- `action`
- `scienceMessage`
- `safetyNotes`
- `priority`: `MUST | SHOULD | OPTIONAL`
- `referenceCaseId`
- `referenceImageUrl`
- `position`

### 8.9 CaptureItem

- `shotCardId`
- `status`: `NOT_STARTED | CAPTURED | RESHOOT`
- `fileReference`
- `notes`
- `completedAt`

### 8.10 AgentRun

- `projectId`
- `agentRole`
- `taskType`
- `status`
- `inputVersion`
- `outputArtifactVersionId`
- `promptVersion`
- `modelProvider`
- `modelName`
- `mockMode`
- `startedAt` / `finishedAt`
- `errorCode` / `errorMessage`
- `attemptCount`

### 8.11 AuditEvent

- `projectId`
- `actorType`: `USER | REVIEWER | AGENT | SYSTEM`
- `actorId`
- `action`
- `entityType` / `entityId`
- `beforeJson` / `afterJson`

## 9. API 边界

API 使用 `/api/v1` 前缀。路由只负责鉴权、校验和调用用例，不在 Controller 中编写业务规则。

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
GET    /api/v1/projects/:id/sources
POST   /api/v1/projects/:id/sources
POST   /api/v1/projects/:id/runs/:taskType
GET    /api/v1/projects/:id/runs
GET    /api/v1/projects/:id/claims
PATCH  /api/v1/claims/:id
GET    /api/v1/projects/:id/review-questions
POST   /api/v1/projects/:id/review-links
GET    /api/v1/review/:token
POST   /api/v1/review/:token/responses
GET    /api/v1/projects/:id/artifacts/:type
POST   /api/v1/artifacts/:id/versions/:versionId/activate
GET    /api/v1/projects/:id/shot-cards
PATCH  /api/v1/shot-cards/:id
PATCH  /api/v1/capture-items/:id
POST   /api/v1/projects/:id/capture-items
```

现有案例库通过 `CaseReferenceProvider` 抽象：

```text
FixtureCaseReferenceProvider  # MVP 默认
HttpCaseReferenceProvider     # 后续连接 case-hub 只读 API
```

Studio 不依赖案例库数据库结构。

## 10. 工作流与错误处理

### 10.1 工作流

```text
seed_sources
  → analyze_project
  → review_science
  → await_human_review
  → generate_photo_plan
  → generate_shot_cards
  → prepare_capture_list
```

每个节点：

- 输入为带版本的结构化对象
- 输出必须通过 Schema 校验
- 使用幂等键，重复点击不会创建重复产物
- 状态写入数据库后再向 UI 返回成功
- 失败保留错误代码、重试次数和原始输入版本
- 人工修改后重新生成时，必须明确基于哪个版本

### 10.2 Mock Agent 行为

- 使用固定 Fixture 生成长兴示例结果
- 运行时模拟短暂排队和逐阶段状态变化，但测试中使用即时模式
- 输出内容可重复，避免每次演示发生随机变化
- UI 明确显示“Mock AI”
- `ModelGateway` 接口保留 `generateStructured(task, input, schema, context)`，后续真实模型只增加 Adapter

### 10.3 错误体验

- 单个 Agent 失败不清空已有产物
- 用户可以重试当前任务，不需要从第一步重来
- 来源缺失时显示“无法验证”，不显示虚构引用
- 外部审核链接过期或撤销时给出明确状态，不泄露项目内容
- 网络失败后的编辑内容保存在本地草稿，恢复后提示重新提交
- 现场清单更新使用乐观 UI，失败时回滚并提示

## 11. 视觉与交互系统

### 11.1 色彩

核心色：

```css
--black: #000000;
--white: #FFFFFF;
--blue-600: #2569ED;
```

允许中性灰用于层级：

```css
--gray-950: #111318;
--gray-700: #454B57;
--gray-500: #737B8C;
--gray-300: #D4D8E1;
--gray-100: #F2F4F7;
--gray-50:  #F8F9FB;
```

规则：

- 蓝色仅用于主操作、当前阶段、链接、选中状态和运行中的 Agent
- 成功、警告和错误状态使用图标、文字和中性底色共同表达，不只依赖颜色
- 大面积背景以白色和浅灰为主，黑色用于文字和关键结构
- 普通正文和背景满足 WCAG AA 对比度

### 11.2 字体与密度

- 中文优先系统无衬线字体，数字与英文保持清晰
- 工作台以 14–16 px 正文为主，不采用过小的后台管理界面字号
- 卡片圆角克制，避免消费级 AI 产品的过度渐变和发光效果
- 信息密度高但分组明确，保持专业工具感

### 11.3 关键组件

- `StageRail`：阶段、状态、完成度、阻塞数
- `AgentCard`：头像、角色、当前任务、状态、最近产物
- `SourceCard`：资料类型、解析状态、来源
- `EvidenceBadge`：已支持、推断、待确认、争议
- `ClaimCard`：事实、证据、风险、确认状态
- `ReviewQuestionCard`：问题、原因、回复、结果
- `ArtifactSection`：结构化产物区块、版本、编辑和重新生成
- `ShotCard`：画面设计与参考图
- `CaptureChecklistItem`：现场状态、备注和文件编号
- `RunTimeline`：Agent 运行与人工交接记录

## 12. 安全与隐私

- Mock 阶段不上传真实敏感科研资料
- 后续文件上传必须做 MIME/文件头校验、大小限制、恶意文件隔离和访问控制
- 网页抓取沿用案例库已有的公网 URL 与私网地址拦截原则，但代码在 Studio 中独立封装
- 审核令牌随机生成、只存哈希、默认 7 天过期、支持撤销
- 外部审核页只返回问题和关联事实，不返回整个项目资料库
- 日志不记录审核 token、原始敏感文本或模型密钥
- 所有写操作进入审计记录
- Mock 模式和真实模式在数据与 UI 上均显式区分

## 13. 测试策略

### 13.1 单元测试

- 项目阶段状态机
- 阻塞级问题对“可执行”状态的限制
- Agent 状态转换
- 产物版本激活规则
- 审核令牌哈希、过期和撤销
- 画面卡与现场清单映射
- Zod Schema 对非法 Mock 输出的拒绝

### 13.2 集成测试

- 长兴 Fixture Seed 后的数据完整性
- 从分析到审校再到摄影方案的工作流
- 重复任务幂等
- Agent 失败与重试
- 外部审核回复更新问题与事实状态
- 人工编辑后重新生成不会覆盖当前版本
- CaptureItem 状态与完成度统计

### 13.3 前端测试

- 四阶段导航和阻塞提示
- Agent 状态展示
- 证据抽屉
- 审核问题确认、修正和留言
- 画面卡编辑
- 现场状态切换及失败回滚

### 13.4 Playwright 验收路径

1. 打开项目列表并进入长兴示例
2. 查看四种 Mock 资料和科研理解包
3. 打开一条事实的来源证据
4. 运行或查看科研分析师与科学审校员记录
5. 创建审核链接并进入外部审核页
6. 修正一个问题、确认一个问题并提交
7. 返回项目，确认阻塞数变化
8. 进入摄影方案，查看策划和画面卡
9. 编辑一张画面卡并保留版本
10. 进入现场执行，完成必拍项、标记补拍项并添加备注
11. 在移动端宽度验证现场页面

## 14. 可维护性守则

- 页面组件不直接访问数据库或调用模型
- 业务规则只存在于 `domain`，不复制到前后端多个位置
- API、Fixture 和 Agent 输出共享契约 Schema
- 单文件原则上不超过一个明确职责；复杂页面拆成 feature 模块
- 不把所有项目状态塞进单一 JSON；可版本化产物可用 JSON，核心查询状态保持规范化字段
- 数据库变更必须通过 migration 和回滚说明
- Prompt/任务定义带版本号，AgentRun 记录所用版本
- 所有外部服务通过 Adapter 接口接入
- Mock 与真实实现使用相同接口，禁止组件内出现大量 `if (mock)`
- 不改动现有案例库代码来迁就 Studio

## 15. 验收标准

MVP 完成必须同时满足：

- 新项目位于 `sci-viz-studio/`，现有案例库工作区改动未被覆盖
- 一条命令可以启动 Web、API、Worker 和 PostgreSQL，或文档明确分两步启动基础设施与应用
- 数据库能从空库执行 migration 和 seed
- 长兴示例包含资料、事实、待确认问题、审核回复、摄影方案、画面卡和现场清单
- 四个 Agent 的头像占位、角色和状态在 UI 中清晰可见
- 用户能完成四阶段主路径，不依赖手工修改数据库
- 外部审核链接可以完成确认和修正
- 画面卡可以编辑，现场状态可以持久化
- 黑、白、`#2569ED` 视觉体系贯穿核心页面
- 桌面工作台与移动端现场页通过浏览器验收
- 单元、集成、前端和端到端关键测试通过
- README 说明架构、启动、测试、Mock/真实 AI 边界和头像放置方式
- 完成逐项需求审计，无显式需求缺失或仅靠截图假定完成

## 16. 后续扩展路径

在摄影 MVP 验证后，按顺序扩展：

1. 真实模型 Adapter 与真实文档解析
2. 与案例库只读 API 联通
3. 科研视频项目：叙事大纲、脚本、采访、分镜和镜头时长
4. 实拍素材上传、元数据、AI 覆盖检查和补拍建议
5. 团队账号、机构空间、权限与商业计费

视频扩展复用 Project、SourceDocument、KnowledgeClaim、ReviewQuestion、Artifact、AgentRun 和 AuditEvent，只新增视频专属产物与镜头字段。
