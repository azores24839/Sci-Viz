import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type NodeChange,
} from '@xyflow/react';
import type { WorkflowNodeState, WorkflowTemplate } from '@studio/workflow-core';
import { toFlowElements, type StudioFlowNode } from './adapter';
import { WorkflowNodeCard } from './WorkflowNodeCard';

interface WorkflowCanvasProps {
  template: WorkflowTemplate;
  states: WorkflowNodeState[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
}

const nodeTypes = { workflow: WorkflowNodeCard };

export function WorkflowCanvas({ template, states, selectedNodeId, onSelectNode }: WorkflowCanvasProps) {
  const initial = useMemo(() => toFlowElements(template, states), [template, states]);
  const [nodes, setNodes] = useState<StudioFlowNode[]>(initial.nodes);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setNodes((current) => {
      const positionById = new Map(current.map((node) => [node.id, node.position]));
      return initial.nodes.map((node) => ({
        ...node,
        position: positionById.get(node.id) ?? node.position,
      }));
    });
  }, [initial.nodes]);

  const onNodesChange = useCallback((changes: NodeChange<StudioFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const selectedEdges = initial.edges.map((edge) => {
    const isAdjacent = edge.target === selectedNodeId || edge.source === selectedNodeId;
    return isAdjacent ? { ...edge, className: 'selected' } : edge;
  });

  return (
    <div className={`workflow-canvas${locked ? ' is-locked' : ''}`} aria-label="科研影像工作流画布">
      <ReactFlow
        nodes={nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId, draggable: !locked }))}
        edges={selectedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        nodesConnectable={false}
        deleteKeyCode={null}
        elementsSelectable={!locked}
        panOnDrag={!locked}
        zoomOnScroll={!locked}
        defaultViewport={{ x: -72, y: 74, zoom: 0.72 }}
        minZoom={0.35}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#dfe5ee" gap={26} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <button className="canvas-lock" type="button" onClick={() => setLocked((value) => !value)} aria-pressed={locked}>
        <span aria-hidden="true">{locked ? '⌁' : '▢'}</span>{locked ? '已锁定' : '锁定'}
      </button>
    </div>
  );
}
