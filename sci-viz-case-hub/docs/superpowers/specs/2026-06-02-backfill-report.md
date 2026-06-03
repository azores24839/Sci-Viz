# 四轴字段补标报告

日期：2026-06-02
脚本：`server/src/scripts/backfillSubTypes.ts`

## 执行前状态

| 字段 | 已标注 | 总数 | 标注率 |
|------|--------|------|--------|
| functionalPurpose | 2941 | 3164 | 92.9% |
| distributionMedium | 2941 | 3164 | 92.9% |
| mediaSubType | 0 | 3164 | 0% |
| contentSubType | 0 | 3164 | 0% |

## 执行后状态

| 字段 | 已标注 | 新增 | 总数 | 标注率 |
|------|--------|------|------|--------|
| functionalPurpose | 3164 | +223 | 3164 | 100% |
| distributionMedium | 3164 | +223 | 3164 | 100% |
| mediaSubType | 3051 | +3051 | 3164 | 96.4% |
| contentSubType | 2976 | +2976 | 3164 | 94.1% |

## 各字段分布

### functionalPurpose
| 值 | 数量 |
|----|------|
| 传播 | 1889 |
| 记录 | 647 |
| 解释 | 308 |
| 数据 | 296 |
| 展示 | 17 |
| 不确定 | 7 |

### distributionMedium
| 值 | 数量 |
|----|------|
| 静图 | 3164 |

（全库无视频案例，无nature.com信息图/数据可视化）

### mediaSubType
| 值 | 数量 |
|----|------|
| 3D机制图 | 923 |
| 纪实摄影 | 910 |
| 科学插画 | 601 |
| 光学显微 | 357 |
| 统计图表 | 230 |
| 3D产品渲染 | 30 |
| (空) | 113 |

空值对应：混合媒介、视频、PDF/文档、不确定 等mediaType（按规则不标）

### contentSubType
| 值 | 数量 |
|----|------|
| 科普传播 | 1870 |
| 机制图解 | 309 |
| 群体团队 | 181 |
| 实验过程 | 172 |
| 实验结果 | 166 |
| 设备空间 | 140 |
| 现场环境 | 86 |
| 个人肖像 | 32 |
| 群体肖像 | 20 |
| (空) | 188 |

空值对应：contentType='不确定' 的案例

## 推断规则摘要

- **functionalPurpose**: 按 visualStyle → contentType → visualStyle 4级优先级推断
- **distributionMedium**: 基于 mediaType（视频→视频）+ sourceDomain（nature.com信息图→图组）
- **mediaSubType**: mediaType + visualStyle/discipline 交叉推断
- **contentSubType**: contentType 一对一映射

## 约束确认

- 未删除任何现有数据
- 仅更新空字符串/NULL字段，未覆盖已有值
- TypeScript 编译零错误 (`npx tsc --noEmit` 通过)
