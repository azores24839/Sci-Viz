export type WorkflowNodeStatus =
  | 'LOCKED'
  | 'READY'
  | 'QUEUED'
  | 'RUNNING'
  | 'AWAITING_HUMAN'
  | 'COMPLETED'
  | 'FAILED';

export type WorkflowNodeKind = 'INPUT' | 'AGENT' | 'HUMAN_GATE' | 'EXECUTION' | 'OUTPUT';

export interface WorkflowPosition {
  x: number;
  y: number;
}

export interface WorkflowNodeDefinition {
  id: string;
  order: number;
  label: string;
  shortLabel: string;
  kind: WorkflowNodeKind;
  owner: string;
  description: string;
  inputLabel: string;
  outputLabel: string;
  defaultPosition: WorkflowPosition;
}

export interface WorkflowEdgeDefinition {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowTemplate {
  id: string;
  version: number;
  projectType: 'PHOTO' | 'VIDEO';
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}

export interface WorkflowNodeState {
  nodeId: string;
  status: WorkflowNodeStatus;
  blockerCount: number;
  progress: number;
  summary: string;
  artifactLabel?: string;
  artifactBody?: string;
  revision: number;
  planLabel?: string;
  confirmedAt?: string;
  updatedAt?: string;
}
