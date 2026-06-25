import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StudioFlowNode } from './adapter';
import { getNodePreviewTone, summarizeNodeContent } from './nodePreview';

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

export function WorkflowNodeCard({ data, selected }: NodeProps<StudioFlowNode>) {
  const { definition, state } = data;
  const compact = definition.kind === 'INPUT' || definition.kind === 'OUTPUT';
  const previewTone = getNodePreviewTone(state.status);
  const preview = state.status === 'RUNNING'
    ? `${definition.owner}正在生成${definition.outputLabel}，完成后会停在确认点。`
    : summarizeNodeContent(state.artifactBody, state.summary || definition.description);

  return (
    <article
      className={`workflow-node${selected ? ' is-selected' : ''}${state.status === 'LOCKED' ? ' is-locked' : ''}${state.status === 'RUNNING' ? ' is-running' : ''}${compact ? ' compact' : ''}`}
      aria-label={`${definition.label}，${statusLabel[state.status]}`}
    >
      {definition.order > 1 && <Handle className="node-handle" type="target" position={Position.Left} isConnectable={false} />}
      <span className="node-number">{String(definition.order).padStart(2, '0')}</span>
      <h2 className="node-title">{definition.label}</h2>
      <div className="node-owner">{definition.owner}</div>
      <div className="node-visual" aria-hidden="true"><span className="node-glyph">{glyph[definition.kind]}</span></div>
      <div className={`node-preview ${previewTone}`}>
        <div className="node-preview-kicker">
          <span>{state.planLabel ?? 'Plan A'}</span>
          <span>{state.artifactLabel ?? definition.outputLabel}</span>
        </div>
        <p>{preview}</p>
      </div>
      {state.lastUserInstruction && <div className="node-instruction">
        <span>修改</span>
        <p>{state.lastUserInstruction}</p>
      </div>}
      <div className="node-section">
        <div className="node-section-label"><span>□</span> 产出</div>
        <div className="node-artifact">{state.artifactLabel ?? definition.outputLabel}</div>
      </div>
      <div className="node-section node-status">
        <span className={`status-dot ${state.status.toLowerCase()}`} />
        <span>{statusLabel[state.status]}{state.blockerCount > 0 ? ` · ${state.blockerCount} 项阻塞` : ''}</span>
      </div>
      {definition.order < 7 && <Handle className="node-handle" type="source" position={Position.Right} isConnectable={false} />}
    </article>
  );
}
