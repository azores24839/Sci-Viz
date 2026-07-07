import type { Edge, Node } from '@xyflow/react';
import type { ProjectGoal, SourceDocument } from '@studio/contracts';
import type { WorkflowClarificationItem, WorkflowNodeDefinition, WorkflowNodeState, WorkflowTemplate } from '@studio/workflow-core';

export interface StudioNodeData extends Record<string, unknown> {
  definition: WorkflowNodeDefinition;
  state: WorkflowNodeState;
  projectId?: string;
  onConfirm?: () => void;
  onRevise?: () => void;
  primaryPurposeId?: ProjectGoal;
  secondaryPurposeId?: ProjectGoal | '';
  purposeOptions?: Array<{ id: ProjectGoal; label: string; description: string }>;
  onSetPrimaryPurpose?: (purposeId: ProjectGoal) => void;
  onSetSecondaryPurpose?: (purposeId: ProjectGoal | '') => void;
  onBenchmarkSelectionChange?: (count: number) => void;
  onOpenClarifications?: () => void;
  onSourcesChange?: (sources: SourceDocument[]) => void;
  onReanalyzeProjectUnderstanding?: () => void;
  onUpdateClarification?: (itemId: string, update: Partial<WorkflowClarificationItem>) => void;
}

export type StudioFlowNode = Node<StudioNodeData, 'workflow'>;

export function toFlowElements(template: WorkflowTemplate, states: WorkflowNodeState[]): {
  nodes: StudioFlowNode[];
  edges: Edge[];
} {
  const stateById = new Map(states.map((state) => [state.nodeId, state]));
  const nodes: StudioFlowNode[] = template.nodes.map((definition) => ({
    id: definition.id,
    type: 'workflow',
    position: definition.defaultPosition,
    data: {
      definition,
        state: stateById.get(definition.id) ?? {
          nodeId: definition.id,
          status: 'LOCKED',
          blockerCount: 0,
          progress: 0,
          summary: '尚未开始',
          revision: 1,
        },
      },
    draggable: true,
    selectable: true,
    deletable: false,
  }));
  const auxiliaryTargets = new Set(template.nodes.filter((node) => node.auxiliary).map((node) => node.id));
  const edges: Edge[] = template.edges.map((edge) => {
    const auxiliary = auxiliaryTargets.has(edge.target);
    return {
      ...edge,
      type: 'default',
      selectable: false,
      animated: !auxiliary && stateById.get(edge.source)?.status === 'RUNNING',
      ...(auxiliary ? { className: 'is-auxiliary', style: { stroke: '#c9c5bf', strokeDasharray: '6 7', strokeWidth: 1.4 } } : {}),
    };
  });
  return { nodes, edges };
}
