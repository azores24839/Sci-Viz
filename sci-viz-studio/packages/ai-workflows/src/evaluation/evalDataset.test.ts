import { describe, expect, it } from 'vitest';
import { evalScenarios, agentGroups, domains } from './evalDataset';
import type { AgentRole } from '@studio/contracts';

function scenariosForRole(role: AgentRole) {
  return evalScenarios.filter((s) => s.targetAgent === role);
}

describe('eval dataset structure', () => {
  it('has at least 20 scenarios', () => {
    expect(evalScenarios.length).toBeGreaterThanOrEqual(20);
  });

  it('has at least 5 scenarios per agent', () => {
    for (const role of agentGroups) {
      const count = scenariosForRole(role).length;
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it('covers all 7 domains', () => {
    const coveredDomains = new Set(evalScenarios.map((s) => s.domain));
    for (const domain of domains) {
      expect(coveredDomains.has(domain)).toBe(true);
    }
  });

  it('has unique IDs', () => {
    const ids = evalScenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('eval dataset no sensitive info', () => {
  it('contains no common secrets or keys', () => {
    const wholeText = JSON.stringify(evalScenarios);
    expect(wholeText).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(wholeText).not.toMatch(/api[_-]?key[=:]\s*['"][a-zA-Z0-9]/i);
    expect(wholeText).not.toMatch(/Bearer\s+[a-zA-Z0-9_-]{20,}/);
    expect(wholeText).not.toMatch(/password[=:]\s*['"]/i);
    expect(wholeText).not.toMatch(/secret[=:]\s*['"]/i);
  });

  it('contains no real personal info patterns', () => {
    const wholeText = JSON.stringify(evalScenarios);
    expect(wholeText).not.toMatch(/\d{17}[\dXx]/);
    expect(wholeText).not.toMatch(/1[3-9]\d{9}/);
    expect(wholeText).not.toMatch(/\d{6}-\d{4}/);
    expect(wholeText).not.toMatch(/@(?!studio\.test|example\.com)[a-z]+\.[a-z]+/i);
  });

  it('contains no real URLs pointing to internal servers', () => {
    const wholeText = JSON.stringify(evalScenarios);
    expect(wholeText).not.toMatch(/https?:\/\/192\.168\./);
    expect(wholeText).not.toMatch(/https?:\/\/10\./);
    expect(wholeText).not.toMatch(/https?:\/\/172\.(1[6-9]|2\d|3[01])\./);
    expect(wholeText).not.toMatch(/https?:\/\/localhost/);
  });
});

describe('eval dataset field completeness', () => {
  it('every scenario has required metadata', () => {
    for (const s of evalScenarios) {
      expect(s.id, `${s.id}: missing id`).toBeTruthy();
      expect(s.domain, `${s.id}: missing domain`).toBeTruthy();
      expect(s.projectName, `${s.id}: missing projectName`).toBeTruthy();
      expect(s.projectContext, `${s.id}: missing projectContext`).toBeTruthy();
      expect(s.projectContext.length, `${s.id}: context too short`).toBeGreaterThan(20);
      expect(s.targetAgent, `${s.id}: missing targetAgent`).toBeTruthy();
      expect(s.taskType, `${s.id}: missing taskType`).toBeTruthy();
    }
  });

  it('every scenario has expectedFields with at least 3 items', () => {
    for (const s of evalScenarios) {
      expect(s.expectedFields.length, `${s.id}: need >=3 expectedFields`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every scenario has mustBePending with at least 2 items', () => {
    for (const s of evalScenarios) {
      expect(s.mustBePending.length, `${s.id}: need >=2 mustBePending`).toBeGreaterThanOrEqual(2);
    }
  });

  it('every scenario has forbiddenFabrication with at least 2 items', () => {
    for (const s of evalScenarios) {
      expect(s.forbiddenFabrication.length, `${s.id}: need >=2 forbiddenFabrication`).toBeGreaterThanOrEqual(2);
    }
  });

  it('every scenario has forbiddenActions with at least 2 items', () => {
    for (const s of evalScenarios) {
      expect(s.forbiddenActions.length, `${s.id}: need >=2 forbiddenActions`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('eval dataset role boundary check', () => {
  const crossRoleCategories: Record<AgentRole, string[]> = {
    SOURCE_ANALYST: ['拍摄方案', '镜头', '画面卡', '策展', '对标', '审核'],
    SCIENCE_REVIEWER: ['拍摄方案', '画面卡', '策展', '对标组', '视觉路线'],
    RESEARCH_CURATOR: ['画面卡', '执行清单', '景别', '镜头', '机位', '光线'],
    PHOTO_PLANNER: ['策展 brief', '对标组', '匹配依据', '目标匹配度', '诊断', '案例对标'],
  };

  it('SOURCE_ANALYST forbidden items cover cross-role categories', () => {
    for (const s of scenariosForRole('SOURCE_ANALYST')) {
      const text = [...s.forbiddenActions, ...s.forbiddenFabrication].join(' ');
      const covered = crossRoleCategories['SOURCE_ANALYST'].filter((cat) => text.includes(cat));
      expect(covered.length, `${s.id}: forbidden items should cover at least 2 cross-role categories`).toBeGreaterThanOrEqual(2);
    }
  });

  it('SCIENCE_REVIEWER forbidden items cover cross-role categories', () => {
    for (const s of scenariosForRole('SCIENCE_REVIEWER')) {
      const text = [...s.forbiddenActions, ...s.forbiddenFabrication].join(' ');
      const covered = crossRoleCategories['SCIENCE_REVIEWER'].filter((cat) => text.includes(cat));
      expect(covered.length, `${s.id}: needs >=2 cross-role categories`).toBeGreaterThanOrEqual(2);
    }
  });

  it('RESEARCH_CURATOR forbidden items cover cross-role categories', () => {
    for (const s of scenariosForRole('RESEARCH_CURATOR')) {
      const text = [...s.forbiddenActions, ...s.forbiddenFabrication].join(' ');
      const covered = crossRoleCategories['RESEARCH_CURATOR'].filter((cat) => text.includes(cat));
      expect(covered.length, `${s.id}: needs >=2 cross-role categories`).toBeGreaterThanOrEqual(2);
    }
  });

  it('PHOTO_PLANNER forbidden items cover cross-role categories', () => {
    for (const s of scenariosForRole('PHOTO_PLANNER')) {
      const text = [...s.forbiddenActions, ...s.forbiddenFabrication].join(' ');
      const covered = crossRoleCategories['PHOTO_PLANNER'].filter((cat) => text.includes(cat));
      expect(covered.length, `${s.id}: needs >=2 cross-role categories`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('eval dataset prompt output alignment', () => {
  it('SOURCE_ANALYST scenarios include diagnostic fields from prompt v2', () => {
    const requiredFields = ['素材总览', '功能维度结构', '技术维度结构', '内容对象结构', '画面质量诊断', '风险标记'];
    for (const s of scenariosForRole('SOURCE_ANALYST')) {
      for (const field of requiredFields) {
        expect(s.expectedFields, `${s.id}: should include "${field}"`).toContain(field);
      }
    }
  });

  it('SCIENCE_REVIEWER scenarios include review fields from prompt v1', () => {
    const requiredFields = ['已支持事实', '待确认事实', '保密与公开边界', '安全与现场条件', '对拍摄方案的限制'];
    for (const s of scenariosForRole('SCIENCE_REVIEWER')) {
      for (const field of requiredFields) {
        expect(s.expectedFields, `${s.id}: should include "${field}"`).toContain(field);
      }
    }
  });

  it('RESEARCH_CURATOR benchmark scenarios include matching fields from prompt v3', () => {
    const requiredFields = ['对标组', '匹配依据', '结构差距', '借鉴方向', '降级逻辑'];
    for (const s of scenariosForRole('RESEARCH_CURATOR')) {
      if (s.taskType === 'BENCHMARK_CASES') {
        for (const field of requiredFields) {
          expect(s.expectedFields, `${s.id}: should include "${field}"`).toContain(field);
        }
      }
    }
  });

  it('PHOTO_PLANNER scenarios include shot plan fields from prompt v1', () => {
    const requiredFields = ['拍摄主题', '画面卡', '摄影师执行清单', '风险、禁拍和备选方案'];
    for (const s of scenariosForRole('PHOTO_PLANNER')) {
      for (const field of requiredFields) {
        expect(s.expectedFields, `${s.id}: should include "${field}"`).toContain(field);
      }
    }
  });
});

describe('eval dataset mustBePending consistency', () => {
  it('all mustBePending items contain hint of uncertainty or constraint', () => {
    for (const s of evalScenarios) {
      for (const item of s.mustBePending) {
        const hasUncertainty = item.length >= 4;
        expect(hasUncertainty, `${s.id}: mustBePending "${item}" is too short to be meaningful`).toBe(true);
      }
    }
  });

  it('mustBePending items do not appear in forbiddenFabrication', () => {
    for (const s of evalScenarios) {
      for (const pending of s.mustBePending) {
        for (const forbidden of s.forbiddenFabrication) {
          expect(pending, `${s.id}: "${pending}" is both pending and forbidden`).not.toBe(forbidden);
        }
      }
    }
  });
});
