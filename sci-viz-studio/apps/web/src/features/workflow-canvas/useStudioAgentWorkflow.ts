import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AgentDraftRequest, AgentRole, AgentTask, SourceDocument } from '@studio/contracts';
import { completeNodeDraft, markNodeRunning, type WorkflowNodeDefinition, type WorkflowNodeState } from '@studio/workflow-core';
import { apiFetch } from '../../api/client';
import { useAgentJob } from '../agents/useAgentJob';
import { usableSelectedSources } from '../sources/sourceUtils';
import { syncClarificationBranchFromUnderstanding } from './clarificationBranch';

const nodeAgent: Record<string, AgentRole> = {
  'source-intake': 'SOURCE_ANALYST',
  'visual-diagnosis': 'SOURCE_ANALYST',
  'goal-output-selection': 'SOURCE_ANALYST',
  'case-benchmark': 'RESEARCH_CURATOR',
  'curation-strategy': 'RESEARCH_CURATOR',
  'photo-plan': 'PHOTO_PLANNER',
  'ai-reference': 'PHOTO_PLANNER',
  'plan-output': 'PHOTO_PLANNER',
};

const nodeTask: Record<string, AgentTask> = {
  'source-intake': 'DIAGNOSE_VISUAL_STATE',
  'visual-diagnosis': 'DIAGNOSE_VISUAL_STATE',
  'goal-output-selection': 'DIAGNOSE_VISUAL_STATE',
  'case-benchmark': 'BENCHMARK_CASES',
  'curation-strategy': 'GENERATE_CURATION_STRATEGY',
  'photo-plan': 'GENERATE_PHOTO_PLAN',
  'ai-reference': 'GENERATE_AI_REFERENCES',
  'plan-output': 'COMPILE_FINAL_PLAN',
};

export function agentRoleForNode(nodeId: string): AgentRole {
  return nodeAgent[nodeId] ?? 'SOURCE_ANALYST';
}

function collectUpstreamArtifacts(states: WorkflowNodeState[]) {
  return states
    .filter((state) => state.artifactBody)
    .map((state) => ({ nodeId: state.nodeId, label: state.artifactLabel ?? state.nodeId, body: state.artifactBody! }));
}

interface StudioAgentWorkflowOptions {
  projectId: string;
  projectName: string;
  workflowLoaded: boolean;
  currentNode: WorkflowNodeDefinition | undefined;
  currentState: WorkflowNodeState | undefined;
  states: WorkflowNodeState[];
  setStates: Dispatch<SetStateAction<WorkflowNodeState[]>>;
  sources: SourceDocument[];
}

export function useStudioAgentWorkflow({
  projectId,
  projectName,
  workflowLoaded,
  currentNode,
  currentState,
  states,
  setStates,
  sources,
}: StudioAgentWorkflowOptions) {
  const persistedJobIds = useRef(new Set<string>());
  const activeDraft = useMemo<AgentDraftRequest>(() => ({
    projectId,
    projectName,
    nodeId: currentNode?.id ?? 'idle',
    nodeLabel: currentNode?.label ?? '等待中',
    agentRole: agentRoleForNode(currentNode?.id ?? ''),
    task: nodeTask[currentNode?.id ?? ''] ?? 'DIAGNOSE_VISUAL_STATE',
    inputLabel: currentNode?.inputLabel ?? '资料',
    outputLabel: currentNode?.outputLabel ?? '结果',
    planLabel: currentState?.planLabel ?? 'Plan A',
    revision: currentState?.revision ?? 1,
    ...(currentState?.lastUserInstruction ? { revisionInstruction: currentState.lastUserInstruction } : {}),
    upstreamArtifacts: [
      ...collectUpstreamArtifacts(states).filter((item) => item.nodeId !== currentNode?.id),
      ...usableSelectedSources(sources).map((source) => ({
        nodeId: `source:${source.id}`,
        label: `资料：${source.title}`,
        body: [`[资料类型：${source.kind}]`, source.aiSummary, source.imageDescription, source.ocrText, source.extractedText, source.rawText]
          .filter(Boolean).join('\n\n').slice(0, 16_000),
      })),
    ],
  }), [projectId, projectName, currentNode, currentState, states, sources]);

  const automated = currentNode?.kind === 'AGENT' || currentNode?.kind === 'OUTPUT';
  const enabled = workflowLoaded && automated && (currentState?.status === 'RUNNING' || currentState?.status === 'FAILED');
  const activeJobKey = `${projectId}:${currentNode?.id ?? 'idle'}:v${currentState?.revision ?? 1}`;
  const activeAgentJob = useAgentJob({ draft: activeDraft, idempotencyKey: activeJobKey, enabled });

  useEffect(() => {
    if (!currentNode || currentState?.status !== 'READY') return;
    if (currentNode.kind !== 'AGENT' && currentNode.kind !== 'OUTPUT') {
      setStates((value) => value.map((state) => state.nodeId === currentNode.id
        ? {
            ...state,
            status: 'AWAITING_HUMAN',
            progress: 80,
            summary: state.summary || '等待人工确认',
            artifactLabel: state.artifactLabel ?? `${currentNode.outputLabel} v${state.revision}`,
          }
        : state));
      return;
    }
    setStates((value) => markNodeRunning(value, currentNode.id));
  }, [currentNode, currentState?.status, setStates]);

  useEffect(() => {
    if (currentNode && currentState?.status === 'FAILED' && (activeAgentJob.status === 'QUEUED' || activeAgentJob.status === 'RUNNING')) {
      setStates((value) => markNodeRunning(value, currentNode.id));
      return;
    }
    if (!currentNode || currentState?.status !== 'RUNNING') return;
    if (activeAgentJob.status === 'COMPLETED' && activeAgentJob.job?.result) {
      const result = activeAgentJob.job.result;
      setStates((value) => {
        const drafted = completeNodeDraft(value, currentNode.id, {
          label: result.label,
          body: result.body,
          blockerCount: result.blockerCount,
          evidence: result.evidence,
          ...(result.images ? { images: result.images } : {}),
        });
        return currentNode.id === 'visual-diagnosis' ? syncClarificationBranchFromUnderstanding(drafted) : drafted;
      });
      if (!persistedJobIds.current.has(activeAgentJob.job.id)) {
        persistedJobIds.current.add(activeAgentJob.job.id);
        void apiFetch(`/projects/${projectId}/artifacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: currentNode.id,
            label: result.label,
            body: result.body,
            blockerCount: result.blockerCount,
            createdBy: 'AGENT',
          }),
        });
      }
    }
    if (activeAgentJob.status === 'FAILED') {
      setStates((value) => value.map((state) => state.nodeId === currentNode.id
        ? {
            ...state,
            status: 'FAILED',
            progress: 0,
            summary: activeAgentJob.job?.error?.message ?? activeAgentJob.error ?? 'AI 任务失败，请查看原因后重试。',
            updatedAt: new Date().toISOString(),
          }
        : state));
    }
  }, [activeAgentJob.status, activeAgentJob.job, activeAgentJob.error, currentNode, currentState?.status, projectId, setStates]);

  return activeAgentJob;
}
