import type { AgentDraftRequest, AgentDraftResponse, AgentRole } from '@studio/contracts';
import { z } from 'zod';
import type { ModelGateway } from './modelGateway';
import { photoPlannerPrompt } from './prompts/productionDirector';
import { sourceAnalystPrompt } from './prompts/projectProducer';
import { researchCuratorPrompt } from './prompts/researchCurator';
import { scienceReviewerPrompt } from './prompts/visualStrategist';
import { aiReferencePrompt } from './prompts/aiReference';

const prompts = {
  SOURCE_ANALYST: sourceAnalystPrompt,
  SCIENCE_REVIEWER: scienceReviewerPrompt,
  RESEARCH_CURATOR: researchCuratorPrompt,
  PHOTO_PLANNER: photoPlannerPrompt,
} satisfies Record<AgentRole, { version: string; instructions: string }>;

const taskPrompts: Record<string, { version: string; instructions: string }> = {
  GENERATE_AI_REFERENCES: aiReferencePrompt,
};

const SourceDiagnosisSchema = z.object({
  conclusion: z.string().trim().min(1).max(300),
  overview: z.string().trim().min(1).max(500),
  confirmed: z.array(z.string().trim().min(1).max(300)).max(3),
  gaps: z.array(z.string().trim().min(1).max(300)).max(3),
  risks: z.array(z.string().trim().min(1).max(300)).max(3),
  basis: z.array(z.string().trim().min(1).max(300)).max(3),
});

type SourceDiagnosis = z.infer<typeof SourceDiagnosisSchema>;

function fallbackProjectUnderstanding(request: AgentDraftRequest): SourceDiagnosis {
  const sources = request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:'));
  const hasImage = sources.some((item) => item.body.includes('[资料类型：IMAGE]'));
  return {
    conclusion: hasImage ? '已收到项目资料与图片，可进入初步项目理解，具体信息仍需用户确认。' : '已收到文字或网页资料，可理解项目背景；当前没有图片资料，不对现有视觉素材做判断。',
    overview: `本轮使用 ${sources.length} 份项目资料。`,
    confirmed: sources.slice(0, 3).map((item) => `已读取“${item.label.replace(/^资料：/, '')}”。`),
    gaps: ['需要用户确认研究重点、可公开范围和本次希望解决的问题。'],
    risks: ['网页与 AI 摘要可能存在过期或误读，关键事实待用户确认。'],
    basis: sources.slice(0, 3).map((item) => item.label.replace(/^资料：/, '')),
  };
}

function parseSourceDiagnosis(raw: string, request: AgentDraftRequest): SourceDiagnosis {
  try {
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return SourceDiagnosisSchema.parse(JSON.parse(normalized));
  } catch {
    return fallbackProjectUnderstanding(request);
  }
}

function diagnosisBody(value: SourceDiagnosis) {
  const join = (items: string[]) => items.length > 0 ? items.join('；') : '暂无';
  return [
    `- 一句话结论：${value.conclusion}`,
    `- 资料概况：${value.overview}`,
    `- 已确认信息：${join(value.confirmed)}`,
    `- 关键缺口：${join(value.gaps)}`,
    `- 风险与待确认：${join(value.risks)}`,
    `- 分析依据：${join(value.basis)}`,
  ].join('\n');
}

export function getPromptForAgent(role: AgentRole) {
  return prompts[role];
}

export function parseImagePrompts(body: string): string[] {
  const matches = body.matchAll(/\[IMAGE_PROMPT\]\s*([\s\S]*?)\s*\[\/IMAGE_PROMPT\]/g);
  return Array.from(matches, (m) => m[1]!.trim()).filter(Boolean);
}

export function buildEvidence(body: string, request: AgentDraftRequest) {
  const sourceIds = request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:')).map((item) => item.nodeId.slice(7));
  return body.split('\n').map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line)).map((line) => {
    const statement = line.replace(/^[-*]\s+/, '').slice(0, 2000);
    const pending = /待确认|不确定|需要确认|需确认/.test(statement);
    return {
      statement,
      basis: pending || sourceIds.length === 0 ? 'PENDING_CONFIRMATION' as const : 'SOURCE' as const,
      sourceIds: pending ? [] : sourceIds,
      confidence: pending ? 'LOW' as const : 'MEDIUM' as const,
    };
  });
}

function buildStructured(request: AgentDraftRequest, evidence: ReturnType<typeof buildEvidence>, blockerCount: number) {
  if (request.agentRole === 'SOURCE_ANALYST') return { role: 'SOURCE_ANALYST' as const, observations: evidence, gaps: evidence.filter((item) => item.basis === 'PENDING_CONFIRMATION').map((item) => item.statement) };
  if (request.agentRole === 'SCIENCE_REVIEWER') return { role: 'SCIENCE_REVIEWER' as const, reviewItems: evidence, unresolvedBlockers: blockerCount };
  if (request.agentRole === 'RESEARCH_CURATOR') return { role: 'RESEARCH_CURATOR' as const, recommendations: evidence, selectionRationale: evidence.map((item) => item.statement) };
  return { role: 'PHOTO_PLANNER' as const, directions: evidence, executionNotes: evidence.map((item) => item.statement) };
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
    request.nodeId === 'visual-diagnosis' && request.agentRole === 'SOURCE_ANALYST'
      ? '请严格按照系统提示的 JSON 结构输出，不要输出 Markdown、代码围栏或额外解释。'
      : '请直接生成当前节点的中文草案，不要编造用户未提供的事实；不确定的地方请标注“待确认”。',
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
    : diagnosisBody({
        conclusion: request.upstreamArtifacts.some((item) => item.body.includes('[资料类型：IMAGE]'))
          ? '已有图片资料，可进行初步视觉判断，但仍需结合拍摄背景确认。'
          : '当前没有图片资料，无法评估现有照片的构图、色调和画面质量。',
        overview: `本轮使用 ${request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:')).length} 份项目资料。`,
        confirmed: ['可以识别资料中明确写出的研究对象与公开信息。'],
        gaps: ['缺少图片时，无法判断现有视觉素材的质量与风格。'],
        risks: ['未公开实验信息、人员肖像和屏幕数据需要人工确认。'],
        basis: request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:')).slice(0, 3).map((item) => item.label),
      });
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

  const body = bodyByRole[request.agentRole];
  const evidence = buildEvidence(body, request);
  const blockerCount = request.agentRole === 'SCIENCE_REVIEWER' ? 2 : 0;
  return {
    label: `${request.outputLabel} v${request.revision}`,
    body,
    blockerCount,
    provider: 'mock',
    evidence,
    structured: buildStructured(request, evidence, blockerCount),
  };
}

export async function generateAgentDraft(
  gateway: ModelGateway | null,
  request: AgentDraftRequest,
): Promise<AgentDraftResponse> {
  if (!gateway) return createMockAgentDraft(request);

  const prompt = taskPrompts[request.task] ?? getPromptForAgent(request.agentRole);
  const rawBody = await gateway.generateText({
    systemPrompt: prompt.instructions,
    userPrompt: buildAgentUserPrompt(request),
    context: { projectId: request.projectId, promptVersion: prompt.version },
  });
  const body = request.nodeId === 'visual-diagnosis' && request.agentRole === 'SOURCE_ANALYST'
    ? diagnosisBody(parseSourceDiagnosis(rawBody, request))
    : rawBody;

  const evidence = buildEvidence(body, request);
  const blockerCount = request.agentRole === 'SCIENCE_REVIEWER' && body.includes('待确认') ? 1 : 0;
  return {
    label: `${request.outputLabel} v${request.revision}`,
    body,
    blockerCount,
    provider: 'deepseek',
    evidence,
    structured: buildStructured(request, evidence, blockerCount),
  };
}
