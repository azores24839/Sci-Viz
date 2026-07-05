import type { WorkflowNodeState } from '@studio/workflow-core';

function clearGeneratedContent(state: WorkflowNodeState): WorkflowNodeState {
  const {
    artifactBody: _artifactBody,
    artifactLabel: _artifactLabel,
    images: _images,
    evidence: _evidence,
    lastUserInstruction: _lastUserInstruction,
    confirmedAt: _confirmedAt,
    ...rest
  } = state;
  return { ...rest, blockerCount: 0, progress: 0, revision: state.revision + 1 };
}

export function resetWorkflowForSourceChange(states: WorkflowNodeState[], usableSourceCount: number) {
  return states.map((state) => {
    if (state.nodeId === 'source-intake') {
      return {
        ...state,
        status: usableSourceCount > 0 ? 'COMPLETED' as const : 'AWAITING_HUMAN' as const,
        progress: usableSourceCount > 0 ? 100 : 50,
        summary: usableSourceCount > 0 ? `已选择 ${usableSourceCount} 份可用资料` : '请添加并选择至少一份已解析资料',
        artifactLabel: '项目资料包',
        artifactBody: `### 资料状态\n- 已选择 ${usableSourceCount} 份可用资料`,
        updatedAt: new Date().toISOString(),
      };
    }

    const cleared = clearGeneratedContent(state);
    if (state.nodeId === 'visual-diagnosis') {
      return {
        ...cleared,
        status: usableSourceCount > 0 ? 'READY' as const : 'LOCKED' as const,
        summary: usableSourceCount > 0 ? '资料已更新，准备重新诊断' : '等待资料输入',
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

