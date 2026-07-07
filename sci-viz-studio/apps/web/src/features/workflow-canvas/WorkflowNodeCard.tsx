import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ProjectGoal } from '@studio/contracts';
import type { StudioFlowNode } from './adapter';
import { getNodePreviewTone, summarizeNodeContent } from './nodePreview';
import { parseMdToCards, type MdCard } from './parseMarkdownToCards';
import { organizeVisualDiagnosis } from './visualDiagnosisContent';
import { stripClarificationData } from './clarificationBranch';
import { BenchmarkPanel } from '../benchmarks/BenchmarkPanel';
import { PlanEditor } from '../plans/PlanEditor';
import { loadProjectSources, uploadProjectFiles } from '../sources/sourceApi';
import { validateAndMergeFiles } from '../sources/pendingFileUtils';

const statusLabel = {
  LOCKED: '等待上一步',
  READY: '待处理',
  QUEUED: '排队中',
  RUNNING: '处理中',
  AWAITING_HUMAN: '待人工确认',
  COMPLETED: '已完成',
  FAILED: '处理失败',
} as const;

const glyph: Record<string, string> = {
  INPUT: '↥',
  AGENT: '⌁',
  HUMAN_GATE: '✓',
  EXECUTION: '◎',
  OUTPUT: '▤',
};

const avatarByOwner: Record<string, string> = {
  资料管理员: '/agents/research-analyst.png',
  资料分析师: '/agents/research-analyst.png',
  项目负责人: '/agents/science-reviewer.png',
  科研策展人: '/agents/science-reviewer.png',
  摄影策划师: '/agents/photography-director.png',
};

const avatarByNode: Record<string, string> = {
  'photo-plan': '/agents/visual-planner.png',
  'ai-reference': '/agents/visual-planner.png',
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitDiagnosisCards(cards: MdCard[]) {
  const contentCards = cards.filter((card) => card.content);
  const structure = contentCards.filter((card) => (
    ['素材总览', '功能维度结构', '技术维度结构', '内容对象结构', '媒介维度结构'].includes(card.label)
  ));
  const quality = contentCards.filter((card) => (
    ['画面质量诊断', '风险标记', '待确认事实与现场条件'].includes(card.label)
  ));
  const used = new Set([...structure, ...quality]);
  const remaining = contentCards.filter((card) => !used.has(card));

  return {
    structure: structure.length > 0 ? structure : contentCards.slice(0, 4),
    quality: quality.length > 0 ? quality : remaining.slice(0, 2),
  };
}

function DiagnosisSection({ title, cards }: { title: string; cards: MdCard[] }) {
  if (cards.length === 0) return null;

  return <section className="node-analysis-section" aria-label={title}>
    <h3>{title}</h3>
    <div className="node-analysis-cards">
      {cards.map((card, index) => <article className="md-card" key={`${title}-${card.label}-${index}`}>
        {card.label ? <div className="md-card-titlebar">
          <span className="md-card-label">{card.label}</span>
          <button type="button" className="md-card-edit" aria-label={`编辑${card.label}`} title="编辑" />
        </div> : null}
        <div className="md-card-main">
          <p className="md-card-content">{card.content}</p>
        </div>
      </article>)}
    </div>
  </section>;
}

function VisualDiagnosisArtifact({ md }: { md: string }) {
  const content = organizeVisualDiagnosis(parseMdToCards(stripClarificationData(md)));

  return <div className="node-analysis-body diagnosis-node-summary">
    <section className="diagnosis-context" aria-label="本次分析信息">
      <strong>本次分析</strong>
      <p>{content.context}</p>
    </section>
    <div className="diagnosis-node-sections">
      {content.sections.slice(0, 3).map((section) => <section key={section.label}>
        <h3>{section.label}</h3>
        <p>{section.content}</p>
      </section>)}
    </div>
  </div>;
}

function ClarificationBranchArtifact({
  state,
  projectId,
  onOpen,
  onSourcesChange,
  onReanalyze,
  onUpdate,
}: {
  state: StudioFlowNode['data']['state'];
  projectId?: string;
  onOpen?: () => void;
  onSourcesChange?: StudioFlowNode['data']['onSourcesChange'];
  onReanalyze?: () => void;
  onUpdate?: StudioFlowNode['data']['onUpdateClarification'];
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [researchMode, setResearchMode] = useState<'FAST' | 'DEEP'>('FAST');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const items = state.clarificationItems ?? [];
  const pending = items.filter((item) => item.status === 'UNANSWERED' || item.status === 'ANSWERED' || item.status === 'FROM_SOURCE');
  const answered = items.filter((item) => item.status !== 'UNANSWERED');
  const visibleItems = pending.length > 0 ? pending : items;
  const safeQuestionIndex = visibleItems.length > 0 ? Math.min(questionIndex, visibleItems.length - 1) : 0;
  const primaryItem = visibleItems[safeQuestionIndex];
  const hasPendingAnswers = items.some((item) => item.status === 'ANSWERED' || item.status === 'FROM_SOURCE' || item.status === 'UNCONFIRMABLE');
  const status = hasPendingAnswers ? '已补充待分析' : pending.length > 0 ? '待补充' : '已更新';
  const canSwitchQuestion = visibleItems.length > 1;
  const researchModeLabel = researchMode === 'FAST' ? 'Fast Research' : 'Deep Research';
  const switchQuestion = (direction: -1 | 1) => {
    setQuestionIndex((current) => {
      if (visibleItems.length <= 1) return 0;
      return (current + direction + visibleItems.length) % visibleItems.length;
    });
  };
  const stopCanvasEvent = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation();
  };
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length || !projectId) return;
    const validated = validateAndMergeFiles([], Array.from(files));
    const validationMessage = validated.errors.join('；');
    if (validationMessage) setUploadError(validationMessage);
    if (!validated.files.length) return;
    setUploading(true);
    if (!validationMessage) setUploadError('');
    try {
      await uploadProjectFiles(projectId, validated.files);
      const nextSources = await loadProjectSources(projectId);
      onSourcesChange?.(nextSources);
      if (validationMessage) setUploadError(validationMessage);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : '上传失败，请重试。');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return <div className="clarification-node-summary">
    <div className="clarification-node-status">
      <span>状态：{status}</span>
      <span>待补充 {pending.length} 项 · 已补充 {answered.length} 项</span>
    </div>
    {primaryItem ? <article className="clarification-node-card">
      <header>
        <div>
          <h3>{primaryItem.title}</h3>
          <span>状态：{primaryItem.status === 'UNANSWERED' ? '未回答' : primaryItem.status === 'ANSWERED' ? '已回答' : primaryItem.status === 'FROM_SOURCE' ? '已从资料补充' : primaryItem.status === 'UNCONFIRMABLE' ? '暂无法确认' : '已用于重新分析'}</span>
        </div>
        <em>影响：{primaryItem.impact}</em>
      </header>
      <section className="clarification-node-gap">
        <strong>当前缺口</strong>
        <p>{primaryItem.gap}</p>
      </section>
      <section className="clarification-node-suggestion">
        <strong>建议补充</strong>
        <p>{primaryItem.suggestion}</p>
      </section>
      <label className="clarification-node-answer nowheel nodrag">
        <span>用户回答</span>
        <textarea
          value={primaryItem.answer ?? ''}
          placeholder="在这里补充一句话、事实、限制或负责人确认口径…"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onUpdate?.(primaryItem.id, { answer: event.target.value, status: event.target.value.trim() ? 'ANSWERED' : 'UNANSWERED' })}
        />
        <div className="clarification-node-answer-tools">
          <input ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
          <button type="button" disabled={uploading || !projectId} onClick={(event) => { event.stopPropagation(); fileInput.current?.click(); }} aria-label="上传 PDF、Word 或图片">{uploading ? '…' : '+'}</button>
          <details className="clarification-research-menu" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <summary>
              <span className={`research-mode-icon ${researchMode === 'FAST' ? 'is-fast' : 'is-deep'}`} aria-hidden="true" />
              <span>{researchModeLabel}</span>
              <span className="research-mode-chevron" aria-hidden="true" />
            </summary>
            <div className="clarification-research-popover" role="menu">
              <button type="button" role="menuitemradio" aria-checked={researchMode === 'FAST'} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setResearchMode('FAST'); }}>
                <span className="research-mode-icon is-fast" aria-hidden="true" />
                <span>Fast Research</span>
              </button>
              <button type="button" role="menuitemradio" aria-checked={researchMode === 'DEEP'} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setResearchMode('DEEP'); }}>
                <span className="research-mode-icon is-deep" aria-hidden="true" />
                <span>Deep Research</span>
              </button>
            </div>
          </details>
          <button type="button" className="send" disabled={!hasPendingAnswers} onClick={(event) => { event.stopPropagation(); onReanalyze?.(); }}>重新分析</button>
        </div>
        {uploadError && <div className="clarification-node-upload-error" role="alert">{uploadError}</div>}
      </label>
      {canSwitchQuestion && <div className="clarification-node-switcher nowheel nodrag" aria-label="切换补充问题">
        <button type="button" onPointerDown={stopCanvasEvent} onClick={(event) => { event.stopPropagation(); switchQuestion(-1); }}>上一题</button>
        <span>{safeQuestionIndex + 1} / {visibleItems.length}</span>
        <button type="button" onPointerDown={stopCanvasEvent} onClick={(event) => { event.stopPropagation(); switchQuestion(1); }}>下一题</button>
      </div>}
    </article> : <div className="clarification-node-empty">暂无待补充问题</div>}
    <div className="clarification-node-actions">
      <button type="button" onClick={(event) => { event.stopPropagation(); onOpen?.(); }}>继续补充</button>
      {primaryItem && <button type="button" onClick={(event) => { event.stopPropagation(); onUpdate?.(primaryItem.id, { answer: '暂无法确认', status: 'UNCONFIRMABLE' }); }}>标记为暂无法确认</button>}
      <button type="button" disabled={!hasPendingAnswers} onClick={(event) => { event.stopPropagation(); onReanalyze?.(); }}>重新分析 02</button>
    </div>
  </div>;
}

function GoalOutputSelectionPanel({
  primaryPurposeId,
  secondaryPurposeId,
  purposeOptions,
  onSetPrimaryPurpose,
  onSetSecondaryPurpose,
}: {
  primaryPurposeId: ProjectGoal;
  secondaryPurposeId: ProjectGoal | '';
  purposeOptions: Array<{ id: ProjectGoal; label: string; description: string }>;
  onSetPrimaryPurpose: (purposeId: ProjectGoal) => void;
  onSetSecondaryPurpose: (purposeId: ProjectGoal | '') => void;
}) {
  const [rankOrder, setRankOrder] = useState<ProjectGoal[]>(() => {
    const order: ProjectGoal[] = [];
    if (primaryPurposeId) order.push(primaryPurposeId);
    if (secondaryPurposeId && secondaryPurposeId !== primaryPurposeId) order.push(secondaryPurposeId);
    return order;
  });

  const syncToParent = (order: ProjectGoal[]) => {
    onSetPrimaryPurpose(order[0] ?? purposeOptions[0]!.id);
    onSetSecondaryPurpose(order[1] ?? '');
  };

  const handleClick = (purposeId: ProjectGoal) => {
    setRankOrder((prev) => {
      const idx = prev.indexOf(purposeId);
      if (idx >= 0) {
        if (prev.length <= 1) return prev;
        const next = prev.filter((id) => id !== purposeId);
        syncToParent(next);
        return next;
      }
      const next = [...prev, purposeId];
      syncToParent(next);
      return next;
    });
  };

  const getRank = (purposeId: ProjectGoal): number | null => {
    const idx = rankOrder.indexOf(purposeId);
    return idx >= 0 ? idx + 1 : null;
  };

  return <div className="node-analysis-body">
    <section className="node-analysis-section" aria-label="传播目标">
      <h3>传播目标</h3>
      <p className="node-section-hint">点击卡片按优先级排序，自动标记 1–4（1 为主目标）。再次点击取消选择。至少保留一项。</p>
      <div className="goal-rank-grid nowheel nodrag">
        {purposeOptions.map((option) => {
          const rank = getRank(option.id);
          const isPrimary = rank === 1;
          return <article
            className={`goal-rank-card${rank ? ' is-selected' : ''}${isPrimary ? ' is-primary' : ''}`}
            key={option.id}
            onClick={(event) => {
              event.stopPropagation();
              handleClick(option.id);
            }}
            role="button"
            tabIndex={0}
            aria-pressed={!!rank}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleClick(option.id);
              }
            }}
          >
            {rank && <span className={`goal-rank-badge${isPrimary ? ' is-primary' : ''}`} aria-label={`优先级 ${rank}`}>{rank}</span>}
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </article>;
        })}
      </div>
    </section>
    <section className="node-analysis-section" aria-label="产物类型">
      <h3>产物类型</h3>
      <div className="goal-rank-grid">
        <article className="goal-rank-card is-selected is-primary">
          <span className="goal-rank-badge is-primary" aria-label="已选择">1</span>
          <strong>拍摄静图</strong>
          <span>当前 MVP 主流程，支持科研平台、实验室、团队和装备的静图拍摄策划。</span>
        </article>
        <article className="goal-rank-card is-disabled">
          <strong>录影/影片</strong>
          <span>暂未开放。后续版本将支持动态媒体策划。</span>
        </article>
      </div>
    </section>
  </div>;
}

export function WorkflowNodeCard({ data, selected }: NodeProps<StudioFlowNode>) {
  const { definition, state } = data;
  const compact = definition.kind === 'INPUT' || definition.kind === 'OUTPUT';
  const waiting = state.status === 'LOCKED';
  const hasArtifact = Boolean(state.artifactBody);
  const previewTone = getNodePreviewTone(state.status);
  const preview = state.status === 'RUNNING'
    ? `${definition.owner}正在生成${definition.outputLabel}，完成后会停在确认点。`
    : summarizeNodeContent(state.artifactBody, state.summary || definition.description);
  const isTerminal = definition.kind === 'OUTPUT';
  const isSourceIntake = definition.id === 'source-intake';
  const isVisualDiagnosis = definition.id === 'visual-diagnosis';
  const isClarificationBranch = definition.id === 'source-clarifications';
  const isGoalOutputSelection = definition.id === 'goal-output-selection';
  const showAgentActions = definition.kind === 'AGENT' && state.status === 'AWAITING_HUMAN' && hasArtifact;
  const showHumanGateActions = definition.kind === 'HUMAN_GATE' && state.status === 'AWAITING_HUMAN';
  const avatar = isSourceIntake ? undefined : avatarByNode[definition.id] ?? avatarByOwner[definition.owner];

  return (
    <article
      className={`workflow-node${selected ? ' is-selected' : ''}${state.status === 'LOCKED' ? ' is-locked' : ''}${state.status === 'RUNNING' ? ' is-running' : ''}${compact ? ' compact' : ''}${definition.auxiliary ? ' is-auxiliary-node' : ''}`}
      aria-label={`${definition.label}，${statusLabel[state.status]}`}
      onPointerDownCapture={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nearResizeHandle = rect.right - event.clientX < 20 && rect.bottom - event.clientY < 20;
        if (nearResizeHandle) event.stopPropagation();
      }}
    >
      {definition.order > 1 && <Handle className="node-handle" type="target" position={Position.Left} isConnectable={false} />}
      <div className="node-drag-handle" aria-label="拖动卡片" title="拖动卡片">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
      <div className="node-card-top">
        <div className="node-heading">
          <span className="node-number">{definition.auxiliary ? definition.shortLabel : String(definition.order).padStart(2, '0')}</span>
          <div>
            <h2 className="node-title">{definition.label}</h2>
            {!isSourceIntake && <div className="node-owner">{definition.owner}</div>}
          </div>
        </div>
        {!isSourceIntake && !isClarificationBranch && avatar
          ? <span className="node-agent-avatar-frame" aria-hidden="true"><img className="node-agent-avatar" src={avatar} alt="" /></span>
          : !isSourceIntake && !isClarificationBranch ? <div className="node-visual" aria-hidden="true"><span className="node-glyph">{glyph[definition.kind]}</span></div> : null}
      </div>
      {definition.id === 'case-benchmark' && data.projectId ? <BenchmarkPanel projectId={data.projectId} {...(data.onBenchmarkSelectionChange ? { onSelectionChange: data.onBenchmarkSelectionChange } : {})} /> : null}
      {definition.id === 'photo-plan' && data.projectId ? <PlanEditor projectId={data.projectId} /> : null}
      {isSourceIntake ? <section className="source-node-summary"><strong>{state.summary}</strong><span>在右侧“已添加的资料”中上传、解析并选择本轮资料。</span></section> : null}
      {waiting
        ? <div className="node-waiting">
            <span className="status-dot locked" />
            <p>{state.summary || '等待上一步确认'}</p>
          </div>
        : <>
          {isClarificationBranch ? (
            <ClarificationBranchArtifact
              state={state}
              {...(data.projectId ? { projectId: data.projectId } : {})}
              {...(data.onOpenClarifications ? { onOpen: data.onOpenClarifications } : {})}
              {...(data.onSourcesChange ? { onSourcesChange: data.onSourcesChange } : {})}
              {...(data.onReanalyzeProjectUnderstanding ? { onReanalyze: data.onReanalyzeProjectUnderstanding } : {})}
              {...(data.onUpdateClarification ? { onUpdate: data.onUpdateClarification } : {})}
            />
          ) : isGoalOutputSelection && data.purposeOptions && data.purposeOptions.length > 0 && data.onSetPrimaryPurpose ? (
            <GoalOutputSelectionPanel
              primaryPurposeId={data.primaryPurposeId ?? data.purposeOptions[0]!.id}
              secondaryPurposeId={data.secondaryPurposeId ?? ''}
              purposeOptions={data.purposeOptions}
              onSetPrimaryPurpose={data.onSetPrimaryPurpose}
              onSetSecondaryPurpose={data.onSetSecondaryPurpose ?? (() => {})}
            />
          ) : isVisualDiagnosis && state.artifactBody ? (
            <div className="diagnosis-node-with-link">
              <VisualDiagnosisArtifact md={state.artifactBody} />
              <button type="button" className="clarification-link-card nowheel nodrag" onClick={(event) => {
                event.stopPropagation();
                data.onOpenClarifications?.();
              }}>
                查看 02A 资料补充清单
              </button>
            </div>
          ) : !isSourceIntake && state.artifactBody ? (
            <div className="node-analysis-body">
              {state.images && state.images.length > 0 && (
                <section className="ai-reference-gallery" aria-label="AI 参考图">
                  <div className="ai-reference-grid">
                    {state.images.map((image, index) => (
                      <figure key={index}>
                        <img src={image.url} alt={image.prompt} loading="lazy" />
                        <figcaption>{image.prompt}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
              <DiagnosisSection title={state.artifactLabel ?? definition.outputLabel} cards={parseMdToCards(state.artifactBody).filter((card) => card.content)} />
            </div>
          ) : !isSourceIntake && (
            <div className={`node-preview ${previewTone}`}>
              <div className="node-preview-kicker">
                <span>{state.artifactLabel ?? definition.outputLabel}</span>
                <span className="node-preview-mark" aria-hidden="true" />
              </div>
              <div className="node-preview-body nowheel nodrag" onWheel={(event) => event.stopPropagation()}>
                <p>{preview}</p>
              </div>
            </div>
          )}
          {showAgentActions && hasArtifact && <div className="node-action-stack nowheel nodrag" aria-label={`${definition.label}操作`}>
            <button
              type="button"
              className="node-primary-action"
              onClick={(event) => {
                event.stopPropagation();
                data.onConfirm?.();
              }}
            >
              确定，进入下一步
            </button>
            <button
              type="button"
              className="node-secondary-action"
              onClick={(event) => {
                event.stopPropagation();
                data.onRevise?.();
              }}
            >
              重新分析
            </button>
          </div>}
        </>}
      {waiting && <div className="node-section node-status waiting-status">
        <span>{statusLabel[state.status]}</span>
      </div>}
      {!isTerminal && <Handle className="node-handle" type="source" position={Position.Right} isConnectable={false} />}
    </article>
  );
}
