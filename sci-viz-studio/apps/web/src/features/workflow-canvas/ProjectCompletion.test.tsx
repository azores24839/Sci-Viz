import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDirectorWorkflowStates, researchPhotoWorkflowV1 } from '@studio/workflow-core';
import { ProjectCompletion } from './ProjectCompletion';

describe('ProjectCompletion', () => {
  it('appears only after the final plan is confirmed', () => {
    const onOpen = vi.fn(); const { rerender } = render(<ProjectCompletion states={createDirectorWorkflowStates(researchPhotoWorkflowV1)} onOpenPlan={onOpen} />); expect(screen.queryByText('摄影方案已经准备完成')).toBeNull();
    const completed = createDirectorWorkflowStates(researchPhotoWorkflowV1, researchPhotoWorkflowV1.nodes.map((node) => node.id)); rerender(<ProjectCompletion states={completed} onOpenPlan={onOpen} />);
    fireEvent.click(screen.getByText('查看摄影执行内容')); expect(onOpen).toHaveBeenCalledOnce();
  });
});
