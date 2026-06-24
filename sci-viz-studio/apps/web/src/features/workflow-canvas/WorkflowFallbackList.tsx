import type { WorkflowNodeState, WorkflowTemplate } from '@studio/workflow-core';

export function WorkflowFallbackList({ template, states, selectedNodeId, onSelectNode }: {
  template: WorkflowTemplate;
  states: WorkflowNodeState[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const stateById = new Map(states.map((state) => [state.nodeId, state]));
  return <nav className="fallback-list" aria-label="科研影像工作流程">
    {template.nodes.map((node) => (
      <button
        type="button"
        className="fallback-item"
        aria-current={node.id === selectedNodeId ? 'step' : undefined}
        key={node.id}
        onClick={() => onSelectNode(node.id)}
      >
        <strong>{String(node.order).padStart(2, '0')} · {node.label}</strong>
        <div className="node-section-value">{stateById.get(node.id)?.summary ?? '尚未开始'}</div>
      </button>
    ))}
  </nav>;
}
