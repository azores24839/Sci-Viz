import { z } from 'zod';

export const AgentRoleSchema = z.enum([
  'SOURCE_ANALYST',
  'SCIENCE_REVIEWER',
  'RESEARCH_CURATOR',
  'PHOTO_PLANNER',
]);

export const AgentTaskSchema = z.enum([
  'DIAGNOSE_VISUAL_STATE',
  'REVIEW_SCIENCE_RISKS',
  'BENCHMARK_CASES',
  'GENERATE_CURATION_STRATEGY',
  'GENERATE_CLIENT_PROPOSAL',
  'GENERATE_PHOTO_PLAN',
  'GENERATE_AI_REFERENCES',
  'PREPARE_EXECUTION_CHECKLIST',
  'COMPILE_FINAL_PLAN',
]);

export const ProjectGoalSchema = z.enum([
  'ACADEMIC_COMMUNICATION',
  'PUBLIC_COMMUNICATION',
  'RECRUITING_BRAND',
  'INDUSTRY_COLLABORATION',
]);

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string(),
  projectType: z.enum(['PHOTO', 'VIDEO']),
  outputType: z.enum(['PHOTO_STATIC', 'VIDEO_UNAVAILABLE']).default('PHOTO_STATIC'),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
  mockMode: z.boolean(),
  primaryGoal: ProjectGoalSchema.optional(),
  secondaryGoal: ProjectGoalSchema.optional(),
});

export const SourceKindSchema = z.enum(['PDF', 'DOCX', 'IMAGE', 'TEXT', 'WEB']);
export const SourceStatusSchema = z.enum([
  'UPLOADING',
  'QUEUED',
  'PARSING',
  'SUMMARIZING',
  'READY',
  'READY_WITHOUT_SUMMARY',
  'FAILED',
]);

export const SourceDocumentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: SourceKindSchema,
  status: SourceStatusSchema,
  selected: z.boolean(),
  title: z.string(),
  originalName: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  sourceUrl: z.string().url().optional(),
  canonicalUrl: z.string().url().optional(),
  fetchedAt: z.string().optional(),
  objectKey: z.string().optional(),
  previewUrl: z.string().optional(),
  contentHash: z.string().optional(),
  rawText: z.string().optional(),
  extractedText: z.string().optional(),
  ocrText: z.string().optional(),
  aiSummary: z.string().optional(),
  imageDescription: z.string().optional(),
  summaryProvider: z.string().optional(),
  summaryModel: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  truncated: z.boolean(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTextSourceRequestSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(100_000),
});

export const CreateWebSourceRequestSchema = z.object({
  projectId: z.string().min(1),
  url: z.string().url(),
});

export const CreateUploadRequestSchema = z.object({
  projectId: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});

export const CompleteUploadRequestSchema = z.object({
  projectId: z.string().min(1),
  sourceId: z.string().min(1),
});

export const UpdateSourceSelectionRequestSchema = z.object({ selected: z.boolean() });

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
export type ProjectGoal = z.infer<typeof ProjectGoalSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type CreateTextSourceRequest = z.infer<typeof CreateTextSourceRequestSchema>;
export type CreateWebSourceRequest = z.infer<typeof CreateWebSourceRequestSchema>;
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentDraftArtifact = z.infer<typeof AgentDraftArtifactSchema>;
export type AgentDraftRequest = z.infer<typeof AgentDraftRequestSchema>;
export type AgentDraftResponse = z.infer<typeof AgentDraftResponseSchema>;
