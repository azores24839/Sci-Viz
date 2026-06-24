import { useMemo, useState } from 'react';
import { agentMessages, agentProfiles, changxingNodeStates, changxingProject } from '@studio/fixtures';
import { researchPhotoWorkflowV1 } from '@studio/workflow-core';
import type { AgentRole } from '@studio/contracts';
import { WorkflowCanvas } from '../features/workflow-canvas/WorkflowCanvas';
import { WorkflowFallbackList } from '../features/workflow-canvas/WorkflowFallbackList';
import { AgentContextPanel } from '../features/workflow-canvas/AgentContextPanel';

const nodeAgent: Record<string, AgentRole> = {
  'source-intake': 'RESEARCH_ANALYST',
  'research-analysis': 'RESEARCH_ANALYST',
  'science-review': 'SCIENCE_REVIEWER',
  'fact-confirmation': 'SCIENCE_REVIEWER',
  'visual-plan': 'VISUAL_PLANNER',
  'capture-preparation': 'PHOTOGRAPHY_DIRECTOR',
  'plan-output': 'PHOTOGRAPHY_DIRECTOR',
};

export function Studio() {
  const [selectedNodeId, setSelectedNodeId] = useState('research-analysis');
  const selectedNode = researchPhotoWorkflowV1.nodes.find((node) => node.id === selectedNodeId) ?? researchPhotoWorkflowV1.nodes[0]!;
  const selectedState = changxingNodeStates.find((state) => state.nodeId === selectedNode.id) ?? changxingNodeStates[0]!;
  const agent = useMemo(() => {
    const role = nodeAgent[selectedNode.id] ?? 'RESEARCH_ANALYST';
    return agentProfiles.find((profile) => profile.role === role) ?? agentProfiles[0]!;
  }, [selectedNode.id]);

  return <div className="studio-shell">
    <header className="studio-header">
      <button type="button" className="menu-button" aria-label="打开项目菜单">☷</button>
      <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><span>科研影像 AI Studio</span></div>
      <span className="header-divider" />
      <span className="project-name">{changxingProject.name}</span>
      <span className="mock-badge">Mock AI</span>
      <span className="header-spacer" />
      <button type="button" className="icon-button" aria-label="通知">♧</button>
      <span className="avatar-chip" aria-label="当前用户 ZH">ZH</span>
    </header>
    <main className="studio-body">
      <section className="canvas-panel" aria-label="项目工作流">
        <WorkflowCanvas template={researchPhotoWorkflowV1} states={changxingNodeStates} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
        <WorkflowFallbackList template={researchPhotoWorkflowV1} states={changxingNodeStates} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
      </section>
      <AgentContextPanel agent={agent} node={selectedNode} state={selectedState} messages={agentMessages} />
    </main>
  </div>;
}
