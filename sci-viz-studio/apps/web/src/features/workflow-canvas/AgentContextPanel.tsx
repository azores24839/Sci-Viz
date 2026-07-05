import { useMemo, useState } from 'react';
import type { AgentJob, AgentMessage, AgentProfile, ProjectGoal, SourceDocument } from '@studio/contracts';
import type { WorkflowNodeDefinition, WorkflowNodeState } from '@studio/workflow-core';
import { parseMdToCards } from './parseMarkdownToCards';
import { organizeVisualDiagnosis } from './visualDiagnosisContent';
import { SourceManager } from '../sources/SourceManager';
import { AgentJobStatus } from '../agents/AgentJobStatus';

interface PurposeOption {
  id: ProjectGoal;
  label: string;
  description: string;
}

const statusTag = {
  LOCKED: '等待中',
  READY: '准备中',
  QUEUED: '排队中',
  RUNNING: '书写中',
  AWAITING_HUMAN: '等待确认',
  COMPLETED: '已确认',
  FAILED: '需处理',
} as const;

function CitationBubbles({ ids, pending, sources }: { ids: string[]; pending: boolean; sources: SourceDocument[] }) {
  const [open, setOpen] = useState(false);
  const unique = [...new Set(ids)];
  if (unique.length === 0 && !pending) return null;
  return <span className="citation-wrap">
    {unique.map((id) => {
      const index = Math.max(0, sources.findIndex((source) => source.id === id));
      return <button type="button" className="citation-bubble" aria-label={`查看来源 ${index + 1}`} onClick={() => setOpen((value) => !value)} key={id}>{index + 1}</button>;
    })}
    {pending && <button type="button" className="citation-bubble is-pending" aria-label="这条内容需要确认" onClick={() => setOpen((value) => !value)}>?</button>}
    {open && <span className="citation-popover" role="note">
      {unique.map((id) => {
        const source = sources.find((item) => item.id === id);
        const index = Math.max(0, sources.findIndex((item) => item.id === id));
        return <span key={id}><b>{index + 1}</b>{source?.title ?? '项目资料'}</span>;
      })}
      {pending && <span>这条内容尚无可靠资料支持，需要人工确认。</span>}
    </span>}
  </span>;
}

function ArtifactOutline({ md, evidence = [], sources }: { md: string; evidence?: WorkflowNodeState['evidence']; sources: SourceDocument[] }) {
  const items = useMemo(() => parseMdToCards(md).filter((card) => card.content), [md]);

  return <div className="outline-tree" aria-label="产物大纲">
    {items.map((item, index) => {
      const bullets = item.content.split('\n').map((line) => line.trim()).filter(Boolean);
      const related = evidence.filter((entry) => entry.statement.includes(item.content.slice(0, 48)) || item.content.includes(entry.statement.slice(0, 48)));
      return <section className="outline-group" key={`${item.label}-${index}`}>
        <div className="outline-group-title">
          <span className="outline-chevron" aria-hidden="true" />
          <span className="outline-dot" aria-hidden="true" />
          <strong>{item.label || `要点 ${index + 1}`}</strong>
        </div>
        <ul>
          {bullets.map((line) => <li key={line}>{line}<CitationBubbles ids={related.flatMap((entry) => entry.sourceIds)} pending={related.some((entry) => entry.basis === 'PENDING_CONFIRMATION')} sources={sources} /></li>)}
        </ul>
      </section>;
    })}
  </div>;
}

function VisualDiagnosisDetails({ md, evidence = [], sources }: { md: string; evidence?: WorkflowNodeState['evidence']; sources: SourceDocument[] }) {
  const content = useMemo(() => organizeVisualDiagnosis(parseMdToCards(md)), [md]);
  const citedIds = [...new Set(evidence.flatMap((entry) => entry.sourceIds))];

  return <div className="diagnosis-reading-view">
    <section className="diagnosis-context" aria-label="本次分析信息">
      <strong>本次分析</strong>
      <p>{content.context}</p>
    </section>
    <div className="diagnosis-reading-sections">
      {content.sections.map((section) => {
        const related = evidence.filter((entry) => section.content.includes(entry.statement.slice(0, 36)) || entry.statement.includes(section.content.slice(0, 36)));
        return <section className="diagnosis-reading-section" key={section.label}>
          <h4>{section.label}</h4>
          <p>{section.content}<CitationBubbles ids={related.flatMap((entry) => entry.sourceIds)} pending={related.some((entry) => entry.basis === 'PENDING_CONFIRMATION')} sources={sources} /></p>
        </section>;
      })}
    </div>
    {(content.basis || citedIds.length > 0) && <p className="diagnosis-basis">分析依据：{content.basis || `引用了 ${citedIds.length} 份项目资料`}<CitationBubbles ids={citedIds} pending={false} sources={sources} /></p>}
  </div>;
}

function DecisionSummary({ evidence = [], sources }: { evidence?: WorkflowNodeState['evidence']; sources: SourceDocument[] }) {
  if (!evidence.length) return null;
  const findings = evidence.slice(0, 3);
  const pending = evidence.filter((item) => item.basis === 'PENDING_CONFIRMATION').slice(0, 3);
  const suggestions = evidence.filter((item) => /建议|需要|应当|补充|增加|避免/.test(item.statement)).slice(0, 3);
  const citedIds = [...new Set(evidence.flatMap((item) => item.sourceIds))];
  return <section className="decision-summary" aria-label="AI 结论摘要">
    <div><strong>主要发现</strong>{findings.map((item) => <p key={item.statement}>{item.statement}<CitationBubbles ids={item.sourceIds} pending={item.basis === 'PENDING_CONFIRMATION'} sources={sources} /></p>)}</div>
    <div><strong>判断依据</strong><p>{citedIds.length > 0 ? `引用了 ${citedIds.length} 份项目资料` : '暂时没有直接资料支持，相关内容均标记为待确认。'}<CitationBubbles ids={citedIds} pending={citedIds.length === 0} sources={sources} /></p></div>
    <div><strong>需要确认</strong>{pending.length ? pending.map((item) => <p key={item.statement}>{item.statement}<CitationBubbles ids={[]} pending sources={sources} /></p>) : <p>目前没有新增待确认项。</p>}</div>
    <div><strong>下一步建议</strong>{suggestions.length ? suggestions.map((item) => <p key={item.statement}>{item.statement}</p>) : <p>确认当前结果后进入下一阶段。</p>}</div>
  </section>;
}

export function AgentContextPanel({
  agent,
  node,
  state,
  messages,
  revisionText,
  onRevisionTextChange,
  aiProviderLabel,
  onConfirm,
  onRevise,
  purposeOptions,
  primaryPurposeId,
  secondaryPurposeId,
  onSetPrimaryPurpose,
  onSetSecondaryPurpose,
  projectId,
  sourceCanProceed,
  benchmarkCanProceed,
  onSourcesChange,
  activeJob,
  activeJobStatus,
  activeJobError,
  onRetryJob,
  sources,
}: {
  agent: AgentProfile;
  node: WorkflowNodeDefinition;
  state: WorkflowNodeState;
  messages: AgentMessage[];
  revisionText: string;
  onRevisionTextChange: (value: string) => void;
  aiProviderLabel: string;
  onConfirm: () => void;
  onRevise: (instruction: string) => void;
  purposeOptions: PurposeOption[];
  primaryPurposeId: ProjectGoal;
  secondaryPurposeId: ProjectGoal | '';
  onSetPrimaryPurpose: (purposeId: ProjectGoal) => void;
  onSetSecondaryPurpose: (purposeId: ProjectGoal | '') => void;
  projectId: string;
  sourceCanProceed: boolean;
  benchmarkCanProceed: boolean;
  onSourcesChange: (sources: SourceDocument[]) => void;
  activeJob: AgentJob | null;
  activeJobStatus: 'IDLE' | 'LOADING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  activeJobError: string | null;
  onRetryJob: () => void;
  sources: SourceDocument[];
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const awaitingHuman = state.status === 'AWAITING_HUMAN';
  const running = state.status === 'RUNNING';
  const completed = state.status === 'COMPLETED';
  const showPurposeChoices = node.id === 'goal-output-selection' && awaitingHuman;
  const isSourceIntake = node.id === 'source-intake';
  const isVisualDiagnosis = node.id === 'visual-diagnosis';
  const isBenchmark = node.id === 'case-benchmark';
  const promptDisabled = !awaitingHuman || isSourceIntake;

  return <aside className="agent-panel" aria-label={isSourceIntake ? '资料上传面板' : `${agent.name}工作面板`}>
    <header className={`agent-panel-header${isSourceIntake ? ' is-user-step' : ''}`}>
      {isSourceIntake
          ? <div className="source-panel-title">
            <h2>资料上传</h2>
          </div>
        : <div className="agent-identity">
        <div className="agent-avatar">
          {!avatarFailed
            ? <img src={agent.avatar} alt="" onError={() => setAvatarFailed(true)} />
            : <span>{agent.name.slice(0, 1)}</span>}
        </div>
        <div className="agent-copy">
          <div className="agent-title-row">
            <h2 className="agent-role">{agent.name}</h2>
          </div>
          <p className="agent-responsibility">{agent.responsibility}</p>
        </div>
      </div>}
      {!isSourceIntake && <span className={`agent-status-tag ${state.status.toLowerCase()}`}>{statusTag[state.status]}</span>}
    </header>
    <div className="conversation">
      {!isSourceIntake && !isVisualDiagnosis && <p className="date-label">Static Photo Workflow</p>}
      {!isSourceIntake && !isVisualDiagnosis && messages.map((message) => <p className={`message ${message.author.toLowerCase()}`} key={message.id}>{message.body}</p>)}
      {isSourceIntake ? <SourceManager projectId={projectId} onSourcesChange={onSourcesChange} /> : <section className="artifact-preview" aria-label="节点产物摘要">
        <span className="artifact-kicker">{isSourceIntake ? '资料上传' : state.artifactLabel ?? node.outputLabel}</span>
        <h3>{isSourceIntake ? '上传并勾选资料后，点击下一步进入诊断。' : running ? `${agent.name}正在处理…` : showPurposeChoices ? '请确认目标与产物类型' : awaitingHuman ? '请确认这一步是否可以进入下一步' : completed ? '这一步已经确认' : node.description}</h3>
        {running
          ? <div className="thinking-card"><span /><p>正在综合上游结果，生成当前节点草案。完成后会自动停在确认点，不会擅自进入下一步。</p></div>
          : state.artifactBody
            ? isVisualDiagnosis
              ? <VisualDiagnosisDetails md={state.artifactBody} {...(state.evidence ? { evidence: state.evidence } : {})} sources={sources} />
              : <><DecisionSummary {...(state.evidence ? { evidence: state.evidence } : {})} sources={sources} /><ArtifactOutline md={state.artifactBody} {...(state.evidence ? { evidence: state.evidence } : {})} sources={sources} /></>
            : <div className="artifact-body">等待上一步完成后，系统会自动启动这个节点。</div>}
      </section>}
      {!isSourceIntake && (running || state.status === 'FAILED') && (
        <section className="agent-runtime-card" aria-label="AI 任务进度">
          <AgentJobStatus
            job={activeJob}
            status={activeJobStatus === 'IDLE' ? 'LOADING' : activeJobStatus}
            onRetry={onRetryJob}
          />
          {activeJobError && <p className="agent-job-error" role="alert">{activeJobError}，系统会继续尝试恢复进度。</p>}
        </section>
      )}
      {showPurposeChoices && <section className="decision-card" aria-label="目标与产物选择">
        <div className="decision-card-header">
          <strong>传播目标</strong>
          <span>主目标必选，次目标最多一个</span>
        </div>
        <div className="purpose-grid">
          {purposeOptions.map((option) => {
            const primary = primaryPurposeId === option.id;
            const secondary = secondaryPurposeId === option.id;
            return <div className={`purpose-option${primary || secondary ? ' is-selected' : ''}${primary ? ' is-primary' : ''}`} key={option.id}>
              <button type="button" className="purpose-toggle" onClick={() => onSetPrimaryPurpose(option.id)} aria-pressed={primary}>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
              <button
                type="button"
                className="primary-purpose-button"
                onClick={() => primary ? undefined : onSetSecondaryPurpose(secondary ? '' : option.id)}
                aria-pressed={secondary}
                disabled={primary}
              >
                {primary ? '主目标' : secondary ? '次目标' : '设为次目标'}
              </button>
            </div>;
          })}
        </div>
        <div className="output-type-grid" aria-label="产物类型">
          <button type="button" className="output-type-card is-selected" aria-pressed="true">
            <strong>拍摄静图</strong>
            <span>当前 MVP 主流程</span>
          </button>
          <button type="button" className="output-type-card" disabled aria-disabled="true">
            <strong>录影/影片</strong>
            <span>暂未开放</span>
          </button>
        </div>
      </section>}
      {awaitingHuman && <section className={`director-gate${isSourceIntake ? ' is-source-intake' : ''}`} aria-label="阶段确认">
        {!isSourceIntake && <div>
          <strong>阶段确认</strong>
          <p>{showPurposeChoices ? '确认后，科研策展人会根据目标和拍摄静图口径进入案例对标。' : '如果这一步方向没问题，确认后系统会自动启动下一个节点；如果要改，写一句修改意见即可生成下一版。'}</p>
        </div>}
        <button type="button" className="confirm-button" onClick={onConfirm} disabled={(isSourceIntake && !sourceCanProceed) || (isBenchmark && !benchmarkCanProceed)}>{isSourceIntake ? sourceCanProceed ? '使用所选资料，进入诊断' : '至少选择一份已解析资料' : isBenchmark && !benchmarkCanProceed ? '至少选择 3 个对标案例' : '确认，进入下一步'}</button>
      </section>}
    </div>
    {!isSourceIntake && <form className="prompt-box" onSubmit={(event) => {
      event.preventDefault();
      if (promptDisabled) return;
      onRevise(revisionText);
    }}>
      <label className="sr-only" htmlFor="agent-prompt">{isSourceIntake ? '资料输入未开放聊天' : `向${agent.name}补充要求`}</label>
      <textarea
        id="agent-prompt"
        value={revisionText}
        onChange={(event) => onRevisionTextChange(event.target.value)}
        disabled={promptDisabled}
        placeholder={isSourceIntake ? '资料上传阶段无需输入，直接在画布卡片中操作。' : awaitingHuman ? `提出修改意见，生成${node.label}的下一版…` : '系统会在确认点开放修改输入'}
      />
      <div className="prompt-actions">
        <button className="model-pill" type="button" aria-label="切换模型">{aiProviderLabel}</button>
        <button className="send-button" type="submit" aria-label="生成新版" disabled={promptDisabled}>生成新版</button>
      </div>
    </form>}
  </aside>;
}
