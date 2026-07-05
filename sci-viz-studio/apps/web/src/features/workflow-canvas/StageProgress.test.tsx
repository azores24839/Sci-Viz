import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDirectorWorkflowStates, researchPhotoWorkflowV1 } from '@studio/workflow-core';
import { StageProgress } from './StageProgress';

describe('StageProgress', () => {
  it('shows the compact workflow steps from the approved header design', () => {
    const onSelect = vi.fn(); render(<StageProgress states={createDirectorWorkflowStates(researchPhotoWorkflowV1)} selectedNodeId="source-intake" onSelectNode={onSelect} />);
    expect(screen.getAllByRole('button')).toHaveLength(7); expect(screen.getByText('资料输入')).toBeTruthy(); expect(screen.getByText('参考图')).toBeTruthy();
    fireEvent.click(screen.getByText('拍摄方案')); expect(onSelect).toHaveBeenCalledWith('photo-plan');
  });
});
