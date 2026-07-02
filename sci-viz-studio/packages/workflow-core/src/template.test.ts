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
    expect(researchPhotoWorkflowV1.nodes.map((node) => node.id)).toEqual([
      'source-intake',
      'visual-diagnosis',
      'goal-output-selection',
      'case-benchmark',
      'curation-strategy',
      'photo-plan',
      'ai-reference',
      'plan-output',
    ]);
  });

  it('blocks a downstream node until its source is complete and clear', () => {
    const states: WorkflowNodeState[] = [{
      nodeId: 'case-benchmark',
      status: 'COMPLETED',
      blockerCount: 1,
      progress: 100,
      summary: '仍有阻塞问题',
      revision: 1,
    }];
    expect(canEnterNode(researchPhotoWorkflowV1, 'curation-strategy', states)).toBe(false);
    expect(canEnterNode(researchPhotoWorkflowV1, 'curation-strategy', [{ ...states[0]!, blockerCount: 0 }])).toBe(true);
  });

  it('supports director-style confirmation before the next node starts', () => {
    const states = createDirectorWorkflowStates(researchPhotoWorkflowV1, ['source-intake']);
    expect(getCurrentDirectorNodeId(researchPhotoWorkflowV1, states)).toBe('visual-diagnosis');

    const drafted = completeNodeDraft(states, 'visual-diagnosis', {
      label: '视觉现状诊断 v1',
      body: '测试草案',
    });
    expect(drafted.find((state) => state.nodeId === 'visual-diagnosis')?.status).toBe('AWAITING_HUMAN');

    const confirmed = confirmNodeAndQueueNext(researchPhotoWorkflowV1, drafted, 'visual-diagnosis');
    expect(confirmed.find((state) => state.nodeId === 'visual-diagnosis')?.status).toBe('COMPLETED');
    expect(confirmed.find((state) => state.nodeId === 'goal-output-selection')?.status).toBe('READY');
  });

  it('creates a new plan label when the user asks for revision', () => {
    const states = completeNodeDraft(createDirectorWorkflowStates(researchPhotoWorkflowV1, ['source-intake']), 'visual-diagnosis', {
      label: '视觉现状诊断 v1',
      body: '测试草案',
    });
    const revised = reviseNodeDraft(researchPhotoWorkflowV1, states, 'visual-diagnosis', '更强调已有照片缺口');
    const research = revised.find((state) => state.nodeId === 'visual-diagnosis');
    expect(research?.status).toBe('READY');
    expect(research?.revision).toBe(2);
    expect(research?.planLabel).toBe('Plan B');
    expect(research?.lastUserInstruction).toBe('更强调已有照片缺口');
  });
});
