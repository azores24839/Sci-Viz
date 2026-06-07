# Sci-Viz Case Hub — 执行框架

> **用途：** 把当前项目状态装进一个文件，任何 agent 读完后就能直接上手干活。
> **刷新时机：** 每次完成一个阶段/任务后更新本文件。

---

## 一、项目结构

```
科研影像/
├── AGENTS.md               ← 任务路由规则（主 agent / subagent 分工）
├── docs/superpowers/
│   ├── harness/             ← ← 本文件所在目录
│   ├── specs/               ← 设计文档 / 报告
│   └── plans/               ← 实现计划
├── sci-viz-case-hub/        ← Web 应用（Node.js + Express + React）
│   ├── server/
│   │   ├── prisma/dev.db    ← SQLite 数据库
│   │   ├── src/
│   │   │   ├── routes/insights.ts        ← 分析 API（含 comparison 端点）
│   │   │   ├── scripts/backfillSubTypes.ts ← A3 补标脚本
│   │   │   ├── crawler/                  ← 爬虫适配器
│   │   │   └── services/taxonomy.ts      ← 分类定义
│   │   └── ...
│   └── web/
│       ├── src/
│       │   ├── pages/
│       │   │   ├── InsightsPage.tsx       ← 数据分析页
│       │   │   ├── ComparisonPage.tsx     ← 三栏对比页（独立路由）
│       │   │   ├── CaseList.tsx           ← 案例列表
│       │   │   ├── CaseDetail.tsx         ← 案例详情
│       │   │   ├── ReviewPage.tsx         ← 处理工作台
│       │   │   └── PoolPage.tsx           ← 采集来源
│       │   ├── App.tsx          ← 路由 + 导航
│       │   ├── api/index.ts     ← API 方法
│       │   ├── types/index.ts   ← 类型定义
│       │   └── theme.ts         ← 主题色
│       ├── package.json
│       └── tsconfig.json
│   ├── package.json           ← 根 scripts（dev / dev:server / dev:web）
│   └── ...
```

---

## 二、数据库状态

| 指标 | 数值 |
|------|------|
| 总案例数 | 3,400 |
| 已入库 (approved) | 3,347 |
| 交大来源 | 317 |
| 交大已入库 | 97 |
| 覆盖来源域名 | 57 |
| 已入库域名 | 51 |

**三轴标注率：**

| 字段 | 标注率 |
|------|--------|
| functionalPurpose（功能用途） | 100% |
| distributionMedium（传播媒介） | 100%（全部"静图"） |
| mediaSubType（技术手段子类） | 96.4% |
| contentSubType（内容对象子类） | 94.1% |

---

## 三、阶段与任务总览

### ✅ 已完成

| 阶段 | 任务 | 关键产出 |
|------|------|----------|
| A1 | 三轴分类词典 | 18主类 + 54子类 + 6维映射表 |
| A2 | DB 迁移 + taxonomy | 4 新字段 + 前端类型 + API 更新 |
| A3 | 数据智能补标 | backfillSubTypes.ts，标注率 94-100% |
| B1 | SJTU 学科→期刊映射 | 40学科、~225期刊 |
| B2 | SJTU 二级页爬取 | 22 爬虫适配器、317 案例 |
| B3 | SJTU 呈现统计报告 | 含清华/北大/MIT 基准对比 |
| D-UI 1 | comparison API | `/api/insights/comparison` |
| D-UI 2 | 前端类型+API | ComparisonData + getComparison |
| D-UI 3 | ComparisonView | 独立 ComparisonPage 组件 + 缩略图网格 |
| D-UI 4 | 样式打磨 | 颜色分组 + 图片网格 + 空状态 |
| D-UI 5 | 院系选择器 | 交大院系映射 + school API 参数 |
| D-cross 1 | 子类型交叉分析 | mediaSubType × contentSubType 热力图 |

### 🔄 进行中

| 阶段 | 任务 | 状态 |
|------|------|------|
| C1 | 企业商业化科研视觉参照组 | 🔄 已重定义口径并完成首轮补强验证 |
| 国内扩展 | 7所大学爬虫适配器 | ✅ 完成（ZJU/HIT/HUST/BUAA/XJTU/SEU/BIT） |
| 国内扩展 | 域名加入COMPARISON_GROUPS | ✅ 完成 |
| 国内扩展 | seed来源+数据采集 | ✅ 完成（153条新增，总计3339条） |
| 企业商业化补强 | 第二轮质量初筛 | ✅ 完成（企业 116 条中 approved=80、needs_review=22、rejected=14） |

### ⏳ 待开始

| 阶段 | 任务 | 说明 |
|------|------|------|
| D-cross | 三轴频谱可视化 | functionalPurpose × distributionMedium × mediaType 三维 |
| B 扩展 | 更多 SJTU 源接入 | 新增更多 lab/department 源 |
| A4 | 三轴分类验证 | 人工抽检 30+ 条，确认标注合理性 |
| E | 对比分析报告 | 撰写跨机构视觉呈现差异报告 |
| C1 下一轮 | 商业化入口 browser_render | Autodesk/Cat/Microsoft/Arm 商业入口静态 fetch 失败，需 browser_render 或替代入口 |
| C1 下一轮 | 企业行业覆盖补齐 | 重点补材料、半导体制造、能源解决方案、机器人 case studies / solution pages |

### 🔒 阻塞

| 阻塞项 | 原因 |
|--------|------|
| 浙江大学无数据 | ~~news.zju.edu.cn 解析到 VPN IP (198.18.x.x)，本网络无法访问~~ ✅ 已解决：HTTP (非HTTPS) 可正常访问，已抓取65条案例 |
| 多个企业商业入口静态抓取失败 | Autodesk Customer Stories、Caterpillar Customer Stories、Microsoft AI Customer Stories、Microsoft AI Co-Innovation Labs、Arm Success Library 静态 fetch 失败，已标为 needs_adapter_tuning |

---

## 四、关键架构决策

1. **三轴叠加 6 维**：functionalPurpose←contentType+visualStyle, distributionMedium←新字段, technicalMethod←mediaType
2. **三栏对比**：前端硬编码 4 个来源组（交大/国内/国际/企业），后端按 sourceDomain 匹配
3. **交大院系映射**：SJTU_SCHOOLS 列表定义在 `routes/insights.ts`，每个院系映射到 sourceDomain + parentDiscipline
4. **图片展示**：后端抽样每条分布维度顶部的案例图片（最多 8 张/组），企业组按商业化信号优先抽样
5. **企业商业化参照组**：enterprise 组定位为“商业化科研视觉呈现基准”，采集优先级从纯 news/press/blog 转向 case studies、customer stories、solutions、industries、product pages、technology/innovation、whitepaper landing pages、application notes/use cases；comparison API 返回 enterpriseCommercialSignals
6. **无 Prisma Client 生成**：项目使用 `prisma db push` + 直接 SQLite 查询

---

## 五、启动方式

```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub
npm run dev           # 同时启动前端 (5173) + 后端 (3001)
npm run dev:server    # 仅后端
npm run dev:web       # 仅前端
```

前端类型检查：`cd web && npx tsc --noEmit`
后端类型检查：`cd server && npx tsc --noEmit`

---

## 六、导航与路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | CaseList | 案例库，含多条件筛选 |
| `/cases/:id` | CaseDetail | 案例详情 + 图片查看 |
| `/review` | ReviewPage | 处理工作台，批量审核 |
| `/pool` | PoolPage | 采集来源管理 |
| `/insights` | InsightsPage | 数据分析（分布图 + 交叉矩阵 + 结论） |
| `/comparison` | ComparisonPage | 三栏对比（独立页面） |

---

## 七、交大院系映射表

| 院系 ID | 标签 | 关联学科 | 域名 |
|---------|------|----------|------|
| all | 全部交大 | (全部) | 所有 *.sjtu.edu.cn |
| oce | 船舶海洋与建筑工程学院 | 工程 | oce.sjtu.edu.cn + news.sjtu |
| me | 机械与动力工程学院 | 工程 | me.sjtu.edu.cn + news.sjtu |
| seiee | 电子信息与电气工程学院 | 信息科学 | seiee.sjtu.edu.cn + news.sjtu |
| ee | 电气工程学院 | 工程 | seiee.sjtu.edu.cn + news.sjtu |
| auto | 自动化与感知学院 | 信息科学 | seiee.sjtu.edu.cn + news.sjtu |
| cs | 计算机学院 | 信息科学 | cs.sjtu.edu.cn + news.sjtu |
| ic | 集成电路学院 | 信息科学 | seiee.sjtu.edu.cn + news.sjtu |
| smse | 材料科学与工程学院 | 材料 | smse.sjtu.edu.cn + news.sjtu |
| sese | 环境科学与工程学院 | 环境科学 | sese.sjtu.edu.cn + news.sjtu |
| bme | 生物医学工程学院 | 医学 | bme.sjtu.edu.cn + news.sjtu |
| aero | 航空航天学院 | 工程 | aero.sjtu.edu.cn + news.sjtu |

> 注意：大部分交大案例在 `news.sjtu.edu.cn`（综合新闻），院系专属域名数据量少。
> 院系选择器用 parentDiscipline 过滤国内/国际栏，用院系域名过滤 SJTU 栏。

---

## 八、API 参考

### `GET /api/insights/comparison`

参数：
- `school`（可选）：院系 ID，如 `cs`、`me`、`all`（全部交大）
- `dimension`（可选，默认 mediaType）：对比维度

不传 `school` 时展示全部交大（97条），不按学科筛选。
传 `school` 时：
- SJTU 栏 → school 映射的 domains（该院系域名 + news.sjtu.edu.cn）
- 国内/国际栏 → school 的 parentDiscipline（确保同学科对比）
- 院系标签自动替换"交大现状"为院系名

返回包含 `schools` 字段（院系列表，前端硬编码一份相同列表）。

企业组额外返回 `enterpriseCommercialSignals`，用于观察：
- 应用场景化
- 产品/解决方案绑定
- 性能指标或成果可视化
- 品牌化叙事
- 商业转化路径
- 面向客户/行业受众
- 动图/视频/3D/演示潜力

当前验证结果：
- enterprise approved：80 条
- enterprise needs_review：22 条
- enterprise rejected：14 条
- 第二轮新增放行 34 条商业化/技术解释参照样本，包括 Kongsberg Maritime 11 条、Boston Dynamics 7 条、Microsoft 4 条、developer.nvidia.com 5 条、Siemens Healthineers 3 条、Arup 2 条、Airbus 1 条、Schneider 1 条
- 第二轮拒绝 14 条低价值样本，包括消费电商页、纯人物/团队照、空白装饰图、普通 PR 标志图
- `/comparison` 页面企业侧栏显示“商业化视觉参照”、商业化信号条和跨来源代表图
- 企业代表样本覆盖 `www.kongsbergmaritime.com`、`developer.nvidia.com`、`www.microsoft.com`、`bostondynamics.com`、`www.airbus.com`、`www.nvidia.com`、`www.cat.com`、`www.xylem.com`、`www.siemens-healthineers.com` 等

返回：
```json
{
  "success": true,
  "data": {
    "discipline": "信息科学",
    "school": "cs",
    "dimension": "mediaType",
    "dimensionLabel": "呈现方式",
    "schools": [{"id": "all", "label": "全部交大", "discipline": ""}, ...],
    "groups": [{
      "id": "sjtu", "label": "计算机学院",
      "total": 42, "distribution": [...],
      "samples": [{"id": "...", "title": "...", "thumbnail": "...", ...}]
    }, ...]
  }
}
```

### `GET /api/insights/summary`

已有端点，返回分布统计 + 交叉矩阵 + 结论。

---

## 九、提醒（给下一个 agent）

- 启动服务器后，如果有 TypeScript 变更需要重启才能生效
- 对比页访问 `/comparison`（独立路由，非内嵌于 InsightsPage）
- 修改后端后运行 `cd server && npx tsc --noEmit` 检查类型
- 修改前端后运行 `cd web && npx tsc --noEmit` 检查类型
- 数据库是 SQLite，直接在 `server/prisma/dev.db`
- 代码风格：内联样式，无 CSS 文件，theme.ts 统一变量
