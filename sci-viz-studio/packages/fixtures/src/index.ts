import type { AgentMessage, AgentProfile, Project } from '@studio/contracts';
import type { WorkflowNodeState } from '@studio/workflow-core';

export const changxingProject: Project = {
  id: 'demo-changxing',
  name: '长兴海洋实验室',
  subtitle: '拍摄静图 · 长兴岛',
  projectType: 'PHOTO',
  outputType: 'PHOTO_STATIC',
  status: 'ACTIVE',
  mockMode: true,
  primaryGoal: 'INDUSTRY_COLLABORATION',
  secondaryGoal: 'PUBLIC_COMMUNICATION',
};

export const agentProfiles: AgentProfile[] = [
  { role: 'SOURCE_ANALYST', name: '资料分析师', avatar: '/agents/research-analyst.png', responsibility: '读取资料和已有照片，判断视觉现状、短板和可拍机会', promptVersion: 'source-analyst-v1' },
  { role: 'SCIENCE_REVIEWER', name: '科研审校员', avatar: '/agents/science-reviewer.png', responsibility: '贯穿检查科学事实、保密边界、安全要求和可拍条件', promptVersion: 'science-reviewer-v1' },
  { role: 'RESEARCH_CURATOR', name: '科研策展人', avatar: '/agents/visual-planner.png', responsibility: '结合目标与案例库，提出对标案例、视觉路线和策展 brief', promptVersion: 'research-curator-v2' },
  { role: 'PHOTO_PLANNER', name: '摄影策划师', avatar: '/agents/photography-director.png', responsibility: '把策展 brief 转化为静图拍摄方案、画面卡和执行清单', promptVersion: 'photo-planner-v1' },
];

export const changxingNodeStates: WorkflowNodeState[] = [
  { nodeId: 'source-intake', status: 'AWAITING_HUMAN', blockerCount: 0, progress: 50, summary: '等待确认资料包', artifactLabel: '资料包', revision: 1 },
  { nodeId: 'visual-diagnosis', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待资料包', artifactLabel: '视觉现状诊断', revision: 1 },
  { nodeId: 'goal-output-selection', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待视觉诊断', artifactLabel: '目标配置', revision: 1 },
  { nodeId: 'case-benchmark', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待目标配置', artifactLabel: '对标案例', revision: 1 },
  { nodeId: 'curation-strategy', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待案例对标', artifactLabel: '策展 brief', revision: 1 },
  { nodeId: 'photo-plan', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待策展策略', artifactLabel: '静图拍摄方案', revision: 1 },
  { nodeId: 'ai-reference', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待静图方案', artifactLabel: 'AI 参考图组', revision: 1 },
  { nodeId: 'plan-output', status: 'LOCKED', blockerCount: 0, progress: 0, summary: '等待参考图和画面卡', artifactLabel: '完整方案', revision: 1 },
];

export const agentMessages: AgentMessage[] = [
  { id: 'message-1', author: 'SYSTEM', body: '已读取示例资料、官网线索和已有照片缩略图，当前项目限定为拍摄静图。', createdAt: '2026-06-24T08:30:00.000Z' },
  { id: 'message-2', author: 'AGENT', body: '资料分析师会先判断现有影像是否偏会议记录、是否缺少设备尺度、实验过程和应用场景。', createdAt: '2026-06-24T08:31:00.000Z' },
  { id: 'message-3', author: 'AGENT', body: '科研审校员将持续标记设备运行状态、屏幕数据、合作单位署名和安全边界等待确认事项。', createdAt: '2026-06-24T08:33:00.000Z' },
];
