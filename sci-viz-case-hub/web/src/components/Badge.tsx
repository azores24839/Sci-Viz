import { statusStyle } from '../theme';
import type { ReviewStatus } from '../types';
import { REVIEW_STATUS_LABELS } from '../types';

export function StatusBadge({ status }: { status: ReviewStatus | string }) {
  const s = statusStyle(status);
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 8px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 500,
      background: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`,
      lineHeight: '14px',
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: s.text,
        flexShrink: 0,
      }} />
      {REVIEW_STATUS_LABELS[status as ReviewStatus] || status}
    </span>
  );
}

export function CaptureBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    image: '插件采集',
    screenshot: '截图',
    page_selection: '选中文字',
    crawler: '自动采集',
  };
  return (
    <span style={{
      display: 'inline-flex',
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 500,
      background: '#f0f0f2',
      color: '#6f6f7b',
      border: '1px solid #e0e0e4',
      lineHeight: '16px',
    }}>
      {labels[type] || type}
    </span>
  );
}
