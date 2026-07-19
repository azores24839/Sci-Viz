export interface WorkbenchQueueCounts {
  pendingQuality: number;
  pendingAnalysis: number;
  needsReview: number;
  lowConfidence: number;
  approved: number;
  analysisFailed: number;
  sourceMissing: number;
}

export interface WorkbenchQueuePanel {
  key: string;
  label: string;
  count: number;
  retryableCount?: number;
  description: string;
}

// Keep the response contract in one place so a successful analysis with
// missing provenance can never be folded into the model-failure counter again.
export function buildWorkbenchQueuePanels(counts: WorkbenchQueueCounts): WorkbenchQueuePanel[] {
  return [
    { key: 'pending_quality', label: '预审中', count: counts.pendingQuality, description: '新采集图片，尚未决定是否识别' },
    { key: 'pending_ocr', label: '等待图片分析', count: counts.pendingAnalysis, description: '已通过预审，等待生成摘要和三轴分类' },
    { key: 'needs_review', label: '待确认', count: counts.needsReview, description: 'AI 分析完成，等待人工确认' },
    { key: 'low_confidence', label: '需人工判断', count: counts.lowConfidence, description: 'AI 结果不确定，需要人看' },
    { key: 'approved', label: '已入库', count: counts.approved, description: '已通过审核，案例库可见' },
    { key: 'failed', label: '分析失败', count: counts.analysisFailed, retryableCount: counts.analysisFailed, description: '全库中图片分析未成功的项目，可重试或人工处理' },
    { key: 'source_missing', label: '缺少来源', count: counts.sourceMissing, description: '图片分析已完成，但缺少可追溯的来源网址' },
  ];
}
