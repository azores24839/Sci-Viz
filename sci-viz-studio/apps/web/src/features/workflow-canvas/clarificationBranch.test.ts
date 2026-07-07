import { describe, expect, it } from 'vitest';
import { extractClarificationItems } from './clarificationBranch';

describe('extractClarificationItems', () => {
  it('prefers v6 clarification tasks when they are available', () => {
    const items = extractClarificationItems([
      '## 02｜项目理解',
      '### 02A_DATA',
      JSON.stringify({
        unknowns: [
          { title: '旧缺口', gap: '旧格式缺口。', impact: '中', suggestion: '旧建议。' },
        ],
        clarificationTasks: [
          {
            taskId: '02A-001',
            title: '核心对象',
            question: '请确认本项目最核心的研究对象是什么？',
            whyNeeded: '核心对象会影响项目理解。',
            impact: '高',
            suggestedInput: '补充项目简介或负责人说明。',
          },
        ],
      }),
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: '02a-001',
      title: '核心对象',
      gap: '请确认本项目最核心的研究对象是什么？',
      impact: '高',
      suggestion: '补充项目简介或负责人说明。',
    });
  });

  it('filters visual-audit gaps and keeps project understanding gaps', () => {
    const items = extractClarificationItems([
      '## 02｜项目理解',
      '### 02A_DATA',
      JSON.stringify({
        unknowns: [
          { title: '视觉素材缺失', gap: '现有资料均为纯文本，无法评估视觉资源。', impact: '高', suggestion: '补充现场照片。' },
          { title: '科研方向', gap: '当前资料没有说明具体研究方向。', impact: '高', suggestion: '补充项目简介。' },
        ],
      }),
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: '科研方向', impact: '高' });
  });

  it('filters goal and audience questions because they belong to 03', () => {
    const items = extractClarificationItems([
      '## 02｜项目理解',
      '### 02A_DATA',
      JSON.stringify({
        unknowns: [
          { title: '用户调研目标与边界', gap: '未说明具体调研目的和重点关注方向。', impact: '高', suggestion: '补充调研目标。' },
          { title: '场地条件', gap: '未说明实验场地和进入限制。', impact: '中', suggestion: '补充场地条件。' },
        ],
      }),
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('场地条件');
  });

  it('can derive 02A questions from legacy project understanding sections', () => {
    const items = extractClarificationItems([
      '## 02｜项目理解',
      '### 当前无法判断的信息',
      '1. 场地条件｜未说明实验空间、设备位置和进入限制｜影响程度：高',
    ].join('\n'));

    expect(items[0]).toMatchObject({
      title: '场地条件',
      impact: '高',
    });
  });
});
