import { useState } from 'react';
import type { AgentMessage, AgentProfile } from '@studio/contracts';
import type { WorkflowNodeDefinition, WorkflowNodeState } from '@studio/workflow-core';

export function AgentContextPanel({ agent, node, state, messages }: {
  agent: AgentProfile;
  node: WorkflowNodeDefinition;
  state: WorkflowNodeState;
  messages: AgentMessage[];
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
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
        <span>{state.summary}</span>
      </div>
    </header>
    <div className="conversation">
      <p className="date-label">Jun 24, 2026 · Mock AI</p>
      {messages.map((message) => <p className={`message ${message.author.toLowerCase()}`} key={message.id}>{message.body}</p>)}
      <section className="artifact-preview" aria-label="科研理解摘要">
        <span className="artifact-kicker">Artifact preview</span>
        <h3>研究方向与视觉机会</h3>
        <div className="evidence-bars">
          {[['智能制造', 92], ['深海装备', 78], ['绿色动力', 66], ['待确认', 24]].map(([label, value]) => (
            <div className="evidence-row" key={label}>
              <span>{label}</span><span className="evidence-track"><span className="evidence-fill" style={{ width: `${value}%` }} /></span><b>{value}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
    <form className="prompt-box" onSubmit={(event) => event.preventDefault()}>
      <label className="sr-only" htmlFor="agent-prompt">向{agent.name}补充要求</label>
      <textarea id="agent-prompt" placeholder={`向${agent.name}补充要求…`} />
      <div className="prompt-actions"><span className="prompt-mode">结构化任务 · Mock</span><button className="send-button" type="submit" aria-label="发送">↑</button></div>
    </form>
  </aside>;
}
