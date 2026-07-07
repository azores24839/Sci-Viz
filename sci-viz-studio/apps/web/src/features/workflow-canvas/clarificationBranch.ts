import type { WorkflowClarificationItem, WorkflowNodeState } from '@studio/workflow-core';

const DATA_RE = /###\s*02A_DATA\s*\n([\s\S]*?)$/;
const visualAuditPattern = /视觉素材|视觉来源|视觉资源|现有视觉|画面质量|构图|色调|现场照片|视频|平面图|设备实物图/;
const goalBoundaryPattern = /用户.*(?:目标|目的|边界)|调研目标|调研目的|传播目标|目标与受众|受众|本次希望|重点关注方向/;
const shouldDropClarification = (text: string) => visualAuditPattern.test(text) || goalBoundaryPattern.test(text);

type ClarificationPayload = {
  clarificationTasks?: Array<{
    taskId?: string;
    title?: string;
    question?: string;
    whyNeeded?: string;
    impact?: string;
    suggestedInput?: string;
  }>;
  unknowns?: Array<{ title?: string; gap?: string; impact?: string; suggestion?: string }>;
};

function slug(text: string, index: number) {
  const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return base || `question-${index + 1}`;
}

export function stripClarificationData(md: string) {
  return md.replace(DATA_RE, '').trim();
}

function fallbackItemsFromProjectUnderstanding(md: string): WorkflowClarificationItem[] {
  const clean = stripClarificationData(md);
  const sectionMatch = clean.match(/###\s*(?:当前无法判断的信息|关键缺口|资料缺口)\s*\n([\s\S]*?)(?=\n###\s+|$)/);
  const body = sectionMatch?.[1] ?? '';
  return body
    .split('\n')
    .map((line) => line.trim().replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, ''))
    .filter((line) => line && line !== '暂无' && !shouldDropClarification(line))
    .slice(0, 8)
    .map((line, index) => {
      const [title = `待确认问题 ${index + 1}`, gap = line, impactRaw = '影响程度：中'] = line.split('｜').map((part) => part.trim());
      const impact = impactRaw.includes('高') ? '高' : impactRaw.includes('低') ? '低' : '中';
      return {
        id: slug(title, index),
        title,
        gap: gap || line,
        impact: impact as '高' | '中' | '低',
        suggestion: `请补充“${title}”相关的可靠说明、链接、文件或负责人确认口径。`,
        status: 'UNANSWERED' as const,
      };
    });
}

export function extractClarificationItems(md: string): WorkflowClarificationItem[] {
  const match = md.match(DATA_RE);
  if (!match?.[1]) return fallbackItemsFromProjectUnderstanding(md);
  try {
    const parsed = JSON.parse(match[1]) as ClarificationPayload;
    const taskItems = (parsed.clarificationTasks ?? []).map((item, index): WorkflowClarificationItem => ({
      id: slug(item.taskId || item.title || '', index),
      title: item.title?.trim() || `待确认问题 ${index + 1}`,
      gap: item.question?.trim() || '当前资料不足，需要进一步确认。',
      impact: item.impact === '低' || item.impact === '中' || item.impact === '高' ? item.impact : '中',
      suggestion: item.suggestedInput?.trim() || item.whyNeeded?.trim() || '请补充可以支持判断的文字、链接或文件。',
      status: 'UNANSWERED',
    })).filter((item) => !shouldDropClarification(`${item.title}\n${item.gap}\n${item.suggestion}`));
    if (taskItems.length > 0) return taskItems;

    return (parsed.unknowns ?? []).map((item, index): WorkflowClarificationItem => ({
      id: slug(item.title ?? '', index),
      title: item.title?.trim() || `待确认问题 ${index + 1}`,
      gap: item.gap?.trim() || '当前资料不足，需要进一步确认。',
      impact: item.impact === '低' || item.impact === '中' || item.impact === '高' ? item.impact : '中',
      suggestion: item.suggestion?.trim() || '请补充可以支持判断的文字、链接或文件。',
      status: 'UNANSWERED',
    })).filter((item) => !shouldDropClarification(`${item.title}\n${item.gap}\n${item.suggestion}`));
  } catch {
    return fallbackItemsFromProjectUnderstanding(md);
  }
}

export function buildClarificationArtifact(items: WorkflowClarificationItem[]) {
  const pending = items.filter((item) => item.status === 'UNANSWERED' || item.status === 'ANSWERED' || item.status === 'FROM_SOURCE');
  const answered = items.filter((item) => item.status === 'ANSWERED' || item.status === 'FROM_SOURCE' || item.status === 'UNCONFIRMABLE' || item.status === 'USED_IN_REVISION');
  const high = pending.filter((item) => item.impact === '高').map((item) => item.title).slice(0, 4);
  const state = answered.length > 0 && answered.some((item) => item.status === 'ANSWERED' || item.status === 'FROM_SOURCE')
    ? '已补充待分析'
    : pending.length > 0
      ? '待补充'
      : '已更新';

  return [
    '## 02A｜资料补充与问题澄清',
    `- 当前待补充数量：${pending.length}`,
    `- 高优先级缺口摘要：${high.length > 0 ? high.join('、') : '暂无高优先级缺口'}`,
    `- 已补充数量：${answered.length}`,
    `- 当前状态：${state}`,
  ].join('\n');
}

export function syncClarificationBranchFromUnderstanding(states: WorkflowNodeState[], projectUnderstandingNodeId = 'visual-diagnosis') {
  const understanding = states.find((state) => state.nodeId === projectUnderstandingNodeId);
  const branch = states.find((state) => state.nodeId === 'source-clarifications');
  if (!understanding?.artifactBody || !branch) return states;

  const items = extractClarificationItems(understanding.artifactBody);
  const previousItems = branch.clarificationItems ?? [];
  const restored = items.map((item) => {
    const previous = previousItems.find((entry) => entry.id === item.id || entry.title === item.title);
    if (!previous) return item;
    return {
      ...item,
      ...(previous.answer ? { answer: previous.answer } : {}),
      status: previous.status === 'USED_IN_REVISION' ? 'UNANSWERED' as const : previous.status,
    };
  });
  const nextVersion = Math.max(branch.clarificationVersion ?? 0, understanding.revision);
  const history = branch.clarificationItems && branch.clarificationItems.length > 0
    ? [
        ...(branch.clarificationHistory ?? []),
        {
          version: branch.clarificationVersion ?? Math.max(1, nextVersion - 1),
          projectUnderstandingRevision: Math.max(1, understanding.revision - 1),
          generatedAt: branch.updatedAt ?? new Date().toISOString(),
          ...(branch.artifactBody ? { artifactBody: branch.artifactBody } : {}),
          items: branch.clarificationItems,
        },
      ].slice(-8)
    : branch.clarificationHistory;

  return states.map((state) => state.nodeId === 'source-clarifications'
    ? {
        ...state,
        status: 'AWAITING_HUMAN' as const,
        progress: 78,
        summary: restored.length > 0 ? `仍有 ${restored.length} 项资料需要补充` : '当前没有新增补充问题',
        artifactLabel: `资料补充清单 v${nextVersion}`,
        artifactBody: buildClarificationArtifact(restored),
        clarificationItems: restored,
        ...(history ? { clarificationHistory: history } : {}),
        clarificationVersion: nextVersion,
        updatedAt: new Date().toISOString(),
      }
    : state);
}

export function updateClarificationItem(
  states: WorkflowNodeState[],
  itemId: string,
  update: Partial<WorkflowClarificationItem>,
) {
  return states.map((state) => {
    if (state.nodeId !== 'source-clarifications') return state;
    const items = (state.clarificationItems ?? []).map((item) => item.id === itemId ? { ...item, ...update } : item);
    return {
      ...state,
      artifactBody: buildClarificationArtifact(items),
      clarificationItems: items,
      summary: items.some((item) => item.status === 'ANSWERED' || item.status === 'FROM_SOURCE')
        ? '已补充待分析'
        : state.summary,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function buildClarificationRevisionInstruction(items: WorkflowClarificationItem[]) {
  const answered = items.filter((item) => (item.status === 'ANSWERED' || item.status === 'FROM_SOURCE' || item.status === 'UNCONFIRMABLE') && (item.answer || item.status === 'UNCONFIRMABLE'));
  if (answered.length === 0) return '';
  return [
    '根据 02A「资料补充与问题澄清」中的用户补充，重新生成 02 项目理解。请把这些回答作为用户补充资料处理，并生成新版 02A 清单；不要覆盖未确认边界。',
    ...answered.map((item) => `- ${item.title}：${item.status === 'UNCONFIRMABLE' ? '用户标记为暂无法确认。' : item.answer}`),
  ].join('\n');
}
