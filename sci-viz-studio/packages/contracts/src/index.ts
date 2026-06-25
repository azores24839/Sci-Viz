import { z } from 'zod';

export const AgentRoleSchema = z.enum([
  'RESEARCH_ANALYST',
  'SCIENCE_REVIEWER',
  'VISUAL_PLANNER',
  'PHOTOGRAPHY_DIRECTOR',
]);

export const AgentTaskSchema = z.enum([
  'ANALYZE_PROJECT',
  'REVIEW_SCIENCE',
  'GENERATE_VISUAL_PLAN',
  'GENERATE_CAPTURE_LIST',
]);

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string(),
  projectType: z.enum(['PHOTO', 'VIDEO']),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
  mockMode: z.boolean(),
});

export const AgentProfileSchema = z.object({
  role: AgentRoleSchema,
  name: z.string(),
  avatar: z.string(),
  responsibility: z.string(),
  promptVersion: z.string(),
});

export const AgentMessageSchema = z.object({
  id: z.string(),
  author: z.enum(['AGENT', 'USER', 'SYSTEM']),
  body: z.string(),
  createdAt: z.string(),
});

export const AgentDraftArtifactSchema = z.object({
  nodeId: z.string(),
  label: z.string(),
  body: z.string(),
});

export const AgentDraftRequestSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  nodeId: z.string(),
  nodeLabel: z.string(),
  agentRole: AgentRoleSchema,
  task: AgentTaskSchema,
  inputLabel: z.string(),
  outputLabel: z.string(),
  planLabel: z.string(),
  revision: z.number().int().positive(),
  revisionInstruction: z.string().optional(),
  upstreamArtifacts: z.array(AgentDraftArtifactSchema),
});

export const AgentDraftResponseSchema = z.object({
  label: z.string(),
  body: z.string(),
  blockerCount: z.number().int().min(0),
  provider: z.enum(['mock', 'deepseek']),
});

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentDraftArtifact = z.infer<typeof AgentDraftArtifactSchema>;
export type AgentDraftRequest = z.infer<typeof AgentDraftRequestSchema>;
export type AgentDraftResponse = z.infer<typeof AgentDraftResponseSchema>;
