# C1 active_static 企业来源小批量采集记录

日期：2026-06-02

## 当前批次

默认 dry-run 命令：

```bash
npm run enterprise:active-batch -- --max-links=3 --max-pages=1
```

真实执行命令：

```bash
npm run enterprise:active-batch -- --max-links=3 --max-pages=1 --execute
```

注意：真实执行会下载图片、写入 `VisualCase`、触发去重、采集评分和分析流程。每源最多 3 篇，避免无边界采集。

## 待验证 active_static 来源

```text
Autodesk Construction Blog
Caterpillar News
NVIDIA Technical Blog
Eaton News Releases
Boston Dynamics Blog
Google Research Blog
Microsoft Research Blog
Arm Newsroom
Dow Press Releases
Veolia Newsroom
Boston Scientific Newsroom
Airbus Newsroom
```

环境科学与工程学院的 Xylem 在 active-batch 链接质量检查中降级为 `needs_adapter_tuning`。Arcadis 和 WSP 也分别因财报/403 问题退出正式 active 池；当前由 Veolia Newsroom 作为该方向 `active_static` 来源。材料方向由 Dow Press Releases 替代 3M News Center，生医方向由 Boston Scientific Newsroom 保持 active，GE HealthCare 暂作调优候选。

本批次已在 `runEnterpriseActiveBatch.ts` 增加企业低价值 URL 过滤层，用于剔除投资者关系、财报、联系人、媒体图库、奖项、赞助、HR/多元化和品牌公益页面。

最新 dry-run active-batch 验证：

```text
command: npm run enterprise:active-batch -- --max-links=3 --max-pages=1
sources: 12
discovered_links: 36
processed_pages: 0
created_cases: 0
mode: dry-run only
```

该命令只发现候选文章 URL，不下载图片、不写入案例库。

## 批次结果模板

```text
mode:
sources:
discovered_links:
processed_pages:
created_cases:
candidate_images:
filtered_images:
failed_pages:
manual_review_notes:
follow_up:
```

## 质量观察重点

- 是否每个来源都能发现 3 篇文章。
- 是否存在高比例 logo/icon/社交图误收。
- 是否 `collectionScore` 对企业产品图、工程图、技术图过度降权。
- 是否企业图像挤占学术来源优先级。
- 入库案例是否保持 `sourceType = enterprise`、来源 URL 和上下文可追溯。
