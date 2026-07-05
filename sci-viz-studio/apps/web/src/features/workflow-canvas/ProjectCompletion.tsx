import type { WorkflowNodeState } from '@studio/workflow-core';

export function ProjectCompletion({ states, onOpenPlan }: { states: WorkflowNodeState[]; onOpenPlan: () => void }) {
  const byId = new Map(states.map((state) => [state.nodeId, state]));
  const outputReady = byId.get('plan-output')?.status === 'COMPLETED';
  if (!outputReady) return null;
  const items = [
    ['资料分析完成', byId.get('visual-diagnosis')?.status === 'COMPLETED'],
    ['视觉方向与案例参考完成', byId.get('curation-strategy')?.status === 'COMPLETED'],
    ['摄影方案与画面卡已准备', byId.get('photo-plan')?.status === 'COMPLETED'],
    ['完整方案已确认', outputReady],
  ] as const;
  return <section className="project-completion" aria-label="项目完成情况">
    <div><span className="completion-mark">✓</span><span><strong>摄影方案已经准备完成</strong><small>你可以继续完善画面卡、查看现场清单，或发送给专家确认。</small></span></div>
    <ul>{items.map(([label, done]) => <li className={done ? 'is-done' : ''} key={label}><span>{done ? '✓' : '○'}</span>{label}</li>)}</ul>
    <button type="button" onClick={onOpenPlan}>查看摄影执行内容</button>
  </section>;
}
