# 爬虫视频提取设计 (Crawler Video Extraction Design)

**日期**: 2026-06-05
**状态**: Approved
**前置**: 视频管线设计 (`2026-06-05-video-pipeline-design.md`) 已实现VideoPlayer、数据库字段等基础设施

## 目标

为已接入的7所国内大学 + 国外机构（MIT/CAS等）爬虫适配器增加视频提取能力，自动从官网页面中发现科研实验视频，创建视频案例入库。

**范围**：
- 来源：大学官网科研实验相关视频
- 存储：嵌入链接（存URL，播放在线嵌入）
- 平台：复用现有VideoPlayer（B站/YouTube iframe）

## 方案选择

**方案A（已选定）：扩展现有爬虫管道**

在现有图片提取流程中并行增加视频提取，一张页面同时产出图片案例和视频案例。

理由：
- 大学页面图片和视频共存，一次爬取最合理
- 复用现有适配器配置、页面发现、去重等基础设施
- 改动最小，约200行代码变更

## 架构

### 1. 适配器变更

文件: `server/src/crawler/staticSourceAdapters.ts`

`StaticSourceAdapter` 接口新增字段：

```typescript
interface StaticSourceAdapter {
  // ...现有字段...
  videoSelectors: string[];        // 视频/iframe CSS选择器
  videoExcludeSelectors: string[]; // 排除广告等非科研视频
}
```

7所国内大学适配器统一配置：

```typescript
videoSelectors: [
  'video[src]',
  'video source[src]',
  'iframe[src*="bilibili"]',
  'iframe[src*="youtube"]',
]
videoExcludeSelectors: []
```

国外型源：
- MIT: `['video[src]', 'iframe[src*="youtube"]']`
- CAS: `['video[src]', 'div.TRS_UEDITOR video', 'iframe[src*="bilibili"]']`

### 2. 视频提取引擎

文件: `server/src/crawler/extractMediaFromPage.ts`（基于`extractImagesFromPage.ts`扩展）

#### 2.1 VideoCandidate 接口

```typescript
interface VideoCandidate {
  src: string;           // 视频URL或iframe嵌入页URL
  platform: string;      // 'bilibili' | 'youtube' | 'vimeo' | 'youku' | 'self-hosted'
  posterUrl?: string;    // 封面图URL（从<video poster>或平台API获取）
  contextText?: string;  // 视频周围文字上下文
  title?: string;        // 视频标题
}
```

#### 2.2 提取逻辑

函数签名：
```typescript
export function extractVideosFromPage(
  $: cheerio.CheerioAPI,
  url: string,
  videoSelectors: string[],
  videoExcludeSelectors: string[],
  contentSelectors: string[],
): VideoCandidate[]
```

提取流程：

1. **`<video>` 标签**：
   - 取 `src` 属性或子 `<source src="">`
   - 取 `poster` 属性作为封面图URL
   - 标记 `platform: 'self-hosted'`

2. **`<iframe>` 标签**（匹配已知平台模式）：
   - `player.bilibili.com` / `bilibili.com/video/BV` → 提取BV号，标 `bilibili`
   - `youtube.com/embed` / `youtu.be` → 提取视频ID，标 `youtube`
   - `player.vimeo.com` / `vimeo.com` → 提取视频ID，标 `vimeo`
   - `v.youku.com` → 标 `youku`
   - 其他域名 → 忽略（避免广告iframe）

3. **直接视频链接**（`<a href="*.mp4|*.webm|*.mov">`）：
   - 仅在 `contentSelectors` 匹配区域内查找
   - 标 `platform: 'self-hosted'`

4. **过滤**：
   - 排除 `videoExcludeSelectors` 匹配的元素
   - 排除广告域名（doubleclick、googlesyndication等）
   - 排除尺寸< 200px 的 iframe（广告特征）

#### 2.3 视频平台检测

```typescript
function detectVideoPlatform(url: string): { platform: string; videoId: string } {
  // B站: /video/BV\w+/, player.bilibili.com/player.html?bvid=
  // YouTube: youtube.com/watch?v=, youtu.be/, youtube.com/embed/
  // Vimeo: vimeo.com/\d+, player.vimeo.com/video/\d+
  // Youku: v.youku.com/v_show/
  // 其他: self-hosted
}
```

### 3. 封面图获取策略

复用 `videoSeed.ts` 中的已有逻辑，提取为 `resolveVideoPoster()` 服务：

| 平台 | 封面获取方法 |
|------|-------------|
| bilibili | `api.bilibili.com/x/web-interface/view?bvid=` → `pic` 字段 |
| youtube | `img.youtube.com/vi/{id}/maxresdefault.jpg` |
| vimeo | `vimeo.com/api/v2/video/{id}.json` → `thumbnail_large` |
| self-hosted | `<video poster>` 属性值（如有时） |
| 无封面 | 使用默认占位图 `/uploads/video-placeholder.jpg` |

### 4. 爬取管道变更

文件: `server/src/crawler/runUrlCrawl.ts`

在 `processSingleUrl()` 中，图片处理之后追加视频处理：

```
现有流程:
  fetch → parse HTML → extractImages → filter → save → createCase(图片)

扩展流程:
  fetch → parse HTML → extractMedia
    → image分支 → filter → save → createCase(captureType: 'crawler')
    → video分支 → resolvePoster → savePoster → createCase(captureType: 'video')
```

视频案例字段设置：
- `captureType: 'video'`
- `distributionMedium: '视频'`
- `videoUrl`: 提取的视频URL
- `videoPlatform`: 自动检测结果（bilibili/youtube/vimeo/youku/self-hosted）
- `videoDuration: 0`（后续可通过API补充）
- `imageUrl`: 平台海报图URL（如有）
- `imagePath`/`thumbnailPath`: 下载的海报图路径
- `reviewStatus: 'pending'`（需人工审核，不像seed视频直接approved）

### 5. 去重策略

- **bilibili**: 按 `videoUrl` 中提取的BV号去重
- **youtube**: 按 `videoUrl` 中提取的视频ID去重
- **通用**: 按 `videoUrl` 字段去重，在 `processSingleUrl()` 中查重：
  ```sql
  SELECT id FROM VisualCase WHERE videoUrl = ? AND videoUrl != ''
  ```

### 6. 前端调整

#### 6.1 案例列表快速筛选

文件: `web/src/pages/CaseList.tsx`

在快速筛选行新增"视频"按钮：
```tsx
// 现有: Nature covers, 3D建模, 机制图, 显微图, 数据可视化
// 新增: 视频
{ label: '视频', filter: { captureType: 'video' } }
```

#### 6.2 无需改动的组件

- `VideoPlayer.tsx`: 已支持B站/YouTube嵌入
- `CaseDetail.tsx`: 已有视频播放分支逻辑
- `CaseList.tsx`: 已有播放按钮覆盖层
- `ComparisonPage.tsx`: 已处理 `distributionMedium='视频'`

### 7. 文件变更清单

| 操作 | 文件 | 变更内容 |
|------|------|---------|
| 修改 | `server/src/crawler/staticSourceAdapters.ts` | 各适配器添加 videoSelectors/videoExcludeSelectors |
| 新建 | `server/src/crawler/extractMediaFromPage.ts` | 从 extractImagesFromPage.ts 扩展，增加视频提取 |
| 重构 | `server/src/crawler/extractImagesFromPage.ts` | 保留，extractMediaFromPage 导入并调用它 |
| 修改 | `server/src/crawler/runUrlCrawl.ts` | processSingleUrl 增加视频处理分支 |
| 修改 | `server/src/services/videoSeed.ts` | 提取 resolveVideoPoster() 为独立函数 |
| 新建 | `server/src/services/videoPoster.ts` | 封面图获取服务（从videoSeed.ts提取） |
| 修改 | `web/src/pages/CaseList.tsx` | 快速筛选新增"视频" |

### 8. 风险

- **iframe动态加载**: 部分大学页面用JS延迟加载iframe，静态HTML抓取可能漏掉 → 需验证各大学页面结构
- **self-hosted视频**: 官网自托管视频无统一封面提取方法 → 依赖 `<video poster>` 属性，缺失时用占位图
- **视频审核**: 爬取的视频自动设为 `pending` 状态，需人工审核后才能在公开页面显示
- **B站API频率限制**: 批量获取封面时可能触发限流 → 增加请求间隔（1-2秒）