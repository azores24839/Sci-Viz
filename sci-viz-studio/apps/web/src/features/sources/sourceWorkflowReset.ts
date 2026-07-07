import type { WorkflowNodeState } from '@studio/workflow-core';
import type { SourceDocument } from '@studio/contracts';
import { formatSourceSummary } from './sourceUtils';

function clearGeneratedContent(state: WorkflowNodeState): WorkflowNodeState {
  const {
    artifactBody: _artifactBody,
    artifactLabel: _artifactLabel,
    images: _images,
    evidence: _evidence,
    clarificationItems: _clarificationItems,
    clarificationHistory: _clarificationHistory,
    clarificationVersion: _clarificationVersion,
    lastUserInstruction: _lastUserInstruction,
    confirmedAt: _confirmedAt,
    ...rest
  } = state;
  return { ...rest, blockerCount: 0, progress: 0, revision: state.revision + 1 };
}

export function resetWorkflowForSourceChange(states: WorkflowNodeState[], selectedSources: SourceDocument[]) {
  const sourceCount = selectedSources.length;
  return states.map((state) => {
    if (state.nodeId === 'source-intake') {
      return {
        ...state,
        status: sourceCount > 0 ? 'COMPLETED' as const : 'AWAITING_HUMAN' as const,
        progress: sourceCount > 0 ? 100 : 50,
        summary: formatSourceSummary(selectedSources),
        artifactLabel: '项目资料包',
        artifactBody: `### 资料状态\n- ${formatSourceSummary(selectedSources)}`,
        updatedAt: new Date().toISOString(),
      };
    }

    const cleared = clearGeneratedContent(state);
    if (state.nodeId === 'visual-diagnosis') {
      return {
        ...cleared,
        status: sourceCount > 0 ? 'READY' as const : 'LOCKED' as const,
        summary: sourceCount > 0 ? '检测到新增资料，可重新分析项目理解' : '等待资料输入',
        updatedAt: new Date().toISOString(),
      };
    }

    if (state.nodeId === 'source-clarifications') {
      return {
        ...cleared,
        status: 'LOCKED' as const,
        summary: '检测到新增资料，等待 02 重新分析后更新补充清单',
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...cleared,
      status: 'LOCKED' as const,
      summary: '上游资料已更新，等待重新生成',
      updatedAt: new Date().toISOString(),
    };
  });
}
