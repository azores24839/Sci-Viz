import type { WorkflowTemplate } from './types';

const node = (
  id: string,
  order: number,
  label: string,
  shortLabel: string,
  kind: WorkflowTemplate['nodes'][number]['kind'],
  owner: string,
  description: string,
  inputLabel: string,
  outputLabel: string,
): WorkflowTemplate['nodes'][number] => ({
  id,
  order,
  label,
  shortLabel,
  kind,
  owner,
  description,
  inputLabel,
  outputLabel,
  defaultPosition: { x: (order - 1) * 760, y: order % 2 === 0 ? 52 : 138 },
});

export const researchPhotoWorkflowV1: WorkflowTemplate = {
  id: 'research-static-photo-v1',
  version: 3,
  projectType: 'PHOTO',
  nodes: [
    node('source-intake', 1, '资料输入', '输入', 'INPUT', '资料管理员', '汇总上传资料、已有照片和官网线索', '资料 / 链接 / 已有照片', '资料包'),
    node('visual-diagnosis', 2, '视觉现状诊断', '诊断', 'AGENT', '资料分析师', '判断团队类型、科研语境、现有素材结构、视觉短板和可拍机会', '资料包', '视觉现状诊断'),
    node('goal-output-selection', 3, '目标与产物选择', '目标', 'HUMAN_GATE', '项目负责人', '确认一个主目标、最多一个次目标，并限定首版产物为拍摄静图', '视觉现状诊断', '目标配置'),
    node('case-benchmark', 4, '案例对标', '对标', 'AGENT', '科研策展人', '从案例库中选择同类型、同科研方向或同传播目标的静图参照', '视觉现状诊断 + 目标配置', '对标案例'),
    node('curation-strategy', 5, '策展策略', '策略', 'AGENT', '科研策展人', '把案例库研究转化为视觉路线、策展 brief 和传播重点', '对标案例 + 目标配置', '策展 brief'),
    node('photo-plan', 6, '静图拍摄方案', '方案', 'AGENT', '摄影策划师', '把策展 brief 转化为拍摄主题、画面卡和静图执行建议', '策展 brief', '静图拍摄方案'),
    node('ai-reference', 7, 'AI 参考图', '参考', 'AGENT', '摄影策划师', '生成或展示用于沟通的概念参考图，不替代真实拍摄', '静图拍摄方案', 'AI 参考图组'),
    node('plan-output', 8, '方案输出', '输出', 'OUTPUT', '摄影策划师', '汇总对外沟通版策划提案和摄影师执行版清单', '方案 + 参考图 + 画面卡', '完整方案'),
  ],
  edges: [
    ['source-intake', 'visual-diagnosis'],
    ['visual-diagnosis', 'goal-output-selection'],
    ['goal-output-selection', 'case-benchmark'],
    ['case-benchmark', 'curation-strategy'],
    ['curation-strategy', 'photo-plan'],
    ['photo-plan', 'ai-reference'],
    ['ai-reference', 'plan-output'],
  ].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target! })),
};
