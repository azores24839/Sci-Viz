import { describe, expect, it } from 'vitest';
import { organizeVisualDiagnosis } from './visualDiagnosisContent';

describe('organizeVisualDiagnosis', () => {
  it('combines technical metadata into one context line and hides the version', () => {
    const result = organizeVisualDiagnosis([
      { label: '项目', content: '长兴海洋实验室' },
      { label: '当前版本', content: 'Plan A / v1' },
      { label: '输入类型', content: '资料包（仅含1份官网首页文字截图）' },
      { label: '资产数量', content: '共1份可用资料。' },
      { label: '资产类型', content: '纯文字（官网首页版块与新闻标题列表）。' },
    ]);

    expect(result.context).toBe('长兴海洋实验室 · 共1份可用资料 · 纯文字（官网首页版块与新闻标题列表）');
    expect(result.context).not.toContain('Plan A');
  });

  it('reduces the standard diagnosis to four readable sections', () => {
    const result = organizeVisualDiagnosis([
      { label: '一句话结论', content: '目前只有文字资料。' },
      { label: '已确认信息', content: '实验室聚焦海洋研究。' },
      { label: '关键缺口', content: '无法判断图片质量。' },
      { label: '风险与待确认', content: '需要补充现场照片。' },
      { label: '分析依据', content: '官网首页。' },
    ]);

    expect(result.sections.map((section) => section.label)).toEqual([
      '诊断结论', '已确认的信息', '目前无法判断', '信息风险与使用限制',
    ]);
    expect(result.basis).toBe('官网首页');
  });
});
