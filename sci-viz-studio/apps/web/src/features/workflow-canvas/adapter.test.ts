import { describe, expect, it } from 'vitest';
import { researchPhotoWorkflowV1 } from '@studio/workflow-core';
import { changxingNodeStates } from '@studio/fixtures';
import { toFlowElements } from './adapter';

describe('workflow canvas adapter', () => {
  it('maps the domain template without mutating semantic ids', () => {
    const result = toFlowElements(researchPhotoWorkflowV1, changxingNodeStates);
    expect(result.nodes).toHaveLength(7);
    expect(result.edges).toHaveLength(6);
    expect(result.nodes.map((node) => node.id)).toEqual(researchPhotoWorkflowV1.nodes.map((node) => node.id));
  });

  it('keeps view-only React Flow state out of domain node data', () => {
    const [node] = toFlowElements(researchPhotoWorkflowV1, changxingNodeStates).nodes;
    expect(node?.data.state).toMatchObject({ nodeId: 'source-intake', status: 'COMPLETED' });
    expect(node?.data).not.toHaveProperty('selected');
    expect(node?.data).not.toHaveProperty('dragging');
  });
});
