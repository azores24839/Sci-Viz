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
import type { AgentDraftRequest, AgentDraftResponse, AgentRole, AgentTask } from '@studio/contracts';
import { WorkflowCanvas } from '../features/workflow-canvas/WorkflowCanvas';
import { WorkflowFallbackList } from '../features/workflow-canvas/WorkflowFallbackList';
import { AgentContextPanel } from '../features/workflow-canvas/AgentContextPanel';

const nodeAgent: Record<string, AgentRole> = {
  'project-brief': 'PROJECT_PRODUCER',
  'research-curation': 'RESEARCH_CURATOR',
  'visual-strategy': 'VISUAL_STRATEGIST',
  'production-plan': 'PRODUCTION_DIRECTOR',
  'plan-output': 'PROJECT_PRODUCER',
};

const nodeTask: Record<string, AgentTask> = {
  'project-brief': 'CREATE_PROJECT_BRIEF',
  'research-curation': 'CURATE_RESEARCH_NARRATIVE',
  'visual-strategy': 'DESIGN_VISUAL_STRATEGY',
  'production-plan': 'PLAN_PRODUCTION',
  'plan-output': 'COMPILE_FINAL_PLAN',
};

export interface ShootingPurposeOption {
  id: string;
  label: string;
  description: string;
}

const shootingPurposeOptions: ShootingPurposeOption[] = [
  { id: 'research-showcase', label: '科研展示', description: '突出科学问题、技术路线和证据链。' },
  { id: 'commercial-promo', label: '商业宣传', description: '突出应用价值、成果转化和产业场景。' },
  { id: 'government-report', label: '党政报告', description: '突出平台能力、战略意义和规范表达。' },
  { id: 'public-science', label: '大众科普', description: '降低理解门槛，强调故事性和吸引力。' },
  { id: 'project-defense', label: '项目答辩', description: '突出创新点、路线图、成果和风险控制。' },
  { id: 'talent-recruiting', label: '招生/引才', description: '突出团队氛围、科研环境和成长机会。' },
];

function createDemoArtifact(node: WorkflowNodeDefinition, state: WorkflowNodeState) {
  const version = state.revision;
  const suffix = `v${version}`;
  const label = `${node.outputLabel} ${suffix}`;

  const drafts: Record<string, string> = {
    'project-brief': [
      `### ${state.planLabel ?? 'Plan A'} · 项目简报`,
      '- 主目的：科研展示；辅助目的：大众科普、项目答辩。',
      '- 目标受众：科研合作方、项目评审与非专业公众。',
      '- 约束：屏幕数据、设备运行状态和合作单位名称需要确认。',
    ].join('\n'),
    'research-curation': [
      `### ${state.planLabel ?? 'Plan A'} · 科研叙事草案`,
      '- 科学问题：围绕海洋装备、绿色动力、智能制造和深海实验构建科研叙事。',
      '- 可视化机会：设备尺度、人员协作、控制屏幕、实验环境和应用场景。',
      '- 表达边界：不要把设备先进性写成未经验证的性能结论。',
    ].join('\n'),
    'visual-strategy': [
      `### ${state.planLabel ?? 'Plan A'} · 影像方案草案`,
      '- 核心概念：把实验室表现为“海洋工程问题被看见、被验证、被转译”的空间。',
      '- 画面结构：环境建立镜头、设备细节、人员操作、数据界面、成果输出。',
      '- 风格：白底克制、冷蓝点缀、强调可信和清洁的科研质感。',
    ].join('\n'),
    'production-plan': [
      `### ${state.planLabel ?? 'Plan A'} · 执行清单`,
      '- 拍摄清单：实验室外观、核心设备、操作手部、科研人员讨论、屏幕抽象化画面。',
      '- 准备事项：确认安全边界、设备运行状态、脱敏素材、人员授权。',
      '- 备选方案：若现场不可拍，使用局部细节、示意渲染和采访音轨补足。',
    ].join('\n'),
    'plan-output': [
      `### ${state.planLabel ?? 'Plan A'} · 最终方案摘要`,
      '- 已形成从科研理解、科学审校、事实确认、视觉方案到执行清单的完整草案。',
      '- 下一步可以导出为 Markdown/PDF/PPT，或继续对任一节点生成 Plan B。',
    ].join('\n'),
  };

  return {
    label,
    body: drafts[node.id] ?? `${node.label}草案已生成。`,
    blockerCount: node.id === 'research-curation' ? 2 : 0,
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
  node: WorkflowNodeDefinition,
  state: WorkflowNodeState,
  states: WorkflowNodeState[],
): Promise<AgentDraftResponse> {
  const request: AgentDraftRequest = {
    projectId: changxingProject.id,
    projectName: changxingProject.name,
    nodeId: node.id,
    nodeLabel: node.label,
    agentRole: nodeAgent[node.id] ?? 'PROJECT_PRODUCER',
    task: nodeTask[node.id] ?? 'CREATE_PROJECT_BRIEF',
    inputLabel: node.inputLabel,
    outputLabel: node.outputLabel,
    planLabel: state.planLabel ?? 'Plan A',
    revision: state.revision,
    ...(state.summary.startsWith('收到修改意见：') ? { revisionInstruction: state.summary.replace('收到修改意见：', '') } : {}),
    upstreamArtifacts: collectUpstreamArtifacts(states),
  };

  const response = await fetch('http://127.0.0.1:3011/api/v1/agent-drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
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
}

function createInitialStudioStates(): WorkflowNodeState[] {
  return createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => {
    if (state.nodeId !== 'project-brief') return state;
    return {
      ...state,
      status: 'AWAITING_HUMAN' as const,
      progress: 50,
      summary: '请选择拍摄目的',
      artifactLabel: '项目简报',
      artifactBody: '项目制片人需要先确认拍摄目的。请选择一个主目的，也可以选择多个辅助目的；后续 Agent 会围绕这个方向制定内容。',
    };
  });
}

export function Studio() {
  const [states, setStates] = useState<WorkflowNodeState[]>(createInitialStudioStates);
  const currentNodeId = getCurrentDirectorNodeId(researchPhotoWorkflowV1, states);
  const [selectedNodeId, setSelectedNodeId] = useState(currentNodeId);
  const [revisionText, setRevisionText] = useState('');
  const [aiProviderLabel, setAiProviderLabel] = useState('AI 检查中');
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<string[]>(['research-showcase']);
  const [primaryPurposeId, setPrimaryPurposeId] = useState('research-showcase');

  useEffect(() => {
    if (currentNodeId) setSelectedNodeId(currentNodeId);
  }, [currentNodeId]);

  useEffect(() => {
    let cancelled = false;
    const loadProvider = async () => {
      try {
        const response = await fetch('http://127.0.0.1:3011/api/v1/config/ai');
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
    const selectedPurposes = shootingPurposeOptions.filter((option) => selectedPurposeIds.includes(option.id));
    const primaryPurpose = shootingPurposeOptions.find((option) => option.id === primaryPurposeId) ?? selectedPurposes[0];
    const supportPurposes = selectedPurposes.filter((option) => option.id !== primaryPurpose?.id);
    const body = [
      '### Plan A · 项目简报',
      `- 主目的：${primaryPurpose?.label ?? '待选择'}`,
      `- 辅助目的：${supportPurposes.length > 0 ? supportPurposes.map((option) => option.label).join('、') : '暂无'}`,
      '- 项目背景：长兴海洋实验室希望围绕海洋装备、绿色动力、智能制造和深海实验场景形成科研影像方案。',
      '- 可用素材：实验室空间、科研设备、团队协作、控制屏幕、设备局部、访谈内容和部分可公开项目资料。',
      '- 限制条件：设备运行状态、屏幕数据、合作单位名称和部分实验细节需要科研人员确认后才能公开。',
    ].join('\n');

    setStates((current) => current.map((state) => state.nodeId === 'project-brief' && state.status !== 'COMPLETED'
      ? {
          ...state,
          artifactBody: body,
          artifactLabel: '项目简报 v1',
          summary: primaryPurpose ? `主目的：${primaryPurpose.label}` : '请选择拍摄目的',
        }
      : state));
  }, [primaryPurposeId, selectedPurposeIds]);

  const currentNode = researchPhotoWorkflowV1.nodes.find((node) => node.id === currentNodeId);
  const currentState = states.find((state) => state.nodeId === currentNodeId);
  const currentStatus = currentState?.status;
  const currentRevision = currentState?.revision;

  useEffect(() => {
    if (!currentNode || currentStatus !== 'READY') return;

    setStates((value) => markNodeRunning(value, currentNode.id));
  }, [currentNode, currentStatus]);

  useEffect(() => {
    if (!currentNode || currentStatus !== 'RUNNING') return;

    let cancelled = false;

    const generate = async () => {
      try {
        const draft = await requestAgentDraft(currentNode, currentState!, states);
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
      } catch (error) {
        if (cancelled) return;
        setStates((value) => {
          const latest = value.find((state) => state.nodeId === currentNode.id);
          if (!latest || latest.status !== 'RUNNING') return value;
          const fallback = createDemoArtifact(currentNode, latest);
          const message = error instanceof Error ? error.message : '未知错误';
          return completeNodeDraft(value, currentNode.id, {
            ...fallback,
            body: [
              `> DeepSeek 暂时没有返回可用结果，已切换为本地测试草案。错误：${message}`,
              '',
              fallback.body,
            ].join('\n'),
            blockerCount: Math.max(fallback.blockerCount, 1),
          });
        });
      }
    };

    const timer = window.setTimeout(() => void generate(), 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentNode, currentState, currentStatus, currentRevision, states]);

  const selectedNode = researchPhotoWorkflowV1.nodes.find((node) => node.id === selectedNodeId) ?? researchPhotoWorkflowV1.nodes[0]!;
  const selectedState = states.find((state) => state.nodeId === selectedNode.id) ?? states[0]!;
  const agent = useMemo(() => {
    const role = nodeAgent[selectedNode.id] ?? 'PROJECT_PRODUCER';
    return agentProfiles.find((profile) => profile.role === role) ?? agentProfiles[0]!;
  }, [selectedNode.id]);

  const togglePurpose = (purposeId: string) => {
    setSelectedPurposeIds((current) => {
      const exists = current.includes(purposeId);
      const next = exists ? current.filter((id) => id !== purposeId) : [...current, purposeId];
      if (next.length === 0) return current;
      if (!next.includes(primaryPurposeId)) setPrimaryPurposeId(next[0]!);
      return next;
    });
  };

  const confirmSelectedNode = () => {
    setStates((value) => confirmNodeAndQueueNext(researchPhotoWorkflowV1, value, selectedNode.id));
    setRevisionText('');
  };

  const reviseSelectedNode = (instruction: string) => {
    setStates((value) => reviseNodeDraft(researchPhotoWorkflowV1, value, selectedNode.id, instruction));
    setRevisionText('');
  };

  return <div className="studio-shell">
    <header className="studio-header">
      <button type="button" className="menu-button" aria-label="打开项目菜单">☷</button>
      <div className="brand">
        <img className="brand-logo" src="/logo.png" alt="研影" />
        <span>AI Studio</span>
      </div>
      <span className="header-divider" />
      <span className="project-name">{changxingProject.name}</span>
      <span className="mock-badge">{aiProviderLabel}</span>
      <span className="header-spacer" />
      <button type="button" className="icon-button" aria-label="通知">♧</button>
      <span className="avatar-chip" aria-label="当前用户 ZH">ZH</span>
    </header>
    <main className="studio-body">
      <section className="canvas-panel" aria-label="项目工作流">
        <WorkflowCanvas template={researchPhotoWorkflowV1} states={states} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
        <WorkflowFallbackList template={researchPhotoWorkflowV1} states={states} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
      </section>
      <AgentContextPanel
        agent={agent}
        node={selectedNode}
        state={selectedState}
        messages={agentMessages}
        revisionText={revisionText}
        onRevisionTextChange={setRevisionText}
        onConfirm={confirmSelectedNode}
        onRevise={reviseSelectedNode}
        purposeOptions={shootingPurposeOptions}
        selectedPurposeIds={selectedPurposeIds}
        primaryPurposeId={primaryPurposeId}
        onTogglePurpose={togglePurpose}
        onSetPrimaryPurpose={setPrimaryPurposeId}
      />
    </main>
  </div>;
}
