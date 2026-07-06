import { describe, expect, it } from 'vitest';
import type { SourceDocument } from '@studio/contracts';
import { buildResearchQuery, normalizeResearchText, TAVILY_QUERY_LIMIT, truncateResearchQuery } from './researchQuery.js';

const source = (overrides: Partial<SourceDocument>): SourceDocument => ({
  id: crypto.randomUUID(), projectId: 'project-a', kind: 'TEXT', status: 'READY', selected: true,
  title: '项目资料', rawText: '', truncated: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('research query builder', () => {
  it('limits an oversized base query even when no project sources exist', () => {
    const query = buildResearchQuery('深海机器人实验与科研影像拍摄需求'.repeat(80));
    expect(query.length).toBeLessThanOrEqual(TAVILY_QUERY_LIMIT);
  });

  it('keeps the user request first and samples multiple selected sources fairly', () => {
    const query = buildResearchQuery('寻找适合产业合作传播的拍摄信息', [
      source({ title: '设备结构', aiSummary: '机械臂关节与末端执行器'.repeat(20) }),
      source({ title: '实验过程', aiSummary: '水池测试和深海压力测试'.repeat(20) }),
      source({ title: '安全限制', aiSummary: '部分设备编号不能公开'.repeat(20) }),
    ]);
    expect(query.startsWith('寻找适合产业合作传播的拍摄信息')).toBe(true);
    expect(query).toContain('设备结构');
    expect(query).toContain('实验过程');
    expect(query).toContain('安全限制');
    expect(query.length).toBeLessThanOrEqual(TAVILY_QUERY_LIMIT);
  });

  it('deduplicates identical source fragments', () => {
    const duplicate = source({ title: '同一资料', aiSummary: '重复摘要' });
    const query = buildResearchQuery('研究需求', [duplicate, { ...duplicate, id: crypto.randomUUID() }]);
    expect(query.match(/同一资料/g)).toHaveLength(1);
  });

  it('normalizes whitespace and repeated punctuation without changing a short query', () => {
    expect(normalizeResearchText('  深海机器人   实验；；  拍摄  ')).toBe('深海机器人 实验;拍摄');
    expect(buildResearchQuery('深海机器人实验')).toBe('深海机器人实验');
  });

  it('does not split an emoji surrogate pair or a URL when truncating', () => {
    const url = 'https://example.edu/laboratory/deep-sea-robot-project';
    const query = truncateResearchQuery(`${'科研项目😀'.repeat(45)} ${url} 后续拍摄需求`, 180);
    expect(query.endsWith('\uD83D')).toBe(false);
    expect(query.includes('https://') && !query.includes(url)).toBe(false);
    expect(query.length).toBeLessThanOrEqual(180);
  });

  it('keeps a valid origin instead of cutting through an extremely long URL', () => {
    const query = truncateResearchQuery(`https://example.edu/${'very-long-path/'.repeat(30)}`, 80);
    expect(() => new URL(query)).not.toThrow();
    expect(query).toBe('https://example.edu');
  });
});
