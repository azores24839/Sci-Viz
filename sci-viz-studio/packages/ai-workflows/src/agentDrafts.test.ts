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
    expect(getPromptForAgent('SOURCE_ANALYST').version).toBe('source-analyst-v6');
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
        return JSON.stringify({
          conclusion: '现有资料可以初步支持项目背景理解。',
          scope: '本轮读取了 1 份资料，来源为项目说明。',
          confirmed: ['研究对象已经明确。'],
          unknowns: [{ title: '公开边界', gap: '尚未确认哪些内容可以对外使用。', impact: '高', suggestion: '补充可公开口径和保密要求。' }],
          risks: ['公开范围待确认。'],
          implications: ['当前适合先确认公开边界，再进入目标确认。'],
          basis: ['项目说明'],
        });
      },
      async generateStructured() {
        throw new Error('not used');
      },
    };

    await expect(generateAgentDraft(gateway, request)).resolves.toEqual({
      label: '视觉现状诊断 v1',
      body: expect.stringContaining('## 02｜项目理解'),
      blockerCount: 0,
      provider: 'deepseek',
      evidence: expect.any(Array),
      structured: expect.objectContaining({ role: 'SOURCE_ANALYST' }),
    });
  });

  it('accepts the v6 source analyst structure without falling back', async () => {
    const gateway: ModelGateway = {
      async generateText() {
        return JSON.stringify({
          node02: {
            conclusion: '官网资料能确认项目归属，但核心对象仍需补充。',
            scope: {
              readableSourceCount: 1,
              sourceTypes: ['官网信息'],
              summary: '本轮读取了项目官网介绍。',
            },
            readiness: {
              status: 'blocked',
              reason: '核心对象和公开口径缺失。',
              blockingIssues: ['核心对象未明确'],
            },
            sourceRelevance: [
              { sourceRef: 1, name: '项目官网', relevance: '直接相关', reason: '直接介绍项目归属。' },
            ],
            confirmed: [
              { text: '项目归属已有官网线索。', sourceRefs: [1], confidence: '高' },
            ],
            unknowns: [
              { title: '核心对象', gap: '尚未明确需要分析的核心研究对象。', impact: '高', relatedTaskId: '02A-001' },
            ],
            risks: [
              { type: '公开口径', text: '对外表述边界尚未确认。', sourceRefs: [1], level: '高' },
            ],
            basis: [
              { sourceRef: 1, name: '项目官网' },
            ],
          },
          node02A: {
            title: '资料补充与问题澄清',
            summary: { totalTasks: 1, highPriorityCount: 1, answeredCount: 0 },
            clarificationTasks: [
              {
                taskId: '02A-001',
                title: '核心对象',
                question: '请确认本项目最核心的研究对象是什么？',
                whyNeeded: '核心对象会影响项目理解。',
                impact: '高',
                requiredLevel: '必须明确',
                suggestedInput: '补充项目简介或负责人说明。',
                allowedInputTypes: ['文本回答', '链接', '文件'],
                relatedSourceRefs: [1],
                status: '未回答',
              },
            ],
          },
          meta: {
            version: 'source-analyst-v6',
            shouldEnableReanalysis: false,
            reasonForReanalysis: '',
          },
        });
      },
      async generateStructured() {
        throw new Error('not used');
      },
    };

    const result = await generateAgentDraft(gateway, request);
    expect(result.body).toContain('官网资料能确认项目归属');
    expect(result.body).toContain('状态：blocked');
    expect(result.body).toContain('项目官网｜直接相关');
    expect(result.body).toContain('clarificationTasks');
    expect(result.body).not.toContain('已收到项目资料，可形成初步项目背景理解');
  });

  it('falls back to a safe project understanding when the model returns markdown instead of JSON', async () => {
    const gateway: ModelGateway = {
      async generateText() { return '## 项目理解草案\n- 这不是 JSON'; },
      async generateStructured() { throw new Error('not used'); },
    };
    const result = await generateAgentDraft(gateway, { ...request, nodeLabel: '项目理解', outputLabel: '项目理解', upstreamArtifacts: [{ nodeId: 'source:web-1', label: '资料：项目官网', body: '[资料类型：WEB]\n项目介绍' }] });
    expect(result.body).toContain('本轮读取了 1 份资料');
    expect(result.body).toContain('### 02A_DATA');
    expect(result.body).not.toContain('这不是 JSON');
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
