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
  auxiliary?: boolean;
  branchOf?: string;
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
  images?: Array<{ url: string; prompt: string }>;
  evidence?: Array<{ statement: string; basis: 'SOURCE' | 'PENDING_CONFIRMATION' | 'USER_SUPPLIED'; sourceIds: string[]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }>;
  clarificationItems?: WorkflowClarificationItem[];
  clarificationHistory?: WorkflowClarificationSnapshot[];
  clarificationVersion?: number;
  revision: number;
  planLabel?: string;
  lastUserInstruction?: string;
  confirmedAt?: string;
  updatedAt?: string;
}

export type WorkflowClarificationStatus =
  | 'UNANSWERED'
  | 'ANSWERED'
  | 'FROM_SOURCE'
  | 'UNCONFIRMABLE'
  | 'USED_IN_REVISION';

export interface WorkflowClarificationItem {
  id: string;
  title: string;
  gap: string;
  impact: '高' | '中' | '低';
  suggestion: string;
  answer?: string;
  status: WorkflowClarificationStatus;
}

export interface WorkflowClarificationSnapshot {
  version: number;
  projectUnderstandingRevision: number;
  generatedAt: string;
  artifactBody?: string;
  items: WorkflowClarificationItem[];
}
