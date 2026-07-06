import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  applyNodeChanges,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import type { ProjectGoal } from '@studio/contracts';
import type { WorkflowNodeState, WorkflowTemplate } from '@studio/workflow-core';
import { toFlowElements, type StudioFlowNode } from './adapter';
import { WorkflowNodeCard } from './WorkflowNodeCard';

interface WorkflowCanvasProps {
  projectId: string;
  template: WorkflowTemplate;
  states: WorkflowNodeState[];
  selectedNodeId: string;
  focusRequestKey: number;
  onSelectNode: (nodeId: string) => void;
  onConfirmNode: (nodeId: string) => void;
  onReviseNode: (nodeId: string, instruction: string) => void;
  primaryPurposeId: ProjectGoal;
  secondaryPurposeId: ProjectGoal | '';
  purposeOptions: Array<{ id: ProjectGoal; label: string; description: string }>;
  onSetPrimaryPurpose: (purposeId: ProjectGoal) => void;
  onSetSecondaryPurpose: (purposeId: ProjectGoal | '') => void;
  onBenchmarkSelectionChange: (count: number) => void;
}

const nodeTypes = { workflow: WorkflowNodeCard };
export const DEFAULT_WORKFLOW_VIEWPORT = { x: 28, y: 54, zoom: 0.72 };

export function preserveWorkflowNodes(next: StudioFlowNode[], expected: StudioFlowNode[]) {
  if (expected.length === 0) return next;
  const nextById = new Map(next.map((node) => [node.id, node]));
  return expected.map((node) => nextById.get(node.id) ?? node);
}

export function WorkflowCanvas({ projectId, template, states, selectedNodeId, focusRequestKey, onSelectNode, onConfirmNode, onReviseNode, primaryPurposeId, secondaryPurposeId, purposeOptions, onSetPrimaryPurpose, onSetSecondaryPurpose, onBenchmarkSelectionChange }: WorkflowCanvasProps) {
  const initial = useMemo(() => toFlowElements(template, states), [template, states]);
  const [nodes, setNodes] = useState<StudioFlowNode[]>(initial.nodes);
  const [locked, setLocked] = useState(false);
  const flowRef = useRef<ReactFlowInstance<StudioFlowNode> | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNodes((current) => {
      const positionById = new Map(current.map((node) => [node.id, node.position]));
      return initial.nodes.map((node) => ({
        ...node,
        position: positionById.get(node.id) ?? node.position,
      }));
    });
  }, [initial.nodes]);

  const focusSelectedNode = useCallback((duration = 260) => {
    const target = nodes.find((node) => node.id === selectedNodeId);
    if (!target || !flowRef.current) return;
    void flowRef.current.fitView({
      nodes: [target],
      padding: 0.18,
      minZoom: 0.55,
      maxZoom: 0.82,
      duration,
    });
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => focusSelectedNode());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNodeId, focusRequestKey, focusSelectedNode]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let hadSize = element.clientWidth > 0 && element.clientHeight > 0;
    const observer = new ResizeObserver(([entry]) => {
      const hasSize = Boolean(entry && entry.contentRect.width > 0 && entry.contentRect.height > 0);
      if (hasSize && !hadSize) window.requestAnimationFrame(() => focusSelectedNode(0));
      hadSize = hasSize;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [focusSelectedNode]);

  const onNodesChange = useCallback((changes: NodeChange<StudioFlowNode>[]) => {
    setNodes((current) => preserveWorkflowNodes(applyNodeChanges(changes, current), initial.nodes));
  }, [initial.nodes]);

  const selectedEdges = initial.edges.map((edge) => {
    const isAdjacent = edge.target === selectedNodeId || edge.source === selectedNodeId;
    return isAdjacent ? { ...edge, className: 'selected' } : edge;
  });

  return (
    <div ref={canvasRef} className={`workflow-canvas${locked ? ' is-locked' : ''}`} aria-label="科研影像工作流画布">
      <ReactFlow
        onInit={(instance) => {
          flowRef.current = instance as unknown as ReactFlowInstance<StudioFlowNode>;
          window.requestAnimationFrame(() => focusSelectedNode(0));
        }}
        nodes={nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            projectId,
            onConfirm: () => onConfirmNode(node.id),
            onRevise: () => onReviseNode(node.id, ''),
            primaryPurposeId,
            secondaryPurposeId,
            purposeOptions,
            onSetPrimaryPurpose,
            onSetSecondaryPurpose,
            onBenchmarkSelectionChange,
          },
          selected: node.id === selectedNodeId,
          draggable: !locked,
          dragHandle: '.node-drag-handle',
        }))}
        edges={selectedEdges}
        defaultEdgeOptions={{
          style: {
            stroke: '#b7bdc1',
            strokeWidth: 1.65,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          },
        }}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        nodesConnectable={false}
        deleteKeyCode={null}
        elementsSelectable={!locked}
        panOnDrag={!locked}
        panOnScroll={!locked}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomActivationKeyCode="Meta"
        zoomOnScroll={false}
        zoomOnPinch={!locked}
        defaultViewport={DEFAULT_WORKFLOW_VIEWPORT}
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
