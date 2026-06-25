import type { AgentDraftRequest, AgentDraftResponse, AgentRole } from '@studio/contracts';
import type { ModelGateway } from './modelGateway';
import { photographyDirectorPrompt } from './prompts/photographyDirector';
import { researchAnalystPrompt } from './prompts/researchAnalyst';
import { scienceReviewerPrompt } from './prompts/scienceReviewer';
import { visualPlannerPrompt } from './prompts/visualPlanner';

const prompts = {
  RESEARCH_ANALYST: researchAnalystPrompt,
  SCIENCE_REVIEWER: scienceReviewerPrompt,
  VISUAL_PLANNER: visualPlannerPrompt,
  PHOTOGRAPHY_DIRECTOR: photographyDirectorPrompt,
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
    RESEARCH_ANALYST: [
      heading,
      '- 研究主题：围绕项目资料提炼核心科学问题、实验对象与影像表达机会。',
      '- 视觉机会：优先呈现设备、样品、人员协作、数据界面和实验环境之间的关系。',
      '- 待确认：公开边界、关键术语、可拍摄设备和原始数据可见范围。',
      revisionNote,
    ].join('\n'),
    SCIENCE_REVIEWER: [
      heading,
      '- 通过项：当前草案可以作为后续影像策划的基础。',
      '- 风险项：避免把描述性观察写成未经证实的科学结论。',
      '- 待确认：实验条件、设备性能、合作单位名称和可公开数据范围。',
      revisionNote,
    ].join('\n'),
    VISUAL_PLANNER: [
      heading,
      '- 核心概念：用克制、清晰的影像语言把科研问题转化为可理解的视觉叙事。',
      '- 画面结构：环境建立、关键设备、操作过程、数据/结果、人物协作。',
      '- 风格建议：白底、冷蓝点缀、低噪声、高可信度。',
      revisionNote,
    ].join('\n'),
    PHOTOGRAPHY_DIRECTOR: [
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
    blockerCount: request.agentRole === 'SCIENCE_REVIEWER' ? 2 : 0,
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
    blockerCount: request.agentRole === 'SCIENCE_REVIEWER' && body.includes('待确认') ? 1 : 0,
    provider: 'deepseek',
  };
}
