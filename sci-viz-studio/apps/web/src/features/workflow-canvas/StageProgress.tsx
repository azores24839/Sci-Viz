import type { WorkflowNodeState } from '@studio/workflow-core';

const steps = [
  { nodeId: 'source-intake', label: '资料输入' },
  { nodeId: 'visual-diagnosis', label: '项目理解' },
  { nodeId: 'goal-output-selection', label: '目标' },
  { nodeId: 'case-benchmark', label: '案例对标' },
  { nodeId: 'curation-strategy', label: '策展策略' },
  { nodeId: 'photo-plan', label: '拍摄方案' },
  { nodeId: 'ai-reference', label: '参考图' },
];

export function StageProgress({ states, selectedNodeId, onSelectNode }: { states: WorkflowNodeState[]; selectedNodeId: string; onSelectNode: (nodeId: string) => void }) {
  const stateById = new Map(states.map((state) => [state.nodeId, state]));
  return <nav className="stage-progress" aria-label="项目阶段">
    {steps.map((step, index) => {
      const state = stateById.get(step.nodeId);
      const completed = state?.status === 'COMPLETED';
      const active = step.nodeId === selectedNodeId;
      return <button type="button" className={`stage-step${active ? ' is-active' : ''}${completed ? ' is-completed' : ''}`} onClick={() => onSelectNode(step.nodeId)} key={step.nodeId}>
        <span>{step.label}</span>
        {index < steps.length - 1 && <i aria-hidden="true">·</i>}
      </button>;
    })}
  </nav>;
}
