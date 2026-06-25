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
  'source-intake': 'RESEARCH_ANALYST',
  'research-analysis': 'RESEARCH_ANALYST',
  'science-review': 'SCIENCE_REVIEWER',
  'fact-confirmation': 'SCIENCE_REVIEWER',
  'visual-plan': 'VISUAL_PLANNER',
  'capture-preparation': 'PHOTOGRAPHY_DIRECTOR',
  'plan-output': 'PHOTOGRAPHY_DIRECTOR',
};

const nodeTask: Record<string, AgentTask> = {
  'source-intake': 'ANALYZE_PROJECT',
  'research-analysis': 'ANALYZE_PROJECT',
  'science-review': 'REVIEW_SCIENCE',
  'fact-confirmation': 'REVIEW_SCIENCE',
  'visual-plan': 'GENERATE_VISUAL_PLAN',
  'capture-preparation': 'GENERATE_CAPTURE_LIST',
  'plan-output': 'GENERATE_CAPTURE_LIST',
};

function createDemoArtifact(node: WorkflowNodeDefinition, state: WorkflowNodeState) {
  const version = state.revision;
  const suffix = `v${version}`;
  const label = `${node.outputLabel} ${suffix}`;

  const drafts: Record<string, string> = {
    'research-analysis': [
      `### ${state.planLabel ?? 'Plan A'} · 科研分析草案`,
      '- 研究主题：长兴海洋实验室的智能装备、绿色动力与深海实验场景。',
      '- 视觉机会：设备尺度、人员协作、控制屏幕、海洋环境与实验流程可以形成清晰叙事。',
      '- 待确认：哪些设备可以公开拍摄，哪些数据界面需要脱敏。',
    ].join('\n'),
    'science-review': [
      `### ${state.planLabel ?? 'Plan A'} · 科学审校意见`,
      '- 通过项：研究方向和场景归纳可以作为策划基础。',
      '- 风险项：不要把“设备先进性”表达成未经证实的性能结论。',
      '- 需确认：控制屏幕、实验样品、合作单位名称是否允许公开。',
    ].join('\n'),
    'fact-confirmation': [
      `### ${state.planLabel ?? 'Plan A'} · 人工确认清单`,
      '- 请确认可公开拍摄区域、不可出现设备编号、涉密屏幕处理方式。',
      '- 若无法确认，后续方案默认采用抽象化、局部特写和示意图替代。',
    ].join('\n'),
    'visual-plan': [
      `### ${state.planLabel ?? 'Plan A'} · 影像方案草案`,
      '- 核心概念：把实验室表现为“海洋工程问题被看见、被验证、被转译”的空间。',
      '- 画面结构：环境建立镜头、设备细节、人员操作、数据界面、成果输出。',
      '- 风格：白底克制、冷蓝点缀、强调可信和清洁的科研质感。',
    ].join('\n'),
    'capture-preparation': [
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
    blockerCount: node.id === 'science-review' ? 2 : 0,
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
    agentRole: nodeAgent[node.id] ?? 'RESEARCH_ANALYST',
    task: nodeTask[node.id] ?? 'ANALYZE_PROJECT',
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

function createInitialStudioStates() {
  return createDirectorWorkflowStates(researchPhotoWorkflowV1, ['source-intake']).map((state) => {
    if (state.nodeId !== 'source-intake') return state;
    return {
      ...state,
      artifactLabel: '资料集 v1',
      artifactBody: [
        '项目背景：长兴海洋实验室希望围绕海洋装备、绿色动力、智能制造和深海实验场景形成科研影像方案。',
        '可用素材：实验室空间、科研设备、团队协作、控制屏幕、设备局部、访谈内容和部分可公开项目资料。',
        '表达目标：面向科研合作、公众传播和项目汇报，强调可信、克制、清晰的科研视觉语言。',
        '限制条件：设备运行状态、屏幕数据、合作单位名称和部分实验细节需要科研人员确认后才能公开。',
      ].join('\n'),
    };
  });
}

export function Studio() {
  const [states, setStates] = useState(createInitialStudioStates);
  const currentNodeId = getCurrentDirectorNodeId(researchPhotoWorkflowV1, states);
  const [selectedNodeId, setSelectedNodeId] = useState(currentNodeId);
  const [revisionText, setRevisionText] = useState('');
  const [aiProviderLabel, setAiProviderLabel] = useState('AI 检查中');

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
    const role = nodeAgent[selectedNode.id] ?? 'RESEARCH_ANALYST';
    return agentProfiles.find((profile) => profile.role === role) ?? agentProfiles[0]!;
  }, [selectedNode.id]);

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
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><span>科研影像 AI Studio</span></div>
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
      />
    </main>
  </div>;
}
