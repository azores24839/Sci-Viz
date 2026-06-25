import type { AgentMessage, AgentProfile, Project } from '@studio/contracts';
import type { WorkflowNodeState } from '@studio/workflow-core';

export const changxingProject: Project = {
  id: 'demo-changxing',
  name: '长兴海洋实验室',
  subtitle: '科研摄影 · 长兴岛',
  projectType: 'PHOTO',
  status: 'ACTIVE',
  mockMode: true,
};

export const agentProfiles: AgentProfile[] = [
  { role: 'PROJECT_PRODUCER', name: '项目制片人', avatar: '/agents/research-analyst.png', responsibility: '确认目标、受众、输出形式与项目边界', promptVersion: 'project-producer-v1' },
  { role: 'RESEARCH_CURATOR', name: '科研策展人', avatar: '/agents/science-reviewer.png', responsibility: '把科研资料转成准确、可传播、可拍摄的科学叙事', promptVersion: 'research-curator-v1' },
  { role: 'VISUAL_STRATEGIST', name: '影像策划师', avatar: '/agents/visual-planner.png', responsibility: '视觉概念、叙事结构、画面语言与风格策略', promptVersion: 'visual-strategist-v1' },
  { role: 'PRODUCTION_DIRECTOR', name: '拍摄导演', avatar: '/agents/photography-director.png', responsibility: '镜头清单、素材清单、现场执行与风险控制', promptVersion: 'production-director-v1' },
];

export const changxingNodeStates: WorkflowNodeState[] = [
  { nodeId: 'project-brief', status: 'AWAITING_HUMAN', blockerCount: 0, progress: 40, summary: '等待确认拍摄目的', artifactLabel: '项目简报', revision: 1 },
  { nodeId: 'research-curation', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待项目简报', artifactLabel: '科研叙事包', revision: 1 },
  { nodeId: 'visual-strategy', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待科研叙事', artifactLabel: '影像方案', revision: 1 },
  { nodeId: 'production-plan', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待影像方案', artifactLabel: '拍摄执行单', revision: 1 },
  { nodeId: 'plan-output', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待执行计划', artifactLabel: '完整方案', revision: 1 },
];

export const agentMessages: AgentMessage[] = [
  { id: 'message-1', author: 'SYSTEM', body: '已读取 4 类资料，并建立可追溯的事实清单。', createdAt: '2026-06-24T08:30:00.000Z' },
  { id: 'message-2', author: 'AGENT', body: '我将实验室的研究方向归纳为智能制造、智能装备、绿色动力与深海装备，并标记了适合拍摄的空间、设备和人物关系。', createdAt: '2026-06-24T08:31:00.000Z' },
  { id: 'message-3', author: 'AGENT', body: '其中“设备可运行状态”和“控制屏幕能否公开”缺少证据，需要科研人员确认后再进入影像方案。', createdAt: '2026-06-24T08:33:00.000Z' },
];
