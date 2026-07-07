import { createDirectorWorkflowStates, researchPhotoWorkflowV1, type WorkflowNodeState } from '@studio/workflow-core';
import type { SourceDocument } from '@studio/contracts';
import { formatSourceSummary } from '../sources/sourceUtils';

const LEGACY_MOCK_FINGERPRINTS = [
  'Sci-Viz Case Hub mock 资料库',
  'Case Hub mock 样本',
  '当前使用 Sci-Viz Case Hub mock 样本作为资料源',
];

export function containsLegacyMockContent(state: WorkflowNodeState) {
  const content = [state.artifactLabel, state.artifactBody, state.summary].filter(Boolean).join('\n');
  return LEGACY_MOCK_FINGERPRINTS.some((fingerprint) => content.includes(fingerprint));
}

export function migrateLegacyMockWorkflow(states: WorkflowNodeState[], selectedSources: SourceDocument[]) {
  const sourceCount = selectedSources.length;
  const withTemplateNodes = () => {
    const byId = new Map(states.map((state) => [state.nodeId, state]));
    return createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => byId.get(state.nodeId) ?? state);
  };

  if (!states.some(containsLegacyMockContent)) return withTemplateNodes();

  return createDirectorWorkflowStates(researchPhotoWorkflowV1).map((state) => state.nodeId === 'source-intake'
    ? {
        ...state,
        status: 'AWAITING_HUMAN' as const,
        progress: sourceCount > 0 ? 80 : 50,
        summary: formatSourceSummary(selectedSources),
        artifactLabel: '项目资料包',
      }
    : state);
}
