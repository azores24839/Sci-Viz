import type { Edge, Node } from '@xyflow/react';
import type { WorkflowNodeDefinition, WorkflowNodeState, WorkflowTemplate } from '@studio/workflow-core';

export interface StudioNodeData extends Record<string, unknown> {
  definition: WorkflowNodeDefinition;
  state: WorkflowNodeState;
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
  const edges: Edge[] = template.edges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    selectable: false,
    animated: stateById.get(edge.source)?.status === 'RUNNING',
  }));
  return { nodes, edges };
}
