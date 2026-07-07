import { describe, expect, it } from 'vitest';
import { createDirectorWorkflowStates, researchPhotoWorkflowV1 } from '@studio/workflow-core';
import { migrateLegacyMockWorkflow } from './workflowMigration';

describe('migrateLegacyMockWorkflow', () => {
  it('resets a workflow carrying the legacy Case Hub mock package', () => {
    const states = createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => state.nodeId === 'source-intake'
      ? { ...state, status: 'COMPLETED' as const, artifactBody: 'Sci-Viz Case Hub mock 资料库' }
      : state.nodeId === 'visual-diagnosis'
        ? { ...state, status: 'COMPLETED' as const, artifactBody: '长兴 demo 诊断' }
        : state);

    const migrated = migrateLegacyMockWorkflow(states, []);
    const sourceState = migrated.find((state) => state.nodeId === 'source-intake');
    expect(sourceState).toMatchObject({
      status: 'AWAITING_HUMAN',
      artifactLabel: '项目资料包',
    });
    expect(sourceState?.artifactBody).toBeUndefined();
    expect(migrated.find((state) => state.nodeId === 'visual-diagnosis')?.status).toBe('LOCKED');
  });

  it('preserves workflows without a known mock fingerprint', () => {
    const states = createDirectorWorkflowStates(researchPhotoWorkflowV1);
    expect(migrateLegacyMockWorkflow(states, [])).toStrictEqual(states);
  });
});
