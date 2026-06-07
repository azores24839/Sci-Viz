# 视频管线设计 (Video Pipeline Design)

**日期**: 2026-06-05
**状态**: Approved

## 目标

为 sci-viz-case-hub 添加完整的视频案例支持，包括：
1. 24 条精选企业宣传视频入库（对应交大 11 个学科方向）
2. 视频存储/播放管线
3. 前端视频播放器

## 方案选择

**Hybrid 方案**：存视频 URL + 平台海报图 + react-player 多平台播放器

理由：
- 视频 Host 在 Bilibili/YouTube，无需自建存储和带宽
- 平台海报 API 可提取高清封面，不需 ffmpeg
- react-player 统一处理多平台 embed，开发量可控

## 架构

### 1. Schema 变更

`server/prisma/schema.prisma` VisualCase 模型新增：

```prisma
videoUrl       String @default("")   // 视频 URL（B站/YouTube/直链）
videoPlatform  String @default("")   // bilibili | youtube | custom
videoDuration  Int    @default(0)   // 时长（秒），可选
```

### 2. 后端

#### 2.1 种子数据

文件: `server/prisma/seedVideos.json`

24 条精选视频，每条字段：
- title, caseTitle, sourceUrl, videoUrl, videoPlatform
- imageUrl (海报图 URL，从平台 API 获取)
- distributionMedium: "视频"
- captureType: "video"
- mediaType, contentType, discipline, visualStyle, functionalPurpose 等三轴标注

#### 2.2 种子脚本

文件: `server/src/services/videoSeed.ts`

- 读取 seedVideos.json
- 调用平台 API 获取海报图 URL
- 下载海报图 → 存入 thumbnails/ 目录 → 更新 thumbnailPath
- 计算图片 SHA256 hash → imageHash（去重用）
- 写入 VisualCase 记录

#### 2.3 海报图提取策略

| 平台 | 方法 |
|------|------|
| Bilibili | API `https://api.bilibili.com/x/web-interface/view?bvid=BV...` → `pic` 字段 |
| YouTube | `https://img.youtube.com/vi/{id}/maxresdefault.jpg` 静态 URL |
| Custom | 手动提供 imageUrl |

#### 2.4 API 变更

`server/src/routes/captures.ts`：
- GET/POST/PATCH 端点需支持新字段 videoUrl, videoPlatform, videoDuration
- 无需新端点，现有 CRUD + seed 即可

### 3. 前端

#### 3.1 新依赖

```bash
npm install react-player   # web/
```

react-player 支持 YouTube, Bilibili (via 本地 player), MP4 直链等。

#### 3.2 新组件

文件: `web/src/components/VideoPlayer.tsx`

- 封装 ReactPlayer，根据 videoPlatform 选择播放配置
- Bilibili: iframe embed `//player.bilibili.com/player.html?bvid=BV...&high_quality=1`
- YouTube: react-player 原生支持
- Custom: HTML5 `<video>` 标签
- 统一错误处理、加载占位、响应式尺寸

#### 3.3 CaseDetail 页面

`web/src/pages/CaseDetail.tsx`：
- 左侧区域分支：`captureType === 'video'` → `<VideoPlayer>` 替代 `<img>`
- 右侧新增字段：videoUrl（可点击链接）、videoPlatform、videoDuration

#### 3.4 CaseList 卡片

`web/src/pages/CaseList.tsx`：
- 视频案例卡片：海报缩略图 + 半透明播放按钮 overlay
- 点击跳转详情页播放（不在列表页内联播放）

#### 3.5 ComparisonPage

`web/src/pages/ComparisonPage.tsx`：
- 视频案例缩略图右下角添加播放图标标识
- 区分视频/图片案例

### 4. 类型变更

`web/src/types/index.ts` VisualCase 接口新增：
```typescript
videoUrl?: string;
videoPlatform?: string;
videoDuration?: number;
```

### 5. 精选视频数据

24 条视频，对应 11 个学院：

| 学院 | 企业 | 视频 | 平台 |
|------|------|------|------|
| 船舶海洋与建筑工程 | Kongsberg Maritime | Historic Day for Kongsberg Maritime | YouTube |
| 船舶海洋与建筑工程 | 中国船舶集团 | 大船集团—中国航母的摇篮 | Bilibili |
| 机械与动力工程 | Siemens Energy | Mastering the Element (HL-class) | YouTube |
| 机械与动力工程 | GE Aerospace | GE9X—世界最大航空发动机 | YouTube |
| 电子信息与电气 | 华为 | Dream It Possible | Bilibili |
| 电子信息与电气 | Sony | Image Sensor Technology | YouTube |
| 电气工程 | 施耐德电气 | 穿越施耐德电气190年 | Bilibili |
| 电气工程 | 国家电网 | 上海国家电网宣传片 | Bilibili |
| 自动化与感知 | 大疆 DJI | Avata 官方宣传片 | Bilibili |
| 自动化与感知 | Boston Dynamics | Atlas Gets a Grip (2023) | Bilibili |
| 自动化与感知 | Figure AI | Figure 01 + OpenAI | Bilibili |
| 计算机/网安/密码 | OpenAI | Sora 2 视频模型 | Bilibili |
| 计算机/网安/密码 | Google DeepMind | RT-2 通用机器人模型 | Bilibili |
| 集成电路/信电 | ASML | High-NA EUV 极致美学 4K | Bilibili |
| 集成电路/信电 | NVIDIA | GTC 2026 主题演讲 | Bilibili |
| 集成电路/信电 | 台积电 | TSMC 官方宣传片 | Bilibili |
| 材料科学 | Corning | A Day Made of Glass | Bilibili |
| 材料科学 | Corning | 熔融下拉玻璃制程 | Bilibili |
| 环境科学 | 比亚迪 | WHO IS BYD 全球品牌片 | Bilibili |
| 环境科学 | 星球研究所 | 为14亿人供电 4K | Bilibili |
| 生物医学工程 | 联影医疗 | uEXPLORER 全身PET/CT | Bilibili |
| 生物医学工程 | 迈瑞医疗 | 生命科技如此亲近 | Bilibili |
| 航空航天 | SpaceX | Starship Flight 3 宣传片 4K | Bilibili |
| 航空航天 | 中国商飞 | C919 官方宣传片 4K | Bilibili |

## 实现步骤

1. Schema 变更 + Prisma migrate
2. 前端类型更新
3. 编写 seedVideos.json
4. 编写 videoSeed.ts 脚本
5. 安装 react-player + 创建 VideoPlayer 组件
6. 更新 CaseDetail.tsx（视频播放器分支）
7. 更新 CaseList.tsx（视频卡片覆盖层）
8. 更新 ComparisonPage.tsx（视频标识）
9. 运行种子脚本入库
10. 端到端测试

## 风险

- Bilibili embed 在本地开发可能因 CORS 限制，需测试
- 部分 Bilibili BV号可能失效，种子数据需验证
- react-player 包体积 ~50KB (gzip)，需按需加载