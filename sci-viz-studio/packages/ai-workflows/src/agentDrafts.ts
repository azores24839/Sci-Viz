import type { AgentDraftRequest, AgentDraftResponse, AgentRole } from '@studio/contracts';
import type { ModelGateway } from './modelGateway';
import { photoPlannerPrompt } from './prompts/productionDirector';
import { sourceAnalystPrompt } from './prompts/projectProducer';
import { researchCuratorPrompt } from './prompts/researchCurator';
import { scienceReviewerPrompt } from './prompts/visualStrategist';

const prompts = {
  SOURCE_ANALYST: sourceAnalystPrompt,
  SCIENCE_REVIEWER: scienceReviewerPrompt,
  RESEARCH_CURATOR: researchCuratorPrompt,
  PHOTO_PLANNER: photoPlannerPrompt,
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
  const heading = `### ${request.nodeLabel}草案`;
  const revisionNote = request.revisionInstruction
    ? `\n- 已根据修改意见调整：${request.revisionInstruction}`
    : '';
  const sourceAnalystBody = request.nodeId === 'goal-output-selection'
    ? [
        heading,
        '- 主目标：产业转化/合作。',
        '- 次目标：公众传播。',
        '- 产物类型：拍摄静图；录影/影片暂不可选。',
        '- 目标匹配度：02 的结构诊断显示，现有素材更能支撑设备能力和空间秩序，对应用场景、可靠性证据和公众可理解过程支撑不足。',
        '- 目标缺口：补充工程应用、团队协作、关键操作、脱敏数据界面和人物尺度画面。',
        revisionNote,
      ].join('\n')
    : [
        heading,
        '- 素材总览：当前以 Sci-Viz Case Hub mock 资料库作为测试资料源；样本包含静图结构、技术维度分布和对标案例缩略图。',
        '- 功能维度结构：记录型约 72%，解释型约 12%，展示型约 9%，传播型约 5%，数据型约 2%；此处只描述现状结构，不判断传播目标。',
        '- 技术维度结构：拍摄 50%，绘设 19.6%，渲染 16.1%，成像 9.7%，数据 3.9%，生成 0.7%。',
        '- 内容对象结构：设备、实验过程、团队协作和人物肖像较多；应用场景、样品细节和脱敏数据界面不足。',
        '- 画面质量诊断：远景记录偏多，景别层次、操作过程、尺度参照和统一色调需要补强。',
        '- 风险标记：屏幕数据、设备铭牌、合作单位、人员面部和未公开实验细节待确认。',
        revisionNote,
      ].join('\n');
  const curatorBody = request.nodeId === 'case-benchmark'
    ? [
        heading,
        '- 对标组：Sci-Viz Case Hub 中的高校平台实验室、企业工程案例、科研机构设备场景和期刊传播静图。',
        '- 匹配依据：同为静图媒介，且包含设备尺度、实验过程、人物协作和工程应用语境。',
        '- 结构差距：我方 mock 样本记录型较高；对标组在实验过程、应用展示和传播型画面上更完整。',
        '- 借鉴方向：保留真实设备与空间秩序，同时补充人物尺度、关键操作、局部细节和外部应用语境。',
        revisionNote,
      ].join('\n')
    : [
        heading,
        '- 视觉路线：从“设备记录”走向“工程能力可见”，用尺度、过程、细节和协作关系补足可信证据。',
        '- 叙事主线：平台能力 → 关键过程 → 团队协作 → 应用想象。',
        '- 必须强化的视觉证据：大型设备尺度、科研人员操作、样品或结构细节、脱敏数据界面、工程空间秩序。',
        '- 科研审校员 · 贯穿风险层：持续检查事实、保密、安全和可拍条件；阻塞项未确认时，方案只能预览，不能标记为可执行。',
        '- 不能照搬：不使用过度商业化口号，不把未确认指标视觉化为确定成果。',
        revisionNote,
      ].join('\n');
  const bodyByRole: Record<AgentRole, string> = {
    SOURCE_ANALYST: sourceAnalystBody,
    SCIENCE_REVIEWER: [
      heading,
      '- 待确认事实：设备运行状态、屏幕数据、合作单位署名、是否允许人物正脸出镜。',
      '- 保密边界：控制界面、实时参数、内部结构和未公开项目名称需要标记为谨慎。',
      '- 安全要求：大型设备拍摄距离、通行区域和演示操作必须由现场负责人确认。',
      revisionNote,
    ].join('\n'),
    RESEARCH_CURATOR: curatorBody,
    PHOTO_PLANNER: [
      heading,
      '- 拍摄主题：设备尺度、操作过程、科研协作、局部细节和应用想象。',
      '- 执行建议：必拍广角环境、人物与设备关系、中近景操作、微距细节、脱敏屏幕替代画面。',
      '- 色调建议：冷白、深灰和克制蓝色点缀，保留工业现场质感但避免脏乱。',
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
