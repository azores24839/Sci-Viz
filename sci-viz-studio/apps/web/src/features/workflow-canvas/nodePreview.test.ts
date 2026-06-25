import { describe, expect, it } from 'vitest';
import { getNodePreviewTone, summarizeNodeContent } from './nodePreview';

describe('node content preview', () => {
  it('turns markdown artifacts into a compact canvas summary', () => {
    expect(summarizeNodeContent([
      '### Plan A · 科研分析草案',
      '- 研究主题：长兴海洋实验室。',
      '- 视觉机会：设备、人员协作和数据界面。',
    ].join('\n'), 'fallback')).toBe('Plan A · 科研分析草案 · 研究主题：长兴海洋实验室。 · 视觉机会：设备、人员协作和数据界面。');
  });

  it('falls back to node description when no artifact exists', () => {
    expect(summarizeNodeContent(undefined, '等待上一步完成')).toBe('等待上一步完成');
  });

  it('maps workflow statuses to display tones', () => {
    expect(getNodePreviewTone('RUNNING')).toBe('active');
    expect(getNodePreviewTone('AWAITING_HUMAN')).toBe('done');
    expect(getNodePreviewTone('LOCKED')).toBe('empty');
  });
});
