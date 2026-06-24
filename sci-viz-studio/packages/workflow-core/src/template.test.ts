import { describe, expect, it } from 'vitest';
import { researchPhotoWorkflowV1 } from './template';
import { canEnterNode, validateTemplate } from './transitions';
import type { WorkflowNodeState } from './types';

describe('research photo workflow', () => {
  it('uses stable semantic ids and an acyclic topology', () => {
    expect(validateTemplate(researchPhotoWorkflowV1)).toEqual({ valid: true, errors: [] });
    expect(researchPhotoWorkflowV1.nodes).toHaveLength(7);
  });

  it('blocks a downstream node until its source is complete and clear', () => {
    const states: WorkflowNodeState[] = [{
      nodeId: 'fact-confirmation',
      status: 'COMPLETED',
      blockerCount: 1,
      progress: 100,
      summary: '仍有阻塞问题',
    }];
    expect(canEnterNode(researchPhotoWorkflowV1, 'visual-plan', states)).toBe(false);
    expect(canEnterNode(researchPhotoWorkflowV1, 'visual-plan', [{ ...states[0]!, blockerCount: 0 }])).toBe(true);
  });
});
