# 医学、工程、环境科学国际非 Nature 补缺采集计划

生成日期：2026-05-31

## 目标

本轮补缺专项不追求扩大总量，而是补足当前案例库在医学、工程、环境科学三个弱学科，以及国际非 Nature 权威来源上的结构性缺口。

目标新增 260-320 条案例：

| 方向 | 当前缺口 | 新增目标 | 单源上限 |
|---|---|---:|---:|
| 医学 | 样本少，公共卫生/医学场景不足 | 80-100 | 15-30 |
| 工程 | 工程现场、原型、测试平台不足 | 70-90 | 15-30 |
| 环境科学 | 遥感之外的野外采样、观测设备不足 | 90-110 | 15-30 |

优先补充内容类型：实验过程、实验设备、空间环境、科研人员、医学影像、公共卫生现场、工程原型、测试平台、遥感图、野外采样、气候/生态监测。

## 已落地资产

- `CRAWL_SOURCE_TARGETS.md` 已新增 `L. 国际非 Nature 补缺专项`。
- `CrawlSource` 数据库已 upsert 12 个专项来源。
- 新增脚本：
  - `npm run db:seed:gap-sources`
  - `npm run gap:dry-run`
- dry-run 报告：`docs/gap-crawl-dry-run-2026-05-31.md`

## Dry-run 结论

第一批可直接推进：

| 来源 | 方向 | 结论 | 建议 |
|---|---|---|---|
| NIGMS Image and Video Gallery | 医学 | 可访问，发现 10 个详情链接，页面图片信号强 | 第一批自动采集 |
| CDC Public Health Image Library | 医学 | 可访问，发现搜索/分组入口 | 先人工精选搜索结果页或详情页 |
| NASA Earth Observatory | 环境科学 | 可访问，发现 10 个文章/图像入口 | 第一批自动采集 |
| USGS Landsat Multimedia | 环境科学 | 可访问，发现 10 个媒体入口 | 第一批自动采集，需过滤视频/音频 |
| NOAA Digital Collections Photo Library | 环境科学 | 可访问但未发现稳定详情链接 | 作为人工/适配补充 |

需要适配或人工精选：

| 来源 | 问题 | 处理方式 |
|---|---|---|
| NIH Photo Galleries | 脚本访问 403，但官方页存在，且主要跳 Flickr | 走 Flickr/API 或人工相册精选 |
| NCI Visuals Online | 脚本 fetch failed | 先人工确认可访问详情页，再考虑专门适配 |
| DOE R&D Image Gallery | 脚本返回 404，但浏览器官方页可见 | 需要 DOE 页面适配或人工提取图片 URL |
| DOE CMEI Photographs | 脚本返回 404 | 需要 DOE 页面适配或人工提取实验室图库 |
| NREL SWS Image Gallery | 脚本 fetch failed | 需要 NREL 搜索页适配或人工精选 |
| Stanford Engineering News | 可访问但通用发现未抓到详情链接 | 加 Stanford Engineering 专用 selector 或人工精选 |
| NOAA PMEL Climate-Weather Research Photos | 脚本返回 404，但官方页可见 | 需要 NOAA/PMEL 页面适配或人工提取图片 URL |

## 执行批次

### Batch 1：稳定入口小批量入库

目标 60-90 条，先验证质量。

- NIGMS Image and Video Gallery：20-25 条
- NASA Earth Observatory：20-25 条
- USGS Landsat Multimedia：15-20 条
- CDC PHIL：10-15 条人工精选

验收：新增案例中医学和环境科学字段明显增加；低价值 logo、导航图、视频缩略图比例低。

### Batch 2：工程来源适配

目标 70-90 条。

- DOE R&D Image Gallery：20-25 条
- DOE CMEI Photographs：15-20 条
- NREL SWS Image Gallery：20-25 条
- Stanford Engineering News：10-15 条

需要先补 DOE/NREL/Stanford 的 source-specific 适配器或人工 URL 列表。

### Batch 3：环境现场与气候观测补强

目标 60-80 条。

- NOAA PMEL Climate-Weather Research Photos：25-30 条
- NOAA Digital Collections Photo Library：15-20 条
- NASA Earth Observatory 二次筛选：15-20 条
- USGS Landsat 二次筛选：10-15 条

重点补野外采样、浮标/传感器、科研船、气候监测设备和遥感变化对比。

### Batch 4：医学权威图库补强

目标 50-70 条。

- NCI Visuals Online：20-25 条
- NIH Photo Galleries / NIH Flickr：15-25 条
- CDC PHIL 二次筛选：15-20 条

重点补医学科研人员、实验室、公共卫生现场、医学插画和机制图，避免过度敏感临床图。

## 入库约束

- 单一来源新增不超过 30 条。
- 每个方向至少覆盖 4 个来源。
- 已经高度重复的显微图、遥感图、封面式图像降级采集。
- 无上下文、无 caption、低分辨率或版权不清图片不入库。
- 高价值候选保留 `sourceDomain`、`sourceUrl`、caption/context、credit 信息。

## 覆盖审计

每批入库后执行以下审计：

```sql
select discipline, count(*) from VisualCase group by discipline order by count(*) desc;
select contentType, count(*) from VisualCase group by contentType order by count(*) desc;
select mediaType, count(*) from VisualCase group by mediaType order by count(*) desc;
select visualStyle, count(*) from VisualCase group by visualStyle order by count(*) desc;
select sourceDomain, count(*) from VisualCase group by sourceDomain order by count(*) desc limit 30;
```

最终验收标准：

- 医学、工程、环境科学每类达到约 100 条以上。
- 新增案例中没有任何单一来源超过 25%。
- 实验过程、实验设备、空间环境、科研人员等弱内容类型有明显增长。
- 每个方向筛出 10-15 个高价值候选案例，后续人工补充借鉴点、风险和适用场景。
