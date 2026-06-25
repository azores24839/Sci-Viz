import type { WorkflowNodeState, WorkflowTemplate } from './types';

export interface TemplateValidation {
  valid: boolean;
  errors: string[];
}

export function validateTemplate(template: WorkflowTemplate): TemplateValidation {
  const errors: string[] = [];
  const ids = new Set(template.nodes.map((node) => node.id));
  if (ids.size !== template.nodes.length) errors.push('Node ids must be unique.');

  for (const edge of template.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push(`Edge ${edge.id} references an unknown node.`);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const edge of template.edges) adjacency.get(edge.source)?.push(edge.target);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (adjacency.get(id)?.some(hasCycle)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if ([...ids].some(hasCycle)) errors.push('Workflow must be acyclic.');
  return { valid: errors.length === 0, errors };
}

export function canEnterNode(
  template: WorkflowTemplate,
  nodeId: string,
  states: WorkflowNodeState[],
): boolean {
  const stateById = new Map(states.map((state) => [state.nodeId, state]));
  const incoming = template.edges.filter((edge) => edge.target === nodeId);
  if (incoming.length === 0) return true;
  return incoming.every((edge) => {
    const source = stateById.get(edge.source);
    return source?.status === 'COMPLETED' && source.blockerCount === 0;
  });
}

const nowIso = () => new Date().toISOString();

export function createDirectorWorkflowStates(
  template: WorkflowTemplate,
  completedNodeIds: string[] = [],
): WorkflowNodeState[] {
  const completed = new Set(completedNodeIds);
  const firstOpenNode = template.nodes.find((node) => !completed.has(node.id));

  return template.nodes.map((node) => {
    const isCompleted = completed.has(node.id);
    const isFirstOpen = firstOpenNode?.id === node.id;
    return {
      nodeId: node.id,
      status: isCompleted ? 'COMPLETED' : isFirstOpen ? 'READY' : 'LOCKED',
      blockerCount: 0,
      progress: isCompleted ? 100 : 0,
      summary: isCompleted ? `${node.label}已确认` : isFirstOpen ? '等待自动处理' : `等待${node.inputLabel}`,
      artifactLabel: isCompleted ? `${node.outputLabel} v1` : node.outputLabel,
      ...(isCompleted ? { artifactBody: `${node.label}已完成，可作为后续节点输入。` } : {}),
      revision: 1,
      planLabel: 'Plan A',
      updatedAt: nowIso(),
    };
  });
}

export function getCurrentDirectorNodeId(template: WorkflowTemplate, states: WorkflowNodeState[]): string {
  const stateById = new Map(states.map((state) => [state.nodeId, state]));
  const active = template.nodes.find((node) => {
    const status = stateById.get(node.id)?.status;
    return status === 'RUNNING' || status === 'AWAITING_HUMAN' || status === 'FAILED' || status === 'READY' || status === 'QUEUED';
  });
  return active?.id ?? template.nodes.at(-1)?.id ?? '';
}

export function markNodeRunning(states: WorkflowNodeState[], nodeId: string): WorkflowNodeState[] {
  return states.map((state) => state.nodeId === nodeId
    ? { ...state, status: 'RUNNING', progress: 35, summary: 'Agent 正在处理…', updatedAt: nowIso() }
    : state);
}

export function completeNodeDraft(
  states: WorkflowNodeState[],
  nodeId: string,
  artifact: { label: string; body: string; blockerCount?: number },
): WorkflowNodeState[] {
  return states.map((state) => state.nodeId === nodeId
    ? {
        ...state,
        status: 'AWAITING_HUMAN',
        progress: 92,
        blockerCount: artifact.blockerCount ?? 0,
        summary: '草案已生成，等待你确认',
        artifactLabel: artifact.label,
        artifactBody: artifact.body,
        updatedAt: nowIso(),
      }
    : state);
}

export function confirmNodeAndQueueNext(
  template: WorkflowTemplate,
  states: WorkflowNodeState[],
  nodeId: string,
): WorkflowNodeState[] {
  const currentIndex = template.nodes.findIndex((node) => node.id === nodeId);
  const nextNode = template.nodes[currentIndex + 1];

  return states.map((state) => {
    if (state.nodeId === nodeId) {
      return {
        ...state,
        status: 'COMPLETED',
        progress: 100,
        blockerCount: 0,
        summary: '已确认，可进入下一步',
        confirmedAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    if (nextNode && state.nodeId === nextNode.id) {
      return {
        ...state,
        status: 'READY',
        progress: 0,
        summary: '等待自动处理',
        updatedAt: nowIso(),
      };
    }

    return state;
  });
}

export function reviseNodeDraft(
  template: WorkflowTemplate,
  states: WorkflowNodeState[],
  nodeId: string,
  instruction: string,
): WorkflowNodeState[] {
  const node = template.nodes.find((item) => item.id === nodeId);
  return states.map((state) => {
    if (state.nodeId !== nodeId) return state;
    const revision = state.revision + 1;
    return {
      ...state,
      status: 'READY',
      progress: 0,
      blockerCount: 0,
      revision,
      planLabel: `Plan ${String.fromCharCode(64 + Math.min(revision, 26))}`,
      summary: instruction.trim()
        ? `收到修改意见：${instruction.trim().slice(0, 34)}`
        : `准备重新生成${node?.label ?? '节点'}草案`,
      artifactLabel: `${node?.outputLabel ?? '草案'} v${revision}`,
      ...(instruction.trim() ? { lastUserInstruction: instruction.trim() } : {}),
      updatedAt: nowIso(),
    };
  });
}
