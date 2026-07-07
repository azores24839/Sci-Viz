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

const RawImpactSchema = z.enum(['高', '中', '低']);
const ImpactSchema = z.preprocess((value) => value === '高/中/低' ? '中' : value, RawImpactSchema);
const ReadinessStatusSchema = z.preprocess(
  (value) => value === 'ready/conditional/blocked' ? 'conditional' : value,
  z.enum(['ready', 'conditional', 'blocked']),
);
const SourceRelevanceSchema = z.preprocess(
  (value) => value === '直接相关/间接相关/关联待确认/不建议使用' ? '关联待确认' : value,
  z.enum(['直接相关', '间接相关', '关联待确认', '不建议使用']),
);
const RiskTypeSchema = z.preprocess(
  (value) => value === '保密/安全/商业信息/隐私/事实归属/公开口径/审批' ? '公开口径' : value,
  z.enum(['保密', '安全', '商业信息', '隐私', '事实归属', '公开口径', '审批']),
);
const RequiredLevelSchema = z.preprocess(
  (value) => value === '必须明确/重要补充/可选补充' ? '重要补充' : value,
  z.enum(['必须明确', '重要补充', '可选补充']),
);
const ClarificationStatusSchema = z.preprocess(
  (value) => value === '未回答/已回答/已从01补充/暂无法确认/已用于重新分析' ? '未回答' : value,
  z.enum(['未回答', '已回答', '已从01补充', '暂无法确认', '已用于重新分析']),
);

const LegacySourceDiagnosisSchema = z.object({
  conclusion: z.string().trim().min(1).max(300),
  scope: z.string().trim().min(1).max(900),
  confirmed: z.array(z.string().trim().min(1).max(360)).max(6),
  unknowns: z.array(z.object({
    title: z.string().trim().min(1).max(80),
    gap: z.string().trim().min(1).max(360),
    impact: ImpactSchema,
    suggestion: z.string().trim().min(1).max(360),
  })).max(10),
  risks: z.array(z.string().trim().min(1).max(360)).max(6),
  implications: z.array(z.string().trim().min(1).max(360)).max(4),
  basis: z.array(z.string().trim().min(1).max(300)).max(8),
});

const SourceAnalystV6Schema = z.object({
  node02: z.object({
    conclusion: z.string().trim().min(1).max(300),
    scope: z.object({
      readableSourceCount: z.number().int().min(0).max(200),
      sourceTypes: z.array(z.string().trim().min(1).max(80)).max(12),
      summary: z.string().trim().min(1).max(900),
    }),
    readiness: z.object({
      status: ReadinessStatusSchema,
      reason: z.string().trim().min(1).max(500),
      blockingIssues: z.array(z.string().trim().min(1).max(240)).max(8),
    }),
    sourceRelevance: z.array(z.object({
      sourceRef: z.number().int().min(1).max(999),
      name: z.string().trim().min(1).max(200),
      relevance: SourceRelevanceSchema,
      reason: z.string().trim().min(1).max(360),
    })).max(12),
    confirmed: z.array(z.object({
      text: z.string().trim().min(1).max(360),
      sourceRefs: z.array(z.number().int().min(1).max(999)).max(8),
      confidence: ImpactSchema,
    })).max(6),
    unknowns: z.array(z.object({
      title: z.string().trim().min(1).max(80),
      gap: z.string().trim().min(1).max(360),
      impact: ImpactSchema,
      relatedTaskId: z.string().trim().max(40).optional().default(''),
    })).max(10),
    risks: z.array(z.object({
      type: RiskTypeSchema,
      text: z.string().trim().min(1).max(360),
      sourceRefs: z.array(z.number().int().min(1).max(999)).max(8),
      level: ImpactSchema,
    })).max(6),
    basis: z.array(z.object({
      sourceRef: z.number().int().min(1).max(999),
      name: z.string().trim().min(1).max(300),
    })).max(8),
  }),
  node02A: z.object({
    title: z.string().trim().min(1).max(80),
    summary: z.object({
      totalTasks: z.number().int().min(0).max(20),
      highPriorityCount: z.number().int().min(0).max(20),
      answeredCount: z.number().int().min(0).max(20),
    }),
    clarificationTasks: z.array(z.object({
      taskId: z.string().trim().min(1).max(40),
      title: z.string().trim().min(1).max(80),
      question: z.string().trim().min(1).max(360),
      whyNeeded: z.string().trim().min(1).max(360),
      impact: ImpactSchema,
      requiredLevel: RequiredLevelSchema,
      suggestedInput: z.string().trim().min(1).max(360),
      allowedInputTypes: z.array(z.enum(['文本回答', '链接', '文件'])).max(3),
      relatedSourceRefs: z.array(z.number().int().min(1).max(999)).max(8),
      status: ClarificationStatusSchema,
    })).max(10),
  }),
  meta: z.object({
    version: z.string().trim().min(1).max(80),
    shouldEnableReanalysis: z.boolean(),
    reasonForReanalysis: z.string().trim().max(360),
  }),
});

type LegacySourceDiagnosis = z.infer<typeof LegacySourceDiagnosisSchema>;
type SourceAnalystV6 = z.infer<typeof SourceAnalystV6Schema>;

type SourceClarificationTask = SourceAnalystV6['node02A']['clarificationTasks'][number];

type SourceDiagnosis = LegacySourceDiagnosis & {
  readiness?: SourceAnalystV6['node02']['readiness'];
  sourceRelevance?: SourceAnalystV6['node02']['sourceRelevance'];
  clarificationTasks?: SourceClarificationTask[];
};

const visualAuditPattern = /视觉素材|视觉来源|视觉资源|现有视觉|图片质量|照片.*构图|构图|色调|画面质量|现场照片|视频|平面图|设备实物图/;
const goalBoundaryPattern = /用户.*(?:目标|目的|边界)|调研目标|调研目的|传播目标|目标与受众|受众|本次希望|重点关注方向/;

function removeVisualAuditUnknowns(unknowns: SourceDiagnosis['unknowns']) {
  return unknowns.filter((item) => {
    const text = `${item.title}\n${item.gap}\n${item.suggestion}`;
    return !visualAuditPattern.test(text) && !goalBoundaryPattern.test(text);
  });
}

function removeInvalidClarificationTasks(tasks: SourceClarificationTask[] = []) {
  return tasks.filter((item) => {
    const text = `${item.title}\n${item.question}\n${item.whyNeeded}\n${item.suggestedInput}`;
    return !visualAuditPattern.test(text) && !goalBoundaryPattern.test(text);
  }).slice(0, 10);
}

function normalizeSourceDiagnosis(value: SourceDiagnosis): SourceDiagnosis {
  const unknowns = removeVisualAuditUnknowns(value.unknowns);
  const clarificationTasks = removeInvalidClarificationTasks(value.clarificationTasks);
  return {
    ...value,
    confirmed: value.confirmed.filter((item) => !visualAuditPattern.test(item)).slice(0, 6),
    unknowns: unknowns.length > 0 ? unknowns : [
      { title: '科研方向', gap: '当前资料仍不足以判断具体科研方向、核心对象和代表成果。', impact: '高', suggestion: '补充项目简介、研究方向说明或代表成果材料。' },
      { title: '公开与保密边界', gap: '尚未确认哪些设备、数据、空间和合作信息可以对外使用。', impact: '高', suggestion: '补充可公开口径、保密审查要求或禁止展示清单。' },
    ],
    risks: value.risks.filter((item) => !visualAuditPattern.test(item)).slice(0, 6),
    implications: value.implications.filter((item) => !visualAuditPattern.test(item)).slice(0, 4),
    basis: value.basis.slice(0, 8),
    ...(clarificationTasks.length > 0 ? { clarificationTasks } : {}),
  };
}

function formatRefs(refs: number[]) {
  return refs.length > 0 ? `来源：${refs.join('、')}` : '来源待确认';
}

function v6TaskToUnknown(task: SourceClarificationTask): SourceDiagnosis['unknowns'][number] {
  return {
    title: task.title,
    gap: task.question,
    impact: task.impact,
    suggestion: task.suggestedInput || task.whyNeeded,
  };
}

function sourceDiagnosisFromV6(value: SourceAnalystV6): SourceDiagnosis {
  const tasks = removeInvalidClarificationTasks(value.node02A.clarificationTasks);
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const unknowns = value.node02.unknowns.map((item) => {
    const relatedTask = item.relatedTaskId ? taskById.get(item.relatedTaskId) : undefined;
    return {
      title: item.title,
      gap: item.gap,
      impact: item.impact,
      suggestion: relatedTask?.suggestedInput || relatedTask?.question || '请补充可以支持判断的文字、链接或文件。',
    };
  });
  const taskBackfill = tasks
    .filter((task) => !unknowns.some((item) => item.title === task.title))
    .map(v6TaskToUnknown);

  return normalizeSourceDiagnosis({
    conclusion: value.node02.conclusion,
    scope: [
      value.node02.scope.summary,
      `可读来源 ${value.node02.scope.readableSourceCount} 个`,
      value.node02.scope.sourceTypes.length > 0 ? `来源类型：${value.node02.scope.sourceTypes.join('、')}` : '',
    ].filter(Boolean).join('；'),
    confirmed: value.node02.confirmed.map((item) => `${item.text}（证据强度：${item.confidence}，${formatRefs(item.sourceRefs)}）`),
    unknowns: [...unknowns, ...taskBackfill].slice(0, 10),
    risks: value.node02.risks.map((item) => `${item.type}（${item.level}）：${item.text}（${formatRefs(item.sourceRefs)}）`),
    implications: [
      `资料完整度：${value.node02.readiness.status}｜${value.node02.readiness.reason}`,
      ...value.node02.readiness.blockingIssues.map((item) => `阻塞问题：${item}`),
    ].slice(0, 4),
    basis: value.node02.basis.map((item) => item.name),
    readiness: value.node02.readiness,
    sourceRelevance: value.node02.sourceRelevance,
    clarificationTasks: tasks,
  });
}

function fallbackProjectUnderstanding(request: AgentDraftRequest): SourceDiagnosis {
  const sources = request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:'));
  return {
    conclusion: sources.length > 0 ? '已收到项目资料，可形成初步项目背景理解；关键事实仍需用户确认。' : '当前缺少可用项目资料，只能生成待补充的问题框架。',
    scope: `本轮读取了 ${sources.length} 份资料，主要用于判断项目背景、公开信息、研究对象和待确认边界。`,
    confirmed: sources.slice(0, 6).map((item) => `已读取“${item.label.replace(/^资料：/, '')}”。`),
    unknowns: [
      { title: '研究重点', gap: '当前资料尚不足以稳定判断项目的具体科研方向、核心对象和优先叙事重点。', impact: '高', suggestion: '补充项目简介、研究方向说明、代表成果或团队对外介绍。' },
      { title: '公开与保密边界', gap: '现有资料无法确认哪些设备、数据、空间和合作信息可公开使用。', impact: '高', suggestion: '补充可拍/不可拍清单、保密审查要求或对外宣传口径。' },
      { title: '现场条件', gap: '目前缺少场地、设备、人员进入和拍摄限制等执行条件。', impact: '中', suggestion: '补充场地说明、可进入区域、拍摄时间窗口和现场负责人要求。' },
    ],
    risks: ['网页与 AI 摘要可能存在过期或误读，关键事实待用户确认。'],
    implications: ['当前更适合先完成背景理解、风险边界和待确认清单，再进入目标确认与后续节点。'],
    basis: sources.slice(0, 8).map((item) => item.label.replace(/^资料：/, '')),
  };
}

function parseSourceDiagnosis(raw: string, request: AgentDraftRequest): SourceDiagnosis {
  try {
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(normalized);
    const v6 = SourceAnalystV6Schema.safeParse(parsed);
    if (v6.success) return sourceDiagnosisFromV6(v6.data);
    return normalizeSourceDiagnosis(LegacySourceDiagnosisSchema.parse(parsed));
  } catch {
    return fallbackProjectUnderstanding(request);
  }
}

function diagnosisBody(value: SourceDiagnosis) {
  const list = (items: string[]) => items.length > 0 ? items.map((item, index) => `${index + 1}. ${item}`).join('\n') : '暂无';
  const readiness = value.readiness
    ? `状态：${value.readiness.status}｜${value.readiness.reason}${value.readiness.blockingIssues.length > 0 ? `\n${list(value.readiness.blockingIssues.map((item) => `阻塞问题：${item}`))}` : ''}`
    : '暂无';
  const sourceRelevance = value.sourceRelevance && value.sourceRelevance.length > 0
    ? value.sourceRelevance.slice(0, 8).map((item, index) => `${index + 1}. ${item.name}｜${item.relevance}｜${item.reason}`).join('\n')
    : '暂无';
  const unknownCount = value.unknowns.length;
  const highCount = value.unknowns.filter((item) => item.impact === '高').length;
  const unknownSummary = value.unknowns.length > 0
    ? value.unknowns.slice(0, 3).map((item) => `${item.title}（${item.impact}）`).join('、')
    : '暂无';
  const unknownList = value.unknowns.length > 0
    ? value.unknowns.slice(0, 5).map((item, index) => `${index + 1}. ${item.title}｜${item.gap}｜影响程度：${item.impact}`).join('\n')
    : '暂无';
  return [
    '## 02｜项目理解',
    '',
    '### 本次分析范围',
    value.scope,
    '',
    '### 诊断结论',
    value.conclusion,
    '',
    '### 资料完整度',
    readiness,
    '',
    '### 来源相关性',
    sourceRelevance,
    '',
    '### 已确认信息',
    list(value.confirmed),
    '',
    '### 当前无法判断的信息',
    unknownList,
    '',
    '### 信息风险与使用限制',
    list(value.risks),
    '',
    '### 对后续节点的初步影响',
    list(value.implications),
    '',
    '### 资料补充入口',
    `仍有 ${unknownCount} 项资料需要补充，其中高优先级 ${highCount} 项｜查看补充清单：${unknownSummary}`,
    '',
    '### 分析依据',
    value.basis.length > 0 ? `本轮主要依据已选项目资料，重点来源包括 ${value.basis.slice(0, 3).join('、')}。其余来源作为背景校验，不在正文逐条展开。` : '暂无',
    '',
    '### 02A_DATA',
    JSON.stringify({ unknowns: value.unknowns, clarificationTasks: value.clarificationTasks ?? [] }),
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
  const sourceIds = request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:')).map((item) => item.nodeId.slice(7)).slice(0, 3);
  return body.split('\n').map((line) => line.trim()).filter((line) => /^(?:[-*]|\d+\.)\s+/.test(line)).map((line) => {
    const statement = line.replace(/^(?:[-*]|\d+\.)\s+/, '').slice(0, 2000);
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
        conclusion: '已收到项目资料，可形成初步项目背景理解；关键事实仍需用户确认。',
        scope: `本轮读取了 ${request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:')).length} 份项目资料。`,
        confirmed: ['可以识别资料中明确写出的研究对象与公开信息。'],
        unknowns: [
          { title: '研究方向', gap: '当前资料仍不足以判断具体科研方向、核心对象和代表成果。', impact: '高', suggestion: '补充项目简介、研究方向说明或代表成果材料。' },
          { title: '公开边界', gap: '尚未确认哪些信息、空间、设备和数据可以对外使用。', impact: '高', suggestion: '补充可公开口径、保密审查要求或禁止展示清单。' },
          { title: '现场条件', gap: '缺少场地、可进入区域、时间窗口和现场限制说明。', impact: '中', suggestion: '补充场地说明、可拍区域和现场执行限制。' },
        ],
        risks: ['未公开实验信息、人员肖像和屏幕数据需要人工确认。'],
        implications: ['当前适合先完成资料边界和待确认问题，再进入目标确认。'],
        basis: request.upstreamArtifacts.filter((item) => item.nodeId.startsWith('source:')).slice(0, 8).map((item) => item.label),
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
