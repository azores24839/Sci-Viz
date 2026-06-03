# 阶段A续：三轴数据补标 Goal

> 日期：2026-06-02

---

## A3. 三轴数据智能补标

### 目标

将 functionalPurpose、distributionMedium 两个字段的标注率从当前的 ~25%/~100%（但几乎全是"静图"）提升到 >80%，并让 mediaSubType 和 contentSubType 也有基础标注，使三轴分析真正可用。

### 当前数据问题

| 字段 | 标注率 | 问题 |
|------|--------|------|
| functionalPurpose | ~25% (76/305 SJTU, ~9% 全库) | 75%为空，无法做功能用途分析 |
| distributionMedium | ~99% 全库，但99%标注为"静图" | 几乎所有网页图片都被标为静图，没有区分视频/交互/图组 |
| mediaSubType | ~0% | 几乎全空 |
| contentSubType | ~0% | 几乎全空 |

### 具体验收标准

1. **functionalPurpose 标注率 > 80%**：对全库案例补标，基于 mediaType + contentType + visualStyle 的组合推断规则
2. **distributionMedium 智能推断**：不再全部默认为"静图"，而是根据来源类型和案例特征推断
   - 来源包含 video/youtube/vimeo → 视频
   - 来源为 nature.com 且 mediaType=期刊封面 → 静图
   - 来源为 nature.com 且 mediaType=信息图 → 图组（论文组图）
   - 来源为交互数据可视化平台 → 交互
   - 其余 → 静图
3. **mediaSubType 初始标注 > 60%**：对主要 mediaType 自动填子分类
   - 3D渲染 → 3D机制图（Nature封面类）或 3D产品渲染（企业来源）
   - 摄​​影 → 纪实摄影（默认）
   - 显微图 → 光学显微（默认）
   - 信息图 → 科学插画（默认）
4. **contentSubType 初始标注 > 40%**：对主要 contentType 填子分类
   - 科研人员 → 个人肖像（默认）
   - 团队场景 → 群体/团队
   - 实验过程 → 过程摄影
5. **人工抽检 30 条**：确认AI推断的准确性 > 80%

### 产出

- 补标脚本及其执行结果报告
- 补标后的数据统计（各字段标注率、分布）
- 30条人工抽检记录

### 估算工作量

- AI补标脚本编写：1-2小时
- 全库执行：自动化
- 人工抽检：30分钟