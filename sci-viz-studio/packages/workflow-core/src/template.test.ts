import { describe, expect, it } from 'vitest';
import { researchPhotoWorkflowV1 } from './template';
import {
  canEnterNode,
  completeNodeDraft,
  confirmNodeAndQueueNext,
  createDirectorWorkflowStates,
  getCurrentDirectorNodeId,
  reviseNodeDraft,
  validateTemplate,
} from './transitions';
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
      revision: 1,
    }];
    expect(canEnterNode(researchPhotoWorkflowV1, 'visual-plan', states)).toBe(false);
    expect(canEnterNode(researchPhotoWorkflowV1, 'visual-plan', [{ ...states[0]!, blockerCount: 0 }])).toBe(true);
  });

  it('supports director-style confirmation before the next node starts', () => {
    const states = createDirectorWorkflowStates(researchPhotoWorkflowV1, ['source-intake']);
    expect(getCurrentDirectorNodeId(researchPhotoWorkflowV1, states)).toBe('research-analysis');

    const drafted = completeNodeDraft(states, 'research-analysis', {
      label: '科研理解包 v1',
      body: '测试草案',
    });
    expect(drafted.find((state) => state.nodeId === 'research-analysis')?.status).toBe('AWAITING_HUMAN');

    const confirmed = confirmNodeAndQueueNext(researchPhotoWorkflowV1, drafted, 'research-analysis');
    expect(confirmed.find((state) => state.nodeId === 'research-analysis')?.status).toBe('COMPLETED');
    expect(confirmed.find((state) => state.nodeId === 'science-review')?.status).toBe('READY');
  });

  it('creates a new plan label when the user asks for revision', () => {
    const states = completeNodeDraft(createDirectorWorkflowStates(researchPhotoWorkflowV1, ['source-intake']), 'research-analysis', {
      label: '科研理解包 v1',
      body: '测试草案',
    });
    const revised = reviseNodeDraft(researchPhotoWorkflowV1, states, 'research-analysis', '更强调样品制备');
    const research = revised.find((state) => state.nodeId === 'research-analysis');
    expect(research?.status).toBe('READY');
    expect(research?.revision).toBe(2);
    expect(research?.planLabel).toBe('Plan B');
  });
});
