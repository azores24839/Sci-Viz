import { useState } from 'react';
import type { AgentMessage, AgentProfile } from '@studio/contracts';
import type { WorkflowNodeDefinition, WorkflowNodeState } from '@studio/workflow-core';

interface PurposeOption {
  id: string;
  label: string;
  description: string;
}

export function AgentContextPanel({
  agent,
  node,
  state,
  messages,
  revisionText,
  onRevisionTextChange,
  onConfirm,
  onRevise,
  purposeOptions,
  selectedPurposeIds,
  primaryPurposeId,
  onTogglePurpose,
  onSetPrimaryPurpose,
}: {
  agent: AgentProfile;
  node: WorkflowNodeDefinition;
  state: WorkflowNodeState;
  messages: AgentMessage[];
  revisionText: string;
  onRevisionTextChange: (value: string) => void;
  onConfirm: () => void;
  onRevise: (instruction: string) => void;
  purposeOptions: PurposeOption[];
  selectedPurposeIds: string[];
  primaryPurposeId: string;
  onTogglePurpose: (purposeId: string) => void;
  onSetPrimaryPurpose: (purposeId: string) => void;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const awaitingHuman = state.status === 'AWAITING_HUMAN';
  const running = state.status === 'RUNNING';
  const completed = state.status === 'COMPLETED';
  const showPurposeChoices = node.id === 'project-brief' && awaitingHuman;

  return <aside className="agent-panel" aria-label={`${agent.name}工作面板`}>
    <header className="agent-panel-header">
      <div className="agent-identity">
        <div className="agent-avatar">
          {!avatarFailed
            ? <img src={agent.avatar} alt="" onError={() => setAvatarFailed(true)} />
            : <span>{agent.name.slice(0, 1)}</span>}
        </div>
        <div>
          <h2 className="agent-role">{agent.name}</h2>
          <p className="agent-responsibility">{agent.responsibility}</p>
        </div>
      </div>
      <div className="node-context">
        <strong>{node.label}</strong>
        <span>{state.planLabel ?? 'Plan A'} · {state.summary}</span>
      </div>
    </header>
    <div className="conversation">
      <p className="date-label">Director Workflow · 自动接力 / 阶段确认</p>
      {messages.map((message) => <p className={`message ${message.author.toLowerCase()}`} key={message.id}>{message.body}</p>)}
      <section className="artifact-preview" aria-label="科研理解摘要">
        <span className="artifact-kicker">{state.artifactLabel ?? node.outputLabel}</span>
        <h3>{running ? `${agent.name}正在处理…` : showPurposeChoices ? '请先确认本次拍摄目的' : awaitingHuman ? '请确认这一步是否可以进入下一步' : completed ? '这一步已经确认' : node.description}</h3>
        {running
          ? <div className="thinking-card"><span /><p>正在综合上游结果，生成当前节点草案。完成后会自动停在确认点，不会擅自进入下一步。</p></div>
          : <div className="artifact-body">{state.artifactBody ?? '等待上一步完成后，系统会自动启动这个节点。'}</div>}
      </section>
      {showPurposeChoices && <section className="decision-card" aria-label="拍摄目的选择">
        <div className="decision-card-header">
          <strong>拍摄目的</strong>
          <span>可多选，必须有一个主目的</span>
        </div>
        <div className="purpose-grid">
          {purposeOptions.map((option) => {
            const selected = selectedPurposeIds.includes(option.id);
            const primary = primaryPurposeId === option.id;
            return <div className={`purpose-option${selected ? ' is-selected' : ''}${primary ? ' is-primary' : ''}`} key={option.id}>
              <button type="button" className="purpose-toggle" onClick={() => onTogglePurpose(option.id)} aria-pressed={selected}>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
              {selected && <button type="button" className="primary-purpose-button" onClick={() => onSetPrimaryPurpose(option.id)} aria-pressed={primary}>
                {primary ? '主目的' : '设为主目的'}
              </button>}
            </div>;
          })}
        </div>
      </section>}
      {awaitingHuman && <section className="director-gate" aria-label="导演确认">
        <div>
          <strong>阶段确认</strong>
          <p>{showPurposeChoices ? '确认项目简报后，科研策展人会围绕主目的自动整理科研叙事。' : '如果这一步方向没问题，确认后系统会自动启动下一个节点；如果要改，写一句修改意见即可生成下一版。'}</p>
        </div>
        <button type="button" className="confirm-button" onClick={onConfirm}>确认，进入下一步</button>
      </section>}
    </div>
    <form className="prompt-box" onSubmit={(event) => {
      event.preventDefault();
      if (!awaitingHuman) return;
      onRevise(revisionText);
    }}>
      <label className="sr-only" htmlFor="agent-prompt">向{agent.name}补充要求</label>
      <textarea
        id="agent-prompt"
        value={revisionText}
        onChange={(event) => onRevisionTextChange(event.target.value)}
        disabled={!awaitingHuman}
        placeholder={awaitingHuman ? `提出修改意见，生成${node.label}的下一版…` : '系统会在确认点开放修改输入'}
      />
      <div className="prompt-actions">
        <span className="prompt-mode">{awaitingHuman ? '修改当前节点 · 生成下一版' : '自动接力中'}</span>
        <button className="send-button" type="submit" aria-label="生成下一版" disabled={!awaitingHuman}>↺</button>
      </div>
    </form>
  </aside>;
}
