import { describe, expect, it } from 'vitest';
import { fallbackProjectIntake } from './routes';

describe('fallbackProjectIntake', () => {
  it('extracts URLs and a declared collaboration goal without inventing a confirmed goal', () => {
    const result = fallbackProjectIntake('我们在做深海柔性机械臂，准备找产业合作方。https://lab.example/research', []);
    expect(result.urls).toEqual(['https://lab.example/research']);
    expect(result.primaryGoal).toBe('INDUSTRY_COLLABORATION');
    expect(result.goalEvidence).toContain('产业合作方');
    expect(result.searchQuery).toContain('实验过程');
    expect(result.searchQuery).toContain('lab.example/research');
    expect(result.usedAi).toBe(false);
  });

  it('uses a file name as a safe title when prose is unavailable', () => {
    const result = fallbackProjectIntake('https://example.org', ['量子材料项目.pdf']);
    expect(result.title).toBe('量子材料项目');
  });
});
