import { describe, expect, it } from 'vitest';
import type { StudioFlowNode } from './adapter';
import { DEFAULT_WORKFLOW_VIEWPORT, preserveWorkflowNodes } from './WorkflowCanvas';

describe('WorkflowCanvas default viewport', () => {
  it('opens zoomed out enough to show workflow context', () => {
    expect(DEFAULT_WORKFLOW_VIEWPORT.zoom).toBe(0.72);
    expect(DEFAULT_WORKFLOW_VIEWPORT.zoom).toBeLessThan(1);
  });
});

describe('preserveWorkflowNodes', () => {
  it('restores required nodes if React Flow emits an empty reset during hot reload', () => {
    const expected = [
      { id: 'source-intake', position: { x: 0, y: 0 }, data: {} },
      { id: 'visual-diagnosis', position: { x: 760, y: 52 }, data: {} },
    ] as StudioFlowNode[];

    expect(preserveWorkflowNodes([], expected)).toEqual(expected);
  });

  it('keeps the current position for nodes that remain mounted', () => {
    const expected = [
      { id: 'source-intake', position: { x: 0, y: 0 }, data: {} },
    ] as StudioFlowNode[];
    const moved = [
      { ...expected[0], position: { x: 120, y: 80 } },
    ] as StudioFlowNode[];

    expect(preserveWorkflowNodes(moved, expected)[0]?.position).toEqual({ x: 120, y: 80 });
  });
});
