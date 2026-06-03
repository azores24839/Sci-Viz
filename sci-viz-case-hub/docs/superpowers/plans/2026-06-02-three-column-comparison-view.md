# 三栏对比视图实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 InsightsPage 中新增一个"三栏对比"板块，用户选择学科后，并排展示"交大现状 | 国内研究 | 国际研究"三个来源组的mediaType分布条形图，并可展开第四栏"头部企业"。

**Architecture:** 前端新增 ComparisonView 组件嵌入现有 InsightsPage，后端新增 `/api/insights/comparison` 端点返回按来源组预聚合的分布数据。来源组定义硬编码在前端（可配置），后端按 sourceDomain 匹配。

**Tech Stack:** React + TypeScript (前端), Express + Prisma (后端), SQLite

---

## File Structure

```
server/src/routes/insights.ts    — 新增 comparison 端点
web/src/api/index.ts             — 新增 getComparison API 方法
web/src/types/index.ts           — 新增 ComparisonGroup, ComparisonData 类型
web/src/pages/InsightsPage.tsx   — 新增 ComparisonView 组件 + 集成
```

---

### Task 1: 后端 — 新增 comparison API 端点

**Files:**
- Modify: `server/src/routes/insights.ts`

- [ ] **Step 1: 在 insights.ts 末尾新增 `/comparison` GET 端点**

在 `insightsRouter` 中新增路由，路径 `/comparison`。

请求参数：
- `discipline`（必填）：学科筛选值
- `dimension`（可选，默认 mediaType）：要统计分布的维度

响应格式：
```json
{
  "success": true,
  "data": {
    "discipline": "工程",
    "dimension": "mediaType",
    "dimensionLabel": "呈现方式",
    "groups": [
      {
        "id": "sjtu",
        "label": "交大现状",
        "sourceDomains": ["news.sjtu.edu.cn", "me.sjtu.edu.cn", "seiee.sjtu.edu.cn", ...SJTU_DOMAINS],
        "total": 71,
        "distribution": [
          { "label": "摄影", "count": 45, "percentage": 63.4 },
          { "label": "信息图", "count": 14, "percentage": 19.7 },
          ...
        ]
      },
      {
        "id": "domestic",
        "label": "国内研究",
        "sourceDomains": ["news.tsinghua.edu.cn", "news.pku.edu.cn", "news.fudan.edu.cn", ...],
        "total": 340,
        "distribution": [...]
      },
      {
        "id": "international",
        "label": "国际研究",
        "sourceDomains": ["www.nature.com", "news.mit.edu", "news.harvard.edu", ...],
        "total": 2200,
        "distribution": [...]
      },
      {
        "id": "enterprise",
        "label": "头部企业",
        "sourceDomains": [],
        "total": 0,
        "distribution": []
      }
    ]
  }
}
```

逻辑：
1. 定义4个来源组及其 sourceDomain 列表（SJTU_DOMAINS, DOMESTIC_DOMAINS, INTERNATIONAL_DOMAINS, ENTERPRISE_DOMAINS）
2. 根据 discipline 筛选 VisualCase
3. 对每个来源组，在筛选结果中按 sourceDomain 再次过滤，统计 dimension 分布
4. 返回结果

SJTU_DOMAINS 列表（从爬虫数据中提取）：
```
news.sjtu.edu.cn, me.sjtu.edu.cn, oce.sjtu.edu.cn, www.seiee.sjtu.edu.cn,
cs.sjtu.edu.cn, smse.sjtu.edu.cn, www.aero.sjtu.edu.cn, sese.sjtu.edu.cn,
scce.sjtu.edu.cn, bme.sjtu.edu.cn, phys.sjtu.edu.cn, math.sjtu.edu.cn,
biosci.sjtu.edu.cn, pharm.sjtu.edu.cn, acem.sjtu.edu.cn, design.sjtu.edu.cn,
comm.sjtu.edu.cn, soo.sjtu.edu.cn, agri.sjtu.edu.cn
```

DOMESTIC_DOMAINS：
```
www.tsinghua.edu.cn, news.pku.edu.cn, news.fudan.edu.cn, news.ustc.edu.cn,
www.cas.cn, news.sciencenet.cn
```

INTERNATIONAL_DOMAINS：
```
www.nature.com, news.mit.edu, news.harvard.edu, newscenter.lbl.gov,
www.mpg.de, images.nasa.gov
```

ENTERPRISE_DOMAINS：暂为空数组（企业来源尚未采集）

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server && npx tsc --noEmit`

- [ ] **Step 3: 测试 API**

Run: `curl 'http://localhost:3001/api/insights/comparison?discipline=工程' | head -100`

（需先启动服务器。若未运行则跳过此步，依靠编译验证）

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/insights.ts
git commit -m "feat: add /api/insights/comparison endpoint for three-column comparison"
```

---

### Task 2: 前端 — 新增类型定义和 API 方法

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/index.ts`

- [ ] **Step 1: 在 types/index.ts 中新增 Comparison 相关类型**

在文件末尾（`export` 区域之前）添加：

```typescript
export type ComparisonGroupId = 'sjtu' | 'domestic' | 'international' | 'enterprise';

export interface ComparisonDistributionItem {
  label: string;
  count: number;
  percentage: number;
}

export interface ComparisonGroup {
  id: ComparisonGroupId;
  label: string;
  sourceDomains: string[];
  total: number;
  distribution: ComparisonDistributionItem[];
}

export interface ComparisonData {
  discipline: string;
  dimension: string;
  dimensionLabel: string;
  groups: ComparisonGroup[];
}
```

- [ ] **Step 2: 在 api/index.ts 中新增 getComparison 方法**

在 `Api` 类中添加：

```typescript
async getComparison(discipline: string, dimension = 'mediaType'): Promise<ApiResponse<ComparisonData>> {
  return this.request<ComparisonData>(`/insights/comparison?discipline=${encodeURIComponent(discipline)}&dimension=${encodeURIComponent(dimension)}`);
}
```

确保在文件顶部 import 中添加 `ComparisonData`。

- [ ] **Step 3: 验证编译通过**

Run: `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add web/src/types/index.ts web/src/api/index.ts
git commit -m "feat: add ComparisonData types and API method"
```

---

### Task 3: 前端 — ComparisonView 组件

**Files:**
- Modify: `web/src/pages/InsightsPage.tsx`

- [ ] **Step 1: 在 InsightsPage.tsx 中新增 ComparisonView 组件**

在 `InsightsPage` 函数组件之前，添加 `ComparisonView` 组件。组件布局：

```
┌──────────────────────────────────────────────────────┐
│  三栏对比：[学科选择▼]  [维度选择▼]                    │
├──────────────┬──────────────┬────────────────────────┤
│  交大现状     │  国内研究     │  国际研究              │
│  工程 (71条)  │  工程 (340条) │  工程 (2200条)         │
│  ███████ 摄影 │  ██████ 摄影  │  ████████ 3D渲染      │
│  ████  信息图 │  █████ 信息图 │  ███████ 摄影        │
│  ████  数据   │  ████ 数据    │  █████ 显微图          │
│  ...          │  ...         │  ...                   │
├──────────────┴──────────────┴────────────────────────┤
│  ▸ 展开头部企业对比（0条，待采集）                      │
└──────────────────────────────────────────────────────┘
```

组件接口：
```typescript
function ComparisonView({ discipline, dimension }: {
  discipline: string;
  dimension: string;
})
```

组件行为：
1. 使用 `api.getComparison(discipline, dimension)` 获取数据
2. 并排渲染3个（可展开为4个）分布条形图
3. 每栏显示：组标题、案例数、分布条形图（复用现有 DistributionChart 的样式）
4. 头部企业栏默认折叠，点击"展开"显示（当前数据为0则显示"待采集"提示）
5. 学科选择器使用 `filterOptions.discipline` 的选项
6. 维度选择器使用 `allDimensions`

组件内部状态：
```typescript
const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
const [selectedDiscipline, setSelectedDiscipline] = useState('工程');
const [selectedDimension, setSelectedDimension] = useState('mediaType');
const [showEnterprise, setShowEnterprise] = useState(false);
const [loading, setLoading] = useState(false);
```

样式要点：
- 三栏使用 `display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;`
- 展开时第四栏用 `grid-template-columns: repeat(4, 1fr)`
- 每栏使用 Card 组件包裹
- 条形图使用简单 div + 百分比宽度实现（与 DistributionChart 一致）
- 每个条形可点击，跳转到 `/cases?discipline=工程&sourceDomain=...&mediaType=摄影`

- [ ] **Step 2: 在 InsightsPage 中集成 ComparisonView**

在 InsightsPage 的交叉矩阵和结论之间，或页面底部，插入 ComparisonView：

```tsx
{summary && (
  <ComparisonView
    discipline={filters.discipline || '工程'}
    dimension={colDim}
  />
)}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/web && npx tsc --noEmit`

- [ ] **Step 4: 验证服务器编译通过**

Run: `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/InsightsPage.tsx
git commit -m "feat: add ComparisonView with three-column comparison"
```

---

### Task 4: 样式打磨与交互细节

**Files:**
- Modify: `web/src/pages/InsightsPage.tsx`

- [ ] **Step 1: 添加条形图颜色分组**

三栏对比的条形图需要按组使用不同主题色：
- 交大现状：`theme.colors.accent`（紫色，主色）
- 国内研究：`theme.colors.green`
- 国际研究：`theme.colors.orange`
- 头部企业：`theme.colors.purple`

- [ ] **Step 2: 添加点击跳转逻辑**

每个条形图栏目点击时，跳转到案例列表并带上对应筛选条件：

```typescript
const navigateToComparisonCases = (groupId: string, label: string) => {
  const search = new URLSearchParams();
  search.set('discipline', selectedDiscipline);
  search.set(colDim, label); // dimension value
  search.set('review_status', 'approved');
  // 根据 groupId 添加来源筛选
  const groupDomains = COMPARISON_GROUP_DOMAINS[groupId];
  if (groupDomains.length > 0) {
    search.set('sourceDomain', groupDomains.join(','));
  }
  navigate(`/cases?${search.toString()}`);
};
```

- [ ] **Step 3: 添加空状态和加载态**

- 加载中：显示 skeleton 或 "加载中..."
- 无数据：显示 "该学科暂无数据，请选择其他学科"
- 企业栏无数据：显示 "企业来源待采集，敬请期待"

- [ ] **Step 4: 最终编译验证**

Run: `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub && npm run build`

确保 server 和 web 都编译通过。

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/InsightsPage.tsx
git commit -m "feat: polish ComparisonView with colors, click-through, and loading states"
```