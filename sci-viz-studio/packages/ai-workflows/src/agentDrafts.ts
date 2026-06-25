import type { AgentDraftRequest, AgentDraftResponse, AgentRole } from '@studio/contracts';
import type { ModelGateway } from './modelGateway';
import { productionDirectorPrompt } from './prompts/productionDirector';
import { projectProducerPrompt } from './prompts/projectProducer';
import { researchCuratorPrompt } from './prompts/researchCurator';
import { visualStrategistPrompt } from './prompts/visualStrategist';

const prompts = {
  PROJECT_PRODUCER: projectProducerPrompt,
  RESEARCH_CURATOR: researchCuratorPrompt,
  VISUAL_STRATEGIST: visualStrategistPrompt,
  PRODUCTION_DIRECTOR: productionDirectorPrompt,
} satisfies Record<AgentRole, { version: string; instructions: string }>;

export function getPromptForAgent(role: AgentRole) {
  return prompts[role];
}

export function buildAgentUserPrompt(request: AgentDraftRequest): string {
  const upstream = request.upstreamArtifacts.length > 0
    ? request.upstreamArtifacts.map((artifact) => [
        `## 上游结果：${artifact.label}`,
        artifact.body,
      ].join('\n')).join('\n\n')
    : '暂无上游结果。';

  return [
    `项目：${request.projectName}`,
    `当前节点：${request.nodeLabel}`,
    `当前版本：${request.planLabel} / v${request.revision}`,
    `输入类型：${request.inputLabel}`,
    `目标产出：${request.outputLabel}`,
    request.revisionInstruction ? `用户修改意见：${request.revisionInstruction}` : '用户修改意见：无，生成当前步骤的第一版草案。',
    '',
    upstream,
    '',
    '请直接生成当前节点的中文草案。不要输出 JSON。不要编造用户未提供的事实；不确定的地方请标注“待确认”。',
  ].join('\n');
}

export function createMockAgentDraft(request: AgentDraftRequest): AgentDraftResponse {
  const heading = `### ${request.planLabel} · ${request.nodeLabel}草案`;
  const revisionNote = request.revisionInstruction
    ? `\n- 已根据修改意见调整：${request.revisionInstruction}`
    : '';
  const bodyByRole: Record<AgentRole, string> = {
    PROJECT_PRODUCER: [
      heading,
      '- 主目的：科研展示；辅助目的：公众传播、项目汇报。',
      '- 目标受众：科研合作方、项目评审与非专业公众。',
      '- 约束：屏幕数据、设备运行状态和合作单位名称需要确认后公开。',
      revisionNote,
    ].join('\n'),
    RESEARCH_CURATOR: [
      heading,
      '- 核心科学问题：如何用海洋装备、绿色动力和智能制造体现实验室研究价值。',
      '- 可视化机会：设备尺度、人员协作、数据界面、实验环境和深海应用场景。',
      '- 表达边界：不把设备先进性写成未经验证的性能结论。',
      revisionNote,
    ].join('\n'),
    VISUAL_STRATEGIST: [
      heading,
      '- 核心概念：用克制、清晰的影像语言把科研问题转化为可理解的视觉叙事。',
      '- 画面结构：环境建立、关键设备、操作过程、数据/结果、人物协作。',
      '- 风格建议：白底、冷蓝点缀、低噪声、高可信度。',
      revisionNote,
    ].join('\n'),
    PRODUCTION_DIRECTOR: [
      heading,
      '- 执行目标：把视觉方案转成可拍摄、可制作、可审核的素材清单。',
      '- 清单：场地、设备、人员动作、屏幕替代画面、局部细节、备选素材。',
      '- 风险：安全边界、涉密画面、设备运行状态和现场权限。',
      revisionNote,
    ].join('\n'),
  };

  return {
    label: `${request.outputLabel} v${request.revision}`,
    body: bodyByRole[request.agentRole],
    blockerCount: request.agentRole === 'RESEARCH_CURATOR' ? 2 : 0,
    provider: 'mock',
  };
}

export async function generateAgentDraft(
  gateway: ModelGateway | null,
  request: AgentDraftRequest,
): Promise<AgentDraftResponse> {
  if (!gateway) return createMockAgentDraft(request);

  const prompt = getPromptForAgent(request.agentRole);
  const body = await gateway.generateText({
    systemPrompt: prompt.instructions,
    userPrompt: buildAgentUserPrompt(request),
    context: { projectId: request.projectId, promptVersion: prompt.version },
  });

  return {
    label: `${request.outputLabel} v${request.revision}`,
    body,
    blockerCount: request.agentRole === 'RESEARCH_CURATOR' && body.includes('待确认') ? 1 : 0,
    provider: 'deepseek',
  };
}
