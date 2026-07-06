import { useEffect, useMemo, useRef, useState } from 'react';
import { agentMessages, agentProfiles } from '@studio/fixtures';
import {
  confirmNodeAndQueueNext,
  createDirectorWorkflowStates,
  getCurrentDirectorNodeId,
  researchPhotoWorkflowV1,
  reviseNodeDraft,
  type WorkflowNodeState,
} from '@studio/workflow-core';
import type { ProjectGoal, SourceDocument, StudioProject } from '@studio/contracts';
import { WorkflowCanvas } from '../features/workflow-canvas/WorkflowCanvas';
import { WorkflowFallbackList } from '../features/workflow-canvas/WorkflowFallbackList';
import { AgentContextPanel } from '../features/workflow-canvas/AgentContextPanel';
import { StageProgress } from '../features/workflow-canvas/StageProgress';
import { ProjectCompletion } from '../features/workflow-canvas/ProjectCompletion';
import { usableSelectedSources } from '../features/sources/sourceUtils';
import { resetWorkflowForSourceChange } from '../features/sources/sourceWorkflowReset';
import { SourceOnboarding } from '../features/sources/SourceOnboarding';
import { loadProjectSources, loadResearchTasks } from '../features/sources/sourceApi';
import { apiFetch } from '../api/client';
import { agentRoleForNode, useStudioAgentWorkflow } from '../features/workflow-canvas/useStudioAgentWorkflow';
import { useWorkflowPersistence } from '../features/workflow-canvas/useWorkflowPersistence';
import { FeedbackWidget } from '../features/feedback/FeedbackWidget';
import { AccountIdentity } from '../auth/AuthRoot';
import { UsageProfile } from '../auth/UsageProfile';
import { migrateLegacyMockWorkflow } from '../features/workflow-canvas/workflowMigration';

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

function createInitialStudioStates(): WorkflowNodeState[] {
  return createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => {
    if (state.nodeId !== 'source-intake') return state;
    return {
      ...state,
      status: 'AWAITING_HUMAN' as const,
      progress: 50,
      summary: '请添加并选择至少一份已解析资料',
      artifactLabel: '项目资料包',
    };
  });
}

export function Studio({ projectId }: { projectId: string }) {
  const workflow = useWorkflowPersistence({
    projectId,
    createInitialStates: createInitialStudioStates,
    defaultPrimaryGoal: 'INDUSTRY_COLLABORATION',
    defaultSecondaryGoal: 'PUBLIC_COMMUNICATION',
  });
  const {
    states, setStates, loaded: workflowLoaded,
    primaryGoal: primaryPurposeId, setPrimaryGoal: setPrimaryPurposeId,
    secondaryGoal: secondaryPurposeId, setSecondaryGoal: setSecondaryPurposeId,
  } = workflow;
  const currentNodeId = getCurrentDirectorNodeId(researchPhotoWorkflowV1, states);
  const [selectedNodeId, setSelectedNodeId] = useState(currentNodeId);
  const [canvasFocusRequest, setCanvasFocusRequest] = useState(0);
  const [revisionText, setRevisionText] = useState('');
  const [aiProviderLabel, setAiProviderLabel] = useState('AI 检查中');
  const [project, setProject] = useState<StudioProject | null>(null);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [sourceBootstrapLoaded, setSourceBootstrapLoaded] = useState(false);
  const [sourceBootstrapError, setSourceBootstrapError] = useState(false);
  const [sourceBootstrapAttempt, setSourceBootstrapAttempt] = useState(0);
  const [researchTaskCount, setResearchTaskCount] = useState(0);
  const [workspaceStarted, setWorkspaceStarted] = useState(false);
  const [intakeWarning, setIntakeWarning] = useState('');
  const sourceSelectionRef = useRef<{ projectId: string; signature: string } | null>(null);
  const [benchmarkSelectionCount, setBenchmarkSelectionCount] = useState(0);
  const usableSources = usableSelectedSources(sources);

  useEffect(() => {
    if (currentNodeId) setSelectedNodeId(currentNodeId);
  }, [currentNodeId]);

  useEffect(() => {
    let cancelled = false;
    setWorkspaceStarted(false);
    setSourceBootstrapLoaded(false);
    setSourceBootstrapError(false);
    setProject(null);
    void Promise.all([
      apiFetch(`/projects/${projectId}`).then(async (response) => {
        const payload = await response.json() as { data?: StudioProject; error?: { message?: string } };
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? '项目加载失败。');
        return payload.data;
      }),
      loadProjectSources(projectId),
      loadResearchTasks(projectId),
    ])
      .then(([loadedProject, projectSources, tasks]) => {
        if (cancelled) return;
        setProject(loadedProject);
        setSources(projectSources);
        setResearchTaskCount(tasks.length);
        setSourceBootstrapLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSourceBootstrapError(true);
        setSourceBootstrapLoaded(true);
      });
    return () => { cancelled = true; };
  }, [projectId, sourceBootstrapAttempt]);

  useEffect(() => {
    if (!workflowLoaded || !sourceBootstrapLoaded) return;
    setStates((current) => migrateLegacyMockWorkflow(current, usableSources.length));
  }, [workflowLoaded, sourceBootstrapLoaded, usableSources.length, setStates]);

  useEffect(() => {
    const key = `studio:intake-warning:${projectId}`;
    const warning = sessionStorage.getItem(key) ?? '';
    setIntakeWarning(warning);
    if (warning) sessionStorage.removeItem(key);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const loadProvider = async () => {
      try {
        const response = await apiFetch('/config/ai');
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
      '### 目标与受众确认',
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
  const activeAgentJob = useStudioAgentWorkflow({
    projectId,
    projectName: project?.name ?? '未命名项目',
    workflowLoaded,
    currentNode,
    currentState,
    states,
    setStates,
    sources,
  });

  const selectedNode = researchPhotoWorkflowV1.nodes.find((node) => node.id === selectedNodeId) ?? researchPhotoWorkflowV1.nodes[0]!;
  const selectedState = states.find((state) => state.nodeId === selectedNode.id) ?? states[0]!;
  const agent = useMemo(() => {
    const role = agentRoleForNode(selectedNode.id);
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

  const sourceIntakeCompleted = states.find((state) => state.nodeId === 'source-intake')?.status === 'COMPLETED';
  const showSourceOnboarding = workflowLoaded
    && sourceBootstrapLoaded
    && !workspaceStarted
    && sources.length === 0
    && researchTaskCount === 0
    && !sourceIntakeCompleted;

  if (!workflowLoaded || !sourceBootstrapLoaded) {
    return <main className="app-loading"><strong>正在打开项目</strong><span>正在确认已有资料与工作进度…</span></main>;
  }

  if (sourceBootstrapError) {
    return <main className="app-loading"><strong>项目资料暂时没有加载完成</strong><span>请检查网络后重试，已有内容不会丢失。</span><button type="button" onClick={() => setSourceBootstrapAttempt((value) => value + 1)}>重新加载</button></main>;
  }

  if (!project) {
    return <main className="app-loading"><strong>项目不存在</strong><span>请返回项目列表后重新选择。</span></main>;
  }

  if (showSourceOnboarding) {
    return <SourceOnboarding projectId={projectId} onStarted={async () => {
      setSelectedNodeId('source-intake');
      setWorkspaceStarted(true);
      const result = await Promise.all([loadProjectSources(projectId), loadResearchTasks(projectId)]).catch(() => null);
      if (!result) return;
      setSources(result[0]);
      setResearchTaskCount(result[1].length);
    }} />;
  }

  return <div className="studio-shell">
    {intakeWarning && <div className="studio-intake-warning" role="status"><span>{intakeWarning}</span><button type="button" onClick={() => setIntakeWarning('')}>关闭</button></div>}
    <header className="studio-header">
      <div className="studio-header-left">
        <details className="brand-menu">
          <summary className="brand" aria-label="打开账户菜单">
            <img className="brand-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
            <span>{project.name}</span>
          </summary>
          <div className="brand-menu-popover">
            <div className="brand-menu-account"><AccountIdentity /><span>个人账号</span></div>
            <a href={import.meta.env.BASE_URL}>返回项目列表</a>
            <FeedbackWidget context={{ page: '工作流画布', projectId }} triggerLabel="问题反馈" triggerClassName="brand-menu-action" />
          </div>
        </details>
        {workflow.saveStatus !== 'saved' && <div className={`workflow-save-status is-${workflow.saveStatus}`} role={workflow.saveStatus === 'error' ? 'alert' : 'status'}>
          <span>{workflow.saveStatus === 'loading' ? '正在加载' : workflow.saveStatus === 'idle' ? '有未保存修改' : workflow.saveStatus === 'saving' ? '保存中…' : '保存失败'}</span>
          {workflow.saveStatus === 'error' && <button type="button" onClick={workflow.retrySave}>重试</button>}
        </div>}
      </div>
      <StageProgress states={states} selectedNodeId={selectedNodeId} onSelectNode={(nodeId) => {
        setSelectedNodeId(nodeId);
        setCanvasFocusRequest((value) => value + 1);
      }} />
      <div className="studio-usage-dock"><UsageProfile /></div>
    </header>
    <main className="studio-body">
      <section className="canvas-panel" aria-label="项目工作流">
        <ProjectCompletion states={states} onOpenPlan={() => setSelectedNodeId('photo-plan')} />
        <WorkflowCanvas
          projectId={projectId}
          template={researchPhotoWorkflowV1}
          states={states}
          selectedNodeId={selectedNodeId}
          focusRequestKey={canvasFocusRequest}
          onSelectNode={setSelectedNodeId}
          onConfirmNode={(nodeId) => {
            if (nodeId === 'source-intake' && usableSources.length === 0) return;
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
          onBenchmarkSelectionChange={setBenchmarkSelectionCount}
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
        benchmarkCanProceed
        activeJob={selectedNode.id === currentNode?.id ? activeAgentJob.job : null}
        activeJobStatus={selectedNode.id === currentNode?.id ? activeAgentJob.status : 'IDLE'}
        activeJobError={selectedNode.id === currentNode?.id ? activeAgentJob.error : null}
        onRetryJob={() => { void activeAgentJob.retry(); }}
        sources={sources}
        onSourcesChange={(nextSources) => {
          setSources(nextSources);
          const selected = usableSelectedSources(nextSources);
          const failed = nextSources.filter((source) => source.status === 'FAILED').length;

          const signature = selected.map((source) => source.id).sort().join('|');
          const previousSelection = sourceSelectionRef.current;
          const isStillParsing = nextSources.some((source) => ['UPLOADING', 'QUEUED', 'PARSING', 'SUMMARIZING'].includes(source.status));

          if (!isStillParsing && previousSelection?.projectId === projectId && previousSelection.signature !== signature) {
            sourceSelectionRef.current = { projectId, signature };
            setStates((current) => resetWorkflowForSourceChange(current, selected.length));
            return;
          }

          if (!previousSelection || previousSelection.projectId !== projectId) {
            sourceSelectionRef.current = { projectId, signature };
          }

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
