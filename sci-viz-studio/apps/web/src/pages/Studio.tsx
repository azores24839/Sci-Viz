import { useEffect, useMemo, useState } from 'react';
import { agentMessages, agentProfiles, changxingProject } from '@studio/fixtures';
import {
  completeNodeDraft,
  confirmNodeAndQueueNext,
  createDirectorWorkflowStates,
  getCurrentDirectorNodeId,
  markNodeRunning,
  researchPhotoWorkflowV1,
  reviseNodeDraft,
  type WorkflowNodeDefinition,
  type WorkflowNodeState,
} from '@studio/workflow-core';
import type { AgentDraftRequest, AgentDraftResponse, AgentRole, AgentTask, ProjectGoal, SourceDocument } from '@studio/contracts';
import { WorkflowCanvas } from '../features/workflow-canvas/WorkflowCanvas';
import { WorkflowFallbackList } from '../features/workflow-canvas/WorkflowFallbackList';
import { AgentContextPanel } from '../features/workflow-canvas/AgentContextPanel';
import { usableSelectedSources } from '../features/sources/sourceUtils';
import { API_BASE_URL } from '../api/client';

const nodeAgent: Record<string, AgentRole> = {
  'source-intake': 'SOURCE_ANALYST',
  'visual-diagnosis': 'SOURCE_ANALYST',
  'goal-output-selection': 'SOURCE_ANALYST',
  'case-benchmark': 'RESEARCH_CURATOR',
  'curation-strategy': 'RESEARCH_CURATOR',
  'photo-plan': 'PHOTO_PLANNER',
  'ai-reference': 'PHOTO_PLANNER',
  'plan-output': 'PHOTO_PLANNER',
};

const nodeTask: Record<string, AgentTask> = {
  'source-intake': 'DIAGNOSE_VISUAL_STATE',
  'visual-diagnosis': 'DIAGNOSE_VISUAL_STATE',
  'goal-output-selection': 'DIAGNOSE_VISUAL_STATE',
  'case-benchmark': 'BENCHMARK_CASES',
  'curation-strategy': 'GENERATE_CURATION_STRATEGY',
  'photo-plan': 'GENERATE_PHOTO_PLAN',
  'ai-reference': 'GENERATE_AI_REFERENCES',
  'plan-output': 'COMPILE_FINAL_PLAN',
};

export interface ShootingPurposeOption {
  id: ProjectGoal;
  label: string;
  description: string;
}

const shootingPurposeOptions: ShootingPurposeOption[] = [
  { id: 'ACADEMIC_COMMUNICATION', label: '学术传播', description: '突出科研对象、方法、证据和仪器能力。' },
  { id: 'PUBLIC_COMMUNICATION', label: '公众传播', description: '突出可理解的场景、人物、尺度和故事性。' },
  { id: 'RECRUITING_BRAND', label: '招生/招聘/团队品牌', description: '突出团队氛围、空间气质和工作状态。' },
  { id: 'INDUSTRY_COLLABORATION', label: '产业转化/合作', description: '突出设备平台、应用场景、可靠性和工程化能力。' },
];

function createDemoArtifact(node: WorkflowNodeDefinition, state: WorkflowNodeState) {
  const version = state.revision;
  const suffix = `v${version}`;
  const label = `${node.outputLabel} ${suffix}`;

  const drafts: Record<string, string> = {
    'source-intake': [
      '### 资料包',
      '- 资料来源：Sci-Viz Case Hub mock 资料库，包含技术维度整体分布、高校实验室内容对象样本和对标案例缩略图。',
      '- 使用范围：仅用于界面流程和诊断结构测试，后续替换为用户真实上传资料。',
    ].join('\n'),
    'visual-diagnosis': [
      '### 视觉现状诊断',
      '- 素材总览：当前使用 Sci-Viz Case Hub mock 样本作为资料源；126 条静图样本可进入结构诊断，21% 涉及屏幕、铭牌、合作单位或人员肖像等待确认。',
      '- 功能维度结构：记录型素材约 72%，解释型约 12%，展示型约 9%，传播型约 5%，数据型约 2%；现阶段只描述结构，不判断目标优先级。',
      '- 技术维度结构：拍摄 50%，绘设 19.6%，渲染 16.1%，成像 9.7%，数据 3.9%，生成 0.7%；说明资料库中真实采集仍是主流。',
      '- 内容对象结构：设备、实验过程、团队协作和人物肖像占比较高；应用场景、样品细节和脱敏数据界面相对不足。',
      '- 画面质量诊断：设备远景较多，景别层次、操作过程、尺度参照和稳定色调需要后续补强。',
      '- 风险标记：屏幕数据、设备铭牌、合作单位名称、人员面部和未公开实验细节需要进入待确认清单。',
    ].join('\n'),
    'goal-output-selection': [
      '### 目标配置',
      '- 主目标：产业转化/合作。',
      '- 次目标：公众传播。',
      '- 产物类型：拍摄静图；录影/影片暂不可选。',
      '- 目标匹配度：现有结构能够支撑设备能力展示，但对应用场景、可靠性证据和公众可理解过程支持不足。',
      '- 目标缺口：若主打产业合作，需要补足工程应用、团队协作、关键操作和安全合规画面。',
    ].join('\n'),
    'case-benchmark': [
      '### 案例对标',
      '- 对标组：Sci-Viz Case Hub 中的高校平台实验室、企业工程案例、科研机构设备场景和期刊传播静图。',
      '- 匹配依据：同为静图媒介，且包含设备尺度、实验过程、人物协作和工程应用语境。',
      '- 结构差距：我方 mock 样本记录型较高；对标组在实验过程、应用展示和传播型画面上更完整。',
      '- 借鉴方向：保留真实设备与空间秩序，同时补充人物尺度、关键操作、局部细节和外部应用语境。',
      '- 降级逻辑：同科研方向不足时，退到同目标的工程可视化和大型设备场景案例。',
    ].join('\n'),
    'curation-strategy': [
      '### 策展 brief',
      '- 视觉路线：从“设备记录”走向“工程能力可见”，用尺度、过程、细节和协作关系补足可信证据。',
      '- 叙事主线：平台能力 → 关键过程 → 团队协作 → 应用想象；不在此节点展开具体镜头参数。',
      '- 必须强化的视觉证据：大型设备尺度、科研人员操作、样品或结构细节、脱敏数据界面、工程空间秩序。',
      '- 科研审校员 · 贯穿风险层：持续检查事实、保密、安全和可拍条件；阻塞项未确认时，方案只能预览，不能标记为可执行。',
      '- 不能照搬：不使用过度商业化口号，不把未确认指标视觉化为确定成果。',
    ].join('\n'),
    'photo-plan': [
      `### ${state.planLabel ?? 'Plan A'} · 静图拍摄方案`,
      '- 对外提案：围绕工程能力、应用想象和科研协作建立视觉路线。',
      '- 画面卡：空间建立、人物与设备关系、操作过程、局部细节、脱敏屏幕。',
      '- 执行清单：拍摄对象、景别、角度、光线、色调、优先级和禁拍提醒。',
    ].join('\n'),
    'ai-reference': [
      `### ${state.planLabel ?? 'Plan A'} · AI 参考图`,
      '- 参考图 1：大型海洋装备实验空间，冷白光，人物作为尺度参照。',
      '- 参考图 2：科研人员操作控制台，屏幕内容抽象化处理。',
      '- 说明：参考图只用于沟通画面方向，不替代真实拍摄。',
    ].join('\n'),
    'plan-output': [
      `### ${state.planLabel ?? 'Plan A'} · 最终方案摘要`,
      '- 对外沟通版：现状诊断、目标、案例对标、视觉路线、拍摄主题和风险。',
      '- 摄影师执行版：拍摄对象、场景、景别、角度、光线、色调和优先级。',
      '- 下一步可以继续生成 Plan B，或进入现场执行清单。',
    ].join('\n'),
  };

  return {
    label,
    body: drafts[node.id] ?? `${node.label}草案已生成。`,
    blockerCount: 0,
  };
}

function collectUpstreamArtifacts(states: WorkflowNodeState[]) {
  return states
    .filter((state) => state.artifactBody)
    .map((state) => ({
      nodeId: state.nodeId,
      label: state.artifactLabel ?? state.nodeId,
      body: state.artifactBody!,
    }));
}

async function requestAgentDraft(
  projectId: string,
  node: WorkflowNodeDefinition,
  state: WorkflowNodeState,
  states: WorkflowNodeState[],
  sources: SourceDocument[],
): Promise<AgentDraftResponse> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const request: AgentDraftRequest = {
    projectId,
    projectName: changxingProject.name,
    nodeId: node.id,
    nodeLabel: node.label,
    agentRole: nodeAgent[node.id] ?? 'SOURCE_ANALYST',
    task: nodeTask[node.id] ?? 'DIAGNOSE_VISUAL_STATE',
    inputLabel: node.inputLabel,
    outputLabel: node.outputLabel,
    planLabel: state.planLabel ?? 'Plan A',
    revision: state.revision,
    ...(state.summary.startsWith('收到修改意见：') ? { revisionInstruction: state.summary.replace('收到修改意见：', '') } : {}),
    upstreamArtifacts: [
      ...collectUpstreamArtifacts(states),
      ...usableSelectedSources(sources).map((source) => ({
        nodeId: `source:${source.id}`,
        label: `资料：${source.title}`,
        body: [source.aiSummary, source.imageDescription, source.ocrText, source.extractedText, source.rawText].filter(Boolean).join('\n\n').slice(0, 16_000),
      })),
    ],
  };

  try {
    const response = await fetch(`${API_BASE_URL}/agent-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    const payload = await response.json() as {
      success: boolean;
      data?: AgentDraftResponse;
      error?: { code: string; message: string };
    };

    if (!response.ok || !payload.success || !payload.data) {
      throw new Error(payload.error?.message ?? `AGENT_DRAFT_REQUEST_FAILED:${response.status}`);
    }

    return payload.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('AI_DRAFT_TIMEOUT');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function createInitialStudioStates(): WorkflowNodeState[] {
  return createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => {
    if (state.nodeId !== 'source-intake') return state;
    return {
      ...state,
      status: 'AWAITING_HUMAN' as const,
      progress: 50,
      summary: '请确认资料包',
      artifactLabel: 'Sci-Viz Case Hub mock 资料源',
      artifactBody: [
        '### 资料输入',
        '- 默认资料源：Sci-Viz Case Hub mock 资料库。',
        '- 用途：用于测试视觉现状诊断、案例对标和拍摄方案流程。',
        '- 下一步：确认资料源后进入视觉现状诊断。',
      ].join('\n'),
    };
  });
}

export function Studio() {
  const [projectId] = useState(() => {
    const key = 'sci-ai-studio-test-project';
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = `${changxingProject.id}-${window.crypto.randomUUID()}`;
    window.localStorage.setItem(key, created);
    return created;
  });
  const [states, setStates] = useState<WorkflowNodeState[]>(createInitialStudioStates);
  const currentNodeId = getCurrentDirectorNodeId(researchPhotoWorkflowV1, states);
  const [selectedNodeId, setSelectedNodeId] = useState(currentNodeId);
  const [revisionText, setRevisionText] = useState('');
  const [aiProviderLabel, setAiProviderLabel] = useState('AI 检查中');
  const [primaryPurposeId, setPrimaryPurposeId] = useState<ProjectGoal>('INDUSTRY_COLLABORATION');
  const [secondaryPurposeId, setSecondaryPurposeId] = useState<ProjectGoal | ''>('PUBLIC_COMMUNICATION');
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const usableSources = usableSelectedSources(sources);

  useEffect(() => {
    if (currentNodeId) setSelectedNodeId(currentNodeId);
  }, [currentNodeId]);

  useEffect(() => {
    let cancelled = false;
    const loadProvider = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/config/ai`);
        const payload = await response.json() as { success: boolean; data?: { provider: 'mock' | 'deepseek'; configured: boolean } };
        if (cancelled) return;
        setAiProviderLabel(payload.data?.provider === 'deepseek' ? 'DeepSeek AI' : 'Mock AI');
      } catch {
        if (!cancelled) setAiProviderLabel('AI 离线');
      }
    };
    void loadProvider();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const primaryPurpose = shootingPurposeOptions.find((option) => option.id === primaryPurposeId) ?? shootingPurposeOptions[0];
    const secondaryPurpose = shootingPurposeOptions.find((option) => option.id === secondaryPurposeId);
    const body = [
      '### 目标与产物选择',
      `- 主目标：${primaryPurpose?.label ?? '待选择'}`,
      `- 次目标：${secondaryPurpose?.label ?? '暂无'}`,
      '- 产物类型：拍摄静图。',
      '- 暂不可选：录影/影片。',
      '- 目标匹配度：基于 02 的结构诊断，现有资料更擅长支撑“设备能力”和“空间秩序”，对“应用场景”和“公众可理解过程”支撑偏弱。',
      '- 目标缺口：若主目标是产业转化/合作，需要补充工程应用、可靠性证据、人物尺度和脱敏数据界面；若次目标是公众传播，需要补充可理解的过程画面。',
      '- 限制条件：设备运行状态、屏幕数据、合作单位名称和部分实验细节需要确认后才能进入可执行方案。',
    ].join('\n');

    setStates((current) => current.map((state) => state.nodeId === 'goal-output-selection' && state.status !== 'COMPLETED'
      ? {
          ...state,
          artifactBody: body,
          artifactLabel: '目标配置 v1',
          summary: primaryPurpose ? `主目标：${primaryPurpose.label}` : '请选择主目标',
        }
      : state));
  }, [primaryPurposeId, secondaryPurposeId]);

  const currentNode = researchPhotoWorkflowV1.nodes.find((node) => node.id === currentNodeId);
  const currentState = states.find((state) => state.nodeId === currentNodeId);
  const currentStatus = currentState?.status;
  const currentRevision = currentState?.revision;

  useEffect(() => {
    if (!currentNode || currentStatus !== 'READY') return;

    if (currentNode.kind === 'HUMAN_GATE') {
      setStates((value) => value.map((state) => state.nodeId === currentNode.id
        ? {
            ...state,
            status: 'AWAITING_HUMAN',
            progress: 80,
            summary: state.summary || '等待人工确认',
            artifactLabel: state.artifactLabel ?? `${currentNode.outputLabel} v${state.revision}`,
          }
        : state));
      return;
    }

    setStates((value) => markNodeRunning(value, currentNode.id));
  }, [currentNode, currentStatus]);

  useEffect(() => {
    if (!currentNode || currentStatus !== 'RUNNING') return;

    let cancelled = false;

    const generate = async () => {
      try {
        const draft = await requestAgentDraft(projectId, currentNode, currentState!, states, sources);
        if (cancelled) return;
        setStates((value) => {
          const latest = value.find((state) => state.nodeId === currentNode.id);
          if (!latest || latest.status !== 'RUNNING') return value;
          return completeNodeDraft(value, currentNode.id, {
            label: draft.label,
            body: draft.body,
            blockerCount: draft.blockerCount,
          });
        });
      } catch {
        if (cancelled) return;
        setStates((value) => {
          const latest = value.find((state) => state.nodeId === currentNode.id);
          if (!latest || latest.status !== 'RUNNING') return value;
          const fallback = createDemoArtifact(currentNode, latest);
          return completeNodeDraft(value, currentNode.id, {
            ...fallback,
            body: fallback.body,
            blockerCount: fallback.blockerCount,
          });
        });
      }
    };

    const timer = window.setTimeout(() => void generate(), 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentNode, currentState, currentStatus, currentRevision, states, sources, projectId]);

  const selectedNode = researchPhotoWorkflowV1.nodes.find((node) => node.id === selectedNodeId) ?? researchPhotoWorkflowV1.nodes[0]!;
  const selectedState = states.find((state) => state.nodeId === selectedNode.id) ?? states[0]!;
  const agent = useMemo(() => {
    const role = nodeAgent[selectedNode.id] ?? 'SOURCE_ANALYST';
    return agentProfiles.find((profile) => profile.role === role) ?? agentProfiles[0]!;
  }, [selectedNode.id]);

  const setPrimaryPurpose = (purposeId: ProjectGoal) => {
    setPrimaryPurposeId(purposeId);
    setSecondaryPurposeId((current) => current === purposeId ? '' : current);
  };

  const setSecondaryPurpose = (purposeId: ProjectGoal | '') => {
    setSecondaryPurposeId(purposeId === primaryPurposeId ? '' : purposeId);
  };

  const confirmSelectedNode = () => {
    if (selectedNode.id === 'source-intake' && usableSources.length === 0) return;
    setStates((value) => confirmNodeAndQueueNext(researchPhotoWorkflowV1, value, selectedNode.id));
    setRevisionText('');
  };

  const reviseSelectedNode = (instruction: string) => {
    setStates((value) => reviseNodeDraft(researchPhotoWorkflowV1, value, selectedNode.id, instruction));
    setRevisionText('');
  };

  return <div className="studio-shell">
    <header className="studio-header">
      <div className="brand">
        <img className="brand-logo" src="/logo.png" alt="研影" />
        <span>{changxingProject.name}</span>
      </div>
    </header>
    <main className="studio-body">
      <section className="canvas-panel" aria-label="项目工作流">
        <WorkflowCanvas
          template={researchPhotoWorkflowV1}
          states={states}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onConfirmNode={(nodeId) => {
            setSelectedNodeId(nodeId);
            setStates((value) => confirmNodeAndQueueNext(researchPhotoWorkflowV1, value, nodeId));
            setRevisionText('');
          }}
          onReviseNode={(nodeId, instruction) => {
            setSelectedNodeId(nodeId);
            setStates((value) => reviseNodeDraft(researchPhotoWorkflowV1, value, nodeId, instruction));
            setRevisionText('');
          }}
          primaryPurposeId={primaryPurposeId}
          secondaryPurposeId={secondaryPurposeId}
          purposeOptions={shootingPurposeOptions}
          onSetPrimaryPurpose={setPrimaryPurpose}
          onSetSecondaryPurpose={setSecondaryPurpose}
        />
        <WorkflowFallbackList template={researchPhotoWorkflowV1} states={states} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
      </section>
      <AgentContextPanel
        agent={agent}
        node={selectedNode}
        state={selectedState}
        messages={agentMessages}
        revisionText={revisionText}
        onRevisionTextChange={setRevisionText}
        aiProviderLabel={aiProviderLabel}
        onConfirm={confirmSelectedNode}
        onRevise={reviseSelectedNode}
        purposeOptions={shootingPurposeOptions}
        primaryPurposeId={primaryPurposeId}
        secondaryPurposeId={secondaryPurposeId}
        onSetPrimaryPurpose={setPrimaryPurpose}
        onSetSecondaryPurpose={setSecondaryPurpose}
        projectId={projectId}
        sourceCanProceed={usableSources.length > 0}
        onSourcesChange={(nextSources) => {
          setSources(nextSources);
          const selected = usableSelectedSources(nextSources);
          const failed = nextSources.filter((source) => source.status === 'FAILED').length;
          setStates((current) => current.map((state) => state.nodeId === 'source-intake' && state.status !== 'COMPLETED' ? {
            ...state,
            summary: selected.length > 0 ? `已选择 ${selected.length} 份可用资料` : '请添加并选择至少一份已解析资料',
            artifactLabel: '项目资料包',
            artifactBody: `### 资料状态\n- 共 ${nextSources.length} 份资料\n- 已选择 ${selected.length} 份可用资料\n- 失败 ${failed} 份`,
          } : state));
        }}
      />
    </main>
  </div>;
}
