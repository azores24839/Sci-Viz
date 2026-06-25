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
  defaultPosition: { x: (order - 1) * 348, y: order === 2 ? 56 : 128 },
});

export const researchPhotoWorkflowV1: WorkflowTemplate = {
  id: 'research-photo-v1',
  version: 2,
  projectType: 'PHOTO',
  nodes: [
    node('project-brief', 1, '项目简报', '简报', 'AGENT', '项目制片人', '确认拍摄目的、受众、输出形式与限制条件', '资料 / 需求 / 目标', '项目简报'),
    node('research-curation', 2, '科研叙事', '叙事', 'AGENT', '科研策展人', '把科研资料转成准确、可传播、可拍摄的科学叙事', '项目简报 + 科研资料', '科研叙事包'),
    node('visual-strategy', 3, '影像方案', '方案', 'AGENT', '影像策划师', '把科研叙事转成视觉概念、画面结构与风格策略', '科研叙事包', '影像方案'),
    node('production-plan', 4, '拍摄执行', '执行', 'EXECUTION', '拍摄导演', '把影像方案转成镜头清单、素材清单与现场执行计划', '影像方案', '拍摄执行单'),
    node('plan-output', 5, '方案输出', '输出', 'OUTPUT', '项目制片人', '汇总可交付的科研影像方案', '项目简报 + 执行单', '完整方案'),
  ],
  edges: [
    ['project-brief', 'research-curation'],
    ['research-curation', 'visual-strategy'],
    ['visual-strategy', 'production-plan'],
    ['production-plan', 'plan-output'],
  ].map(([source, target]) => ({ id: `${source}-${target}`, source: source!, target: target! })),
};
