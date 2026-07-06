import { createDirectorWorkflowStates, researchPhotoWorkflowV1, type WorkflowNodeState } from '@studio/workflow-core';

const LEGACY_MOCK_FINGERPRINTS = [
  'Sci-Viz Case Hub mock 资料库',
  'Case Hub mock 样本',
  '当前使用 Sci-Viz Case Hub mock 样本作为资料源',
];

export function containsLegacyMockContent(state: WorkflowNodeState) {
  const content = [state.artifactLabel, state.artifactBody, state.summary].filter(Boolean).join('\n');
  return LEGACY_MOCK_FINGERPRINTS.some((fingerprint) => content.includes(fingerprint));
}

export function migrateLegacyMockWorkflow(states: WorkflowNodeState[], usableSourceCount: number) {
  if (!states.some(containsLegacyMockContent)) return states;

  return createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => state.nodeId === 'source-intake'
    ? {
        ...state,
        status: 'AWAITING_HUMAN' as const,
        progress: usableSourceCount > 0 ? 80 : 50,
        summary: usableSourceCount > 0
          ? `已选择 ${usableSourceCount} 份可用资料`
          : '请添加并选择至少一份已解析资料',
        artifactLabel: '项目资料包',
      }
    : state);
}
