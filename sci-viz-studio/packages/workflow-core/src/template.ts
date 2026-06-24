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
  defaultPosition: { x: (order - 1) * 292, y: order === 2 ? 56 : 128 },
});

export const researchPhotoWorkflowV1: WorkflowTemplate = {
  id: 'research-photo-v1',
  version: 1,
  projectType: 'PHOTO',
  nodes: [
    node('source-intake', 1, '资料输入', '输入', 'INPUT', '资料管理员', '整理项目资料与来源', '文件 / 网页 / 访谈 / 图片', '资料集'),
    node('research-analysis', 2, '科研分析', '分析', 'AGENT', '科研分析师', '理解研究内容并发现视觉机会', '资料集', '科研理解包 v3'),
    node('science-review', 3, '科学审校', '审校', 'AGENT', '科学审校员', '检查证据、矛盾与表达风险', '科研理解包', '审校结果'),
    node('fact-confirmation', 4, '科研人员确认', '确认', 'HUMAN_GATE', '科研人员', '确认事实、公开边界与安全要求', '审校问题', '审核记录'),
    node('visual-plan', 5, '影像方案', '方案', 'AGENT', '影像策划师', '形成视觉概念与摄影叙事', '已确认事实', '拍摄方案 v1'),
    node('capture-preparation', 6, '现场执行', '成篇', 'EXECUTION', '摄影指导', '生成画面卡与现场清单', '拍摄方案', '拍摄清单'),
    node('plan-output', 7, '方案输出', '输出', 'OUTPUT', '项目负责人', '汇总可执行的网页方案', '画面卡与清单', '摄影策划方案'),
  ],
  edges: [
    ['source-intake', 'research-analysis'],
    ['research-analysis', 'science-review'],
    ['science-review', 'fact-confirmation'],
    ['fact-confirmation', 'visual-plan'],
    ['visual-plan', 'capture-preparation'],
    ['capture-preparation', 'plan-output'],
  ].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target! })),
};
