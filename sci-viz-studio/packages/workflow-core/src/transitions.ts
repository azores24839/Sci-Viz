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
