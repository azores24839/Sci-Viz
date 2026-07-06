import { z } from 'zod';

export const AgentEvidenceSchema = z.object({
  statement: z.string().trim().min(1).max(2000),
  basis: z.enum(['SOURCE', 'PENDING_CONFIRMATION', 'USER_SUPPLIED']),
  sourceIds: z.array(z.string()).default([]),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});

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

export const StudioProjectSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  teamType: z.string().trim().max(120).default(''),
  researchDirection: z.string().trim().max(300).default(''),
  primaryAudience: z.string().trim().max(200).default(''),
  primaryGoal: ProjectGoalSchema.optional(),
  secondaryGoal: ProjectGoalSchema.optional(),
  projectType: z.literal('PHOTO').default('PHOTO'),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).default('DRAFT'),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().optional(),
});

export const CreateStudioProjectRequestSchema = StudioProjectSchema.pick({
  name: true,
  teamType: true,
  researchDirection: true,
  primaryAudience: true,
  primaryGoal: true,
  secondaryGoal: true,
}).partial().required({ name: true });

export const UpdateStudioProjectRequestSchema = CreateStudioProjectRequestSchema.partial().extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).optional(),
  expectedUpdatedAt: z.string().optional(),
});

export const InterpretProjectIntakeRequestSchema = z.object({
  input: z.string().trim().max(20_000),
  fileNames: z.array(z.string().trim().min(1).max(255)).max(20).default([]),
}).refine((value) => value.input.length > 0 || value.fileNames.length > 0, { message: '请输入项目信息或上传资料。' });

export const ProjectIntakeInterpretationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  brief: z.string().trim().max(20_000),
  userNeeds: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
  researchDirection: z.string().trim().max(300).default(''),
  possibleAudience: z.string().trim().max(200).default(''),
  primaryGoal: ProjectGoalSchema.optional(),
  secondaryGoal: ProjectGoalSchema.optional(),
  goalEvidence: z.string().trim().max(500).default(''),
  constraints: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
  urls: z.array(z.string().url()).max(10).default([]),
  searchQuery: z.string().trim().min(2).max(1000),
  uncertainties: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
  usedAi: z.boolean(),
});

export const PersistedWorkflowNodeStateSchema = z.object({
  nodeId: z.string().min(1),
  status: z.enum(['LOCKED', 'READY', 'QUEUED', 'RUNNING', 'AWAITING_HUMAN', 'COMPLETED', 'FAILED']),
  blockerCount: z.number().int().nonnegative(),
  progress: z.number().min(0).max(100),
  summary: z.string(),
  artifactLabel: z.string().optional(),
  artifactBody: z.string().optional(),
  images: z.array(z.object({ url: z.string(), prompt: z.string() })).optional(),
  evidence: z.array(AgentEvidenceSchema).optional(),
  revision: z.number().int().positive(),
  planLabel: z.string().optional(),
  lastUserInstruction: z.string().optional(),
  confirmedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const ProjectWorkflowSchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  states: z.array(PersistedWorkflowNodeStateSchema),
  primaryGoal: ProjectGoalSchema.optional(),
  secondaryGoal: ProjectGoalSchema.optional(),
  selectedBenchmarkIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SaveProjectWorkflowRequestSchema = ProjectWorkflowSchema.pick({
  states: true,
  primaryGoal: true,
  secondaryGoal: true,
  selectedBenchmarkIds: true,
}).partial({ selectedBenchmarkIds: true }).extend({ expectedRevision: z.number().int().nonnegative() });

export const BenchmarkMatchLevelSchema = z.enum(['EXACT', 'RELATED', 'CROSS_DOMAIN']);
export const BenchmarkRecommendationSchema = z.object({
  id: z.string(), title: z.string(), thumbnailUrl: z.string(), sourceUrl: z.string(), sourceDomain: z.string(),
  discipline: z.string(), functionalPurpose: z.string(), distributionMedium: z.string(), technicalMethod: z.string(), contentType: z.string(),
  matchScore: z.number(), matchLevel: BenchmarkMatchLevelSchema, recommendationReason: z.string(), borrowablePoints: z.string(),
});
export const BenchmarkRecommendationRequestSchema = z.object({
  discipline: z.string().max(120).optional(), teamType: z.string().max(120).optional(),
  goals: z.array(ProjectGoalSchema).max(2).default([]), technicalMethods: z.array(z.string().max(60)).max(8).default([]),
  limit: z.number().int().min(3).max(12).default(6),
});
export const BenchmarkRecommendationResultSchema = z.object({
  items: z.array(BenchmarkRecommendationSchema), fallbackMessage: z.string(),
  appliedFilters: z.object({ discipline: z.string(), teamType: z.string(), goals: z.array(z.string()), technicalMethods: z.array(z.string()), medium: z.literal('静图') }),
});
export const SaveBenchmarkSelectionRequestSchema = z.object({
  selectedIds: z.array(z.string()).min(0).max(12), expectedRevision: z.number().int().nonnegative(),
});

export const ArtifactVersionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  nodeId: z.string().min(1),
  version: z.number().int().positive(),
  label: z.string(),
  body: z.string(),
  blockerCount: z.number().int().nonnegative(),
  createdBy: z.enum(['USER', 'AGENT', 'SYSTEM']),
  createdAt: z.string(),
});

export const PlanRiskSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(['FACT', 'CONFIDENTIALITY', 'SAFETY', 'SHOOTABILITY']),
  severity: z.enum(['BLOCKER', 'WARNING', 'INFO']),
  description: z.string().trim().min(1).max(1000),
  resolved: z.boolean().default(false),
  resolution: z.string().trim().max(1000).default(''),
  sourceIds: z.array(z.string()).default([]),
});

export const PlanContentSchema = z.object({
  executiveSummary: z.string().default(''),
  goals: z.string().default(''),
  visualDiagnosis: z.string().default(''),
  benchmarkSummary: z.string().default(''),
  curationStrategy: z.string().default(''),
  shootingApproach: z.string().default(''),
  risks: z.array(PlanRiskSchema).default([]),
  sourceIds: z.array(z.string()).default([]),
});

export const PlanDocumentSchema = z.object({
  projectId: z.string().uuid(), title: z.string().trim().min(1).max(200),
  currentVersion: z.number().int().positive(), content: PlanContentSchema,
  createdAt: z.string(), updatedAt: z.string(),
});

export const PlanVersionSchema = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), version: z.number().int().positive(),
  content: PlanContentSchema, createdBy: z.enum(['USER', 'AGENT', 'SYSTEM']),
  changeSummary: z.string().max(500).default(''), createdAt: z.string(),
});

export const SavePlanRequestSchema = z.object({
  title: z.string().trim().min(1).max(200), content: PlanContentSchema,
  expectedVersion: z.number().int().nonnegative(), createdBy: z.enum(['USER', 'AGENT']).default('USER'),
  changeSummary: z.string().max(500).default(''),
});

export const RestorePlanVersionRequestSchema = z.object({ expectedVersion: z.number().int().positive() });

export const ShotCardSchema = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(1000), subject: z.string().trim().min(1).max(1000), scene: z.string().trim().min(1).max(500),
  peopleEquipmentMaterials: z.array(z.string().trim().min(1).max(200)).default([]),
  shotSize: z.string().trim().min(1).max(120), cameraAngle: z.string().trim().min(1).max(200), composition: z.string().trim().min(1).max(500),
  lighting: z.string().trim().min(1).max(500), colorTone: z.string().trim().max(300).default(''), action: z.string().trim().min(1).max(500),
  scienceInfo: z.string().trim().max(1000).default(''), priority: z.enum(['MUST', 'SHOULD', 'OPTIONAL']),
  risks: z.array(PlanRiskSchema).default([]), referenceCaseIds: z.array(z.string()).default([]), referenceImageUrls: z.array(z.string()).default([]),
  sortOrder: z.number().int().nonnegative(), revision: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string(),
});

export const CreateShotCardRequestSchema = ShotCardSchema.omit({ id: true, projectId: true, revision: true, createdAt: true, updatedAt: true });
export const UpdateShotCardRequestSchema = CreateShotCardRequestSchema.partial().extend({ expectedRevision: z.number().int().positive() });
export const ReorderShotCardsRequestSchema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });
export const PlanReadinessSchema = z.object({
  executable: z.boolean(), mustShotCount: z.number().int().nonnegative(), unresolvedBlockerCount: z.number().int().nonnegative(), reasons: z.array(z.string()),
});

export const ReviewLinkSchema = z.object({
  id: z.string().uuid(), projectId: z.string().uuid(), label: z.string().max(120).default(''),
  expiresAt: z.string(), revokedAt: z.string().optional(), createdAt: z.string(), lastAccessedAt: z.string().optional(),
});
export const CreateReviewLinkRequestSchema = z.object({
  label: z.string().trim().max(120).default(''), expiresInHours: z.number().int().min(1).max(720).default(72),
});
export const ReviewRiskSchema = PlanRiskSchema.omit({ sourceIds: true });
export const ReviewShotCardSchema = ShotCardSchema.pick({
  id: true, title: true, purpose: true, subject: true, scene: true, peopleEquipmentMaterials: true,
  shotSize: true, cameraAngle: true, composition: true, lighting: true, colorTone: true, action: true,
  scienceInfo: true, priority: true, risks: true, sortOrder: true,
}).extend({ risks: z.array(ReviewRiskSchema) });
export const PublicReviewSnapshotSchema = z.object({
  reviewLinkId: z.string().uuid(), project: z.object({ name: z.string(), teamType: z.string(), researchDirection: z.string(), primaryAudience: z.string() }),
  plan: z.object({ title: z.string(), version: z.number().int().nonnegative(), executiveSummary: z.string(), goals: z.string(), visualDiagnosis: z.string(), benchmarkSummary: z.string(), curationStrategy: z.string(), shootingApproach: z.string() }),
  risks: z.array(ReviewRiskSchema), shotCards: z.array(ReviewShotCardSchema),
  readiness: PlanReadinessSchema, expiresAt: z.string(), submitted: z.boolean(),
});
export const ReviewDecisionSchema = z.enum(['CONFIRMED', 'CHANGE_REQUESTED', 'COMMENT']);
export const ReviewResponseItemSchema = z.object({
  targetType: z.enum(['PLAN', 'RISK', 'SHOT_CARD']), targetId: z.string().max(200), decision: ReviewDecisionSchema,
  suggestion: z.string().trim().max(2000).default(''), comment: z.string().trim().max(2000).default(''),
});
export const SubmitReviewResponseRequestSchema = z.object({
  reviewerName: z.string().trim().min(1).max(120), reviewerEmail: z.string().trim().email().max(320).optional(),
  overallDecision: z.enum(['CONFIRMED', 'CHANGES_REQUESTED']), items: z.array(ReviewResponseItemSchema).max(200).default([]),
  generalComment: z.string().trim().max(5000).default(''),
});
export const ReviewResponseSchema = SubmitReviewResponseRequestSchema.extend({
  id: z.string().uuid(), reviewLinkId: z.string().uuid(), projectId: z.string().uuid(),
  status: z.enum(['PENDING', 'ADOPTED', 'IGNORED', 'PROCESSED']), submittedAt: z.string(),
});
export const UpdateReviewResponseStatusRequestSchema = z.object({ status: z.enum(['ADOPTED', 'IGNORED', 'PROCESSED']) });

export const CaptureItemSchema = z.object({
  shotCardId: z.string().uuid(), projectId: z.string().uuid(), status: z.enum(['TODO', 'CAPTURED', 'RESHOOT']),
  fileNumber: z.string().trim().max(200).default(''), note: z.string().trim().max(2000).default(''),
  revision: z.number().int().positive(), updatedAt: z.string(),
});
export const UpdateCaptureItemRequestSchema = CaptureItemSchema.pick({ status: true, fileNumber: true, note: true }).partial().extend({ expectedRevision: z.number().int().positive() });

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
  ownerUserId: z.string().optional(),
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

export const ResearchModeSchema = z.enum(['FAST', 'DEEP']);
export const ResearchTaskStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']);

export const ResearchCandidateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  url: z.string().url(),
  domain: z.string().trim().min(1).max(255),
  snippet: z.string().max(6000),
  score: z.number().min(0).max(1),
  sourceType: z.enum(['OFFICIAL', 'PAPER', 'NEWS', 'INSTITUTION', 'OTHER']),
  publishedAt: z.string().optional(),
});

export const ResearchReportSchema = z.object({
  summary: z.string().max(20_000),
  keyFindings: z.array(z.string().max(2000)).max(20),
  conflicts: z.array(z.string().max(2000)).max(20),
  openQuestions: z.array(z.string().max(2000)).max(20),
  limitations: z.array(z.string().max(2000)).max(20),
});

export const ResearchTaskSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerUserId: z.string().min(1),
  mode: ResearchModeSchema,
  query: z.string().trim().min(2).max(1000),
  effectiveQuery: z.string().trim().min(2).max(1000).optional(),
  status: ResearchTaskStatusSchema,
  candidates: z.array(ResearchCandidateSchema).max(20).default([]),
  report: ResearchReportSchema.optional(),
  provider: z.literal('tavily').optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

export const CreateResearchTaskRequestSchema = z.object({
  projectId: z.string().uuid(),
  mode: ResearchModeSchema,
  query: z.string().trim().min(2).max(1000),
});

export const AdoptResearchCandidatesRequestSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1).max(20),
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

export const AgentStructuredOutputSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('SOURCE_ANALYST'), observations: z.array(AgentEvidenceSchema), gaps: z.array(z.string()) }),
  z.object({ role: z.literal('SCIENCE_REVIEWER'), reviewItems: z.array(AgentEvidenceSchema), unresolvedBlockers: z.number().int().nonnegative() }),
  z.object({ role: z.literal('RESEARCH_CURATOR'), recommendations: z.array(AgentEvidenceSchema), selectionRationale: z.array(z.string()) }),
  z.object({ role: z.literal('PHOTO_PLANNER'), directions: z.array(AgentEvidenceSchema), executionNotes: z.array(z.string()) }),
]);

export const AgentDraftResponseSchema = z.object({
  label: z.string(),
  body: z.string(),
  blockerCount: z.number().int().min(0),
  provider: z.enum(['mock', 'deepseek']),
  evidence: z.array(AgentEvidenceSchema),
  structured: AgentStructuredOutputSchema,
  images: z.array(z.object({ url: z.string(), prompt: z.string() })).optional(),
});

export const AgentJobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const AgentJobSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().min(1),
  projectId: z.string(),
  idempotencyKey: z.string().min(8).max(200),
  status: AgentJobStatusSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  availableAt: z.string(),
  request: AgentDraftRequestSchema,
  result: AgentDraftResponseSchema.optional(),
  error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const CreateAgentJobRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(200),
  draft: AgentDraftRequestSchema,
});

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type ProjectGoal = z.infer<typeof ProjectGoalSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type StudioProject = z.infer<typeof StudioProjectSchema>;
export type CreateStudioProjectRequest = z.infer<typeof CreateStudioProjectRequestSchema>;
export type InterpretProjectIntakeRequest = z.infer<typeof InterpretProjectIntakeRequestSchema>;
export type ProjectIntakeInterpretation = z.infer<typeof ProjectIntakeInterpretationSchema>;
export type UpdateStudioProjectRequest = z.infer<typeof UpdateStudioProjectRequestSchema>;
export type PersistedWorkflowNodeState = z.infer<typeof PersistedWorkflowNodeStateSchema>;
export type ProjectWorkflow = z.infer<typeof ProjectWorkflowSchema>;
export type SaveProjectWorkflowRequest = z.infer<typeof SaveProjectWorkflowRequestSchema>;
export type ArtifactVersion = z.infer<typeof ArtifactVersionSchema>;
export type PlanRisk = z.infer<typeof PlanRiskSchema>;
export type PlanContent = z.infer<typeof PlanContentSchema>;
export type PlanDocument = z.infer<typeof PlanDocumentSchema>;
export type PlanVersion = z.infer<typeof PlanVersionSchema>;
export type ShotCard = z.infer<typeof ShotCardSchema>;
export type ReviewLink = z.infer<typeof ReviewLinkSchema>;
export type PublicReviewSnapshot = z.infer<typeof PublicReviewSnapshotSchema>;
export type ReviewResponse = z.infer<typeof ReviewResponseSchema>;
export type CaptureItem = z.infer<typeof CaptureItemSchema>;
export type PlanReadiness = z.infer<typeof PlanReadinessSchema>;
export type BenchmarkMatchLevel = z.infer<typeof BenchmarkMatchLevelSchema>;
export type BenchmarkRecommendation = z.infer<typeof BenchmarkRecommendationSchema>;
export type BenchmarkRecommendationRequest = z.infer<typeof BenchmarkRecommendationRequestSchema>;
export type BenchmarkRecommendationResult = z.infer<typeof BenchmarkRecommendationResultSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type ResearchMode = z.infer<typeof ResearchModeSchema>;
export type ResearchCandidate = z.infer<typeof ResearchCandidateSchema>;
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;
export type CreateTextSourceRequest = z.infer<typeof CreateTextSourceRequestSchema>;
export type CreateWebSourceRequest = z.infer<typeof CreateWebSourceRequestSchema>;
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentDraftArtifact = z.infer<typeof AgentDraftArtifactSchema>;
export type AgentDraftRequest = z.infer<typeof AgentDraftRequestSchema>;
export type AgentDraftResponse = z.infer<typeof AgentDraftResponseSchema>;
export type AgentEvidence = z.infer<typeof AgentEvidenceSchema>;
export type AgentStructuredOutput = z.infer<typeof AgentStructuredOutputSchema>;
export type AgentJobStatus = z.infer<typeof AgentJobStatusSchema>;
export type AgentJob = z.infer<typeof AgentJobSchema>;
export type CreateAgentJobRequest = z.infer<typeof CreateAgentJobRequestSchema>;
