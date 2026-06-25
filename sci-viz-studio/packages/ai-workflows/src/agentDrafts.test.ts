import { describe, expect, it } from 'vitest';
import type { AgentDraftRequest } from '@studio/contracts';
import { buildAgentUserPrompt, createMockAgentDraft, generateAgentDraft, getPromptForAgent } from './agentDrafts';
import type { ModelGateway } from './modelGateway';

const request: AgentDraftRequest = {
  projectId: 'demo',
  projectName: '长兴海洋实验室',
  nodeId: 'project-brief',
  nodeLabel: '项目简报',
  agentRole: 'PROJECT_PRODUCER',
  task: 'CREATE_PROJECT_BRIEF',
  inputLabel: '资料 / 需求 / 目标',
  outputLabel: '项目简报',
  planLabel: 'Plan A',
  revision: 1,
  upstreamArtifacts: [{ nodeId: 'project-brief', label: '用户选择', body: '主目的：科研展示；辅助目的：公众传播。' }],
};

describe('agent draft generation', () => {
  it('selects a stable prompt for each agent role', () => {
    expect(getPromptForAgent('PROJECT_PRODUCER').version).toBe('project-producer-v1');
  });

  it('builds a prompt with upstream artifacts and version context', () => {
    const prompt = buildAgentUserPrompt(request);
    expect(prompt).toContain('长兴海洋实验室');
    expect(prompt).toContain('Plan A / v1');
    expect(prompt).toContain('主目的：科研展示');
  });

  it('creates a mock draft when no model gateway is configured', async () => {
    await expect(generateAgentDraft(null, request)).resolves.toMatchObject({
      label: '项目简报 v1',
      provider: 'mock',
    });
  });

  it('uses the configured gateway for real model drafts', async () => {
    const gateway: ModelGateway = {
      async generateText(args) {
        expect(args.systemPrompt).toContain('项目制片人');
        expect(args.userPrompt).toContain('项目简报');
        return '真实模型草案';
      },
      async generateStructured() {
        throw new Error('not used');
      },
    };

    await expect(generateAgentDraft(gateway, request)).resolves.toEqual({
      label: '项目简报 v1',
      body: '真实模型草案',
      blockerCount: 0,
      provider: 'deepseek',
    });
  });

  it('keeps mock revisions labeled as the requested version', () => {
    expect(createMockAgentDraft({ ...request, revision: 2, planLabel: 'Plan B' })).toMatchObject({
      label: '项目简报 v2',
      provider: 'mock',
    });
  });
});
