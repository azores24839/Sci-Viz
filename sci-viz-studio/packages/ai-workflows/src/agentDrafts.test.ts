import { describe, expect, it } from 'vitest';
import type { AgentDraftRequest } from '@studio/contracts';
import { buildAgentUserPrompt, buildEvidence, createMockAgentDraft, generateAgentDraft, getPromptForAgent } from './agentDrafts';
import type { ModelGateway } from './modelGateway';

const request: AgentDraftRequest = {
  projectId: 'demo',
  projectName: '长兴海洋实验室',
  nodeId: 'visual-diagnosis',
  nodeLabel: '视觉现状诊断',
  agentRole: 'SOURCE_ANALYST',
  task: 'DIAGNOSE_VISUAL_STATE',
  inputLabel: '资料包',
  outputLabel: '视觉现状诊断',
  planLabel: 'Plan A',
  revision: 1,
  upstreamArtifacts: [{ nodeId: 'goal-output-selection', label: '用户选择', body: '主目标：产业转化/合作；次目标：公众传播。' }],
};

describe('agent draft generation', () => {
  it('selects a stable prompt for each agent role', () => {
    expect(getPromptForAgent('SOURCE_ANALYST').version).toBe('source-analyst-v2');
  });

  it('builds a prompt with upstream artifacts and version context', () => {
    const prompt = buildAgentUserPrompt(request);
    expect(prompt).toContain('长兴海洋实验室');
    expect(prompt).toContain('Plan A / v1');
    expect(prompt).toContain('主目标：产业转化/合作');
  });

  it('creates a mock draft when no model gateway is configured', async () => {
    await expect(generateAgentDraft(null, request)).resolves.toMatchObject({
      label: '视觉现状诊断 v1',
      provider: 'mock',
    });
  });

  it('uses the configured gateway for real model drafts', async () => {
    const gateway: ModelGateway = {
      async generateText(args) {
        expect(args.systemPrompt).toContain('资料分析师');
        expect(args.userPrompt).toContain('视觉现状诊断');
        return '真实模型草案';
      },
      async generateStructured() {
        throw new Error('not used');
      },
    };

    await expect(generateAgentDraft(gateway, request)).resolves.toEqual({
      label: '视觉现状诊断 v1',
      body: '真实模型草案',
      blockerCount: 0,
      provider: 'deepseek',
      evidence: [],
      structured: { role: 'SOURCE_ANALYST', observations: [], gaps: [] },
    });
  });

  it('keeps mock revisions labeled as the requested version', () => {
    expect(createMockAgentDraft({ ...request, revision: 2, planLabel: 'Plan B' })).toMatchObject({
      label: '视觉现状诊断 v2',
      provider: 'mock',
    });
  });

  it('marks unsupported conclusions as pending instead of confirmed facts', () => {
    const evidence = buildEvidence('- 已确认结论\n- 设备状态待确认', request);
    expect(evidence).toEqual([
      expect.objectContaining({ statement: '已确认结论', basis: 'PENDING_CONFIRMATION' }),
      expect.objectContaining({ statement: '设备状态待确认', basis: 'PENDING_CONFIRMATION' }),
    ]);
  });

  it('uses selected source ids as the basis for supported conclusions', () => {
    const withSource = { ...request, upstreamArtifacts: [{ nodeId: 'source:source-1', label: '资料', body: '内容' }] };
    expect(buildEvidence('- 资料中的结论', withSource)[0]).toMatchObject({ basis: 'SOURCE', sourceIds: ['source-1'] });
  });
});
