# 视频案例分类执行口径

> 日期：2026-06-05
> 状态：已执行

## 核心结论

视频属于三轴中的**传播媒介**，不属于 `mediaType`。

```text
distributionMedium = 视频
mediaType = 摄影 / 3D渲染 / 信息图 / 数据可视化 / 混合媒介 / ...
technicalMethod = 拍摄 / 渲染 / 绘设 / 数据 / 生成 / ...
```

## 标注顺序

1. 先判断媒介：是否线性播放、有进度控制或视频链接。
   - 是：`distributionMedium=视频`
   - 否：继续判断静图、动图、图组、交互或实体

2. 再判断画面语言：视频画面主要像什么。
   - 真实拍摄/纪录片/访谈/实验录像：`mediaType=摄影`
   - 产品、分子、设备、空间三维动画：`mediaType=3D渲染`
   - 标注、流程、图解为主：`mediaType=信息图`
   - 图表、地图、网络、仿真数据为主：`mediaType=数据可视化`
   - 多种画面语言混剪且难以归一：`mediaType=混合媒介`

3. 再判断生产技术。
   - 摄像机/无人机/实拍：`technicalMethod=拍摄`
   - 显微、医学影像、遥感等仪器序列：`technicalMethod=成像`
   - 平面设计、图标、二维动画：`technicalMethod=绘设`
   - 数据驱动图形：`technicalMethod=数据`
   - 3D建模、仿真、CG 动画：`technicalMethod=渲染`
   - AI 生成或显著 AI 合成：`technicalMethod=生成`

## 系统字段分工

| 字段 | 用途 | 是否研究主分类 |
|------|------|----------------|
| `distributionMedium` | 传播媒介：静图、动图、视频、图组、交互、实体 | 是 |
| `functionalPurpose` | 功能用途：记录、解释、数据、展示、传播、交互 | 是 |
| `technicalMethod` | 生产技术：拍摄、成像、绘设、数据、渲染、生成 | 是 |
| `mediaType` | 视觉语言/画面形态 | 辅助分析 |
| `contentType` | 画面对象 | 辅助分析 |
| `captureType` | 系统采集方式/播放器分支 | 否 |
| `videoPlatform` | B站、YouTube、Vimeo、自托管等平台信息 | 否 |

## 筛选建议

案例库第一层筛选优先使用：

```text
传播媒介 → 功能用途 → 技术手段 → 学科
```

视频案例推荐筛选路径：

```text
distributionMedium=视频
→ technicalMethod=拍摄/渲染/数据/绘设
→ functionalPurpose=解释/展示/传播/记录
→ mediaType=摄影/3D渲染/数据可视化/混合媒介
```

不要用 `mediaType=视频` 建立筛选、KPI 或统计口径。
