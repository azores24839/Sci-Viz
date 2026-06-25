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
  { role: 'RESEARCH_ANALYST', name: '科研分析师', avatar: '/agents/research-analyst.png', responsibility: '资料归纳、通俗解释、事实与视觉机会', promptVersion: 'research-analyst-v1' },
  { role: 'SCIENCE_REVIEWER', name: '科学审校员', avatar: '/agents/science-reviewer.png', responsibility: '证据检查、矛盾识别与风险提示', promptVersion: 'science-reviewer-v1' },
  { role: 'VISUAL_PLANNER', name: '影像策划师', avatar: '/agents/visual-planner.png', responsibility: '视觉概念、叙事结构与摄影方案', promptVersion: 'visual-planner-v1' },
  { role: 'PHOTOGRAPHY_DIRECTOR', name: '摄影指导', avatar: '/agents/photography-director.png', responsibility: '画面卡、构图、光线与现场清单', promptVersion: 'photography-director-v1' },
];

export const changxingNodeStates: WorkflowNodeState[] = [
  { nodeId: 'source-intake', status: 'COMPLETED', blockerCount: 0, progress: 100, summary: '4 类资料已整理', artifactLabel: '资料集', revision: 1 },
  { nodeId: 'research-analysis', status: 'COMPLETED', blockerCount: 0, progress: 100, summary: '完成资料归纳与视觉机会识别', artifactLabel: '科研理解包 v3', revision: 1 },
  { nodeId: 'science-review', status: 'AWAITING_HUMAN', blockerCount: 2, progress: 72, summary: '发现 2 项需科研人员确认', artifactLabel: '审校结果', revision: 1 },
  { nodeId: 'fact-confirmation', status: 'READY', blockerCount: 2, progress: 25, summary: '审核链接待发送', artifactLabel: '审核记录', revision: 1 },
  { nodeId: 'visual-plan', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待事实确认', artifactLabel: '拍摄方案', revision: 1 },
  { nodeId: 'capture-preparation', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待方案确认', artifactLabel: '拍摄清单', revision: 1 },
  { nodeId: 'plan-output', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待现场清单', artifactLabel: '摄影策划方案', revision: 1 },
];

export const agentMessages: AgentMessage[] = [
  { id: 'message-1', author: 'SYSTEM', body: '已读取 4 类资料，并建立可追溯的事实清单。', createdAt: '2026-06-24T08:30:00.000Z' },
  { id: 'message-2', author: 'AGENT', body: '我将实验室的研究方向归纳为智能制造、智能装备、绿色动力与深海装备，并标记了适合拍摄的空间、设备和人物关系。', createdAt: '2026-06-24T08:31:00.000Z' },
  { id: 'message-3', author: 'AGENT', body: '其中“设备可运行状态”和“控制屏幕能否公开”缺少证据，需要科研人员确认后再进入影像方案。', createdAt: '2026-06-24T08:33:00.000Z' },
];
