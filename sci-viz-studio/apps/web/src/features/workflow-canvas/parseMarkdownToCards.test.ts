import { describe, expect, it } from 'vitest';
import { cleanMarkdownText, parseMdToCards } from './parseMarkdownToCards';

describe('markdown card parsing', () => {
  it('turns labeled list items into cards', () => {
    expect(parseMdToCards([
      '### Plan A · 目标配置',
      '- 主目标：产业转化/合作',
      '- 产物类型：拍摄静图',
    ].join('\n'))).toEqual([
      { label: '主目标', content: '产业转化/合作' },
      { label: '产物类型', content: '拍摄静图' },
    ]);
  });

  it('keeps table headers across markdown separator rows', () => {
    expect(parseMdToCards([
      '| 阶段 | 目标 | 产物 |',
      '| --- | --- | --- |',
      '| 采集 | 确认现场素材 | shot list |',
      '| 叙事 | 串联科研价值 | story arc |',
    ].join('\n'))).toEqual([
      { label: '采集', content: '目标：确认现场素材 · 产物：shot list' },
      { label: '叙事', content: '目标：串联科研价值 · 产物：story arc' },
    ]);
  });

  it('cleans markdown emphasis and bullets from text', () => {
    expect(cleanMarkdownText('- **目标受众**：`公众`')).toBe('目标受众：公众');
  });
});
