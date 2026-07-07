import { describe, expect, it } from 'vitest';
import { createDirectorWorkflowStates, researchPhotoWorkflowV1 } from '@studio/workflow-core';
import type { SourceDocument } from '@studio/contracts';
import { resetWorkflowForSourceChange } from './sourceWorkflowReset';

function mockSource(title: string): SourceDocument {
  return {
    id: `src-${title}`, projectId: 'p1', kind: 'FILE', status: 'READY',
    selected: true, title, truncated: false, createdAt: '', updatedAt: '',
  };
}

describe('resetWorkflowForSourceChange', () => {
  it('restarts diagnosis and invalidates downstream artifacts', () => {
    const states = createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => ({
      ...state,
      status: 'COMPLETED' as const,
      artifactBody: '旧结果',
      revision: 2,
    }));
    const next = resetWorkflowForSourceChange(states, [mockSource('实验报告'), mockSource('项目说明')]);

    expect(next.find((state) => state.nodeId === 'source-intake')).toMatchObject({ status: 'COMPLETED' });
    expect(next.find((state) => state.nodeId === 'visual-diagnosis')).toMatchObject({ status: 'READY', revision: 3 });
    expect(next.find((state) => state.nodeId === 'photo-plan')).toMatchObject({ status: 'LOCKED', revision: 3 });
    expect(next.find((state) => state.nodeId === 'photo-plan')?.artifactBody).toBeUndefined();
  });

  it('returns to source input when no usable source remains', () => {
    const next = resetWorkflowForSourceChange(createDirectorWorkflowStates(researchPhotoWorkflowV1), []);
    expect(next.find((state) => state.nodeId === 'source-intake')?.status).toBe('AWAITING_HUMAN');
    expect(next.find((state) => state.nodeId === 'visual-diagnosis')?.status).toBe('LOCKED');
  });
});
