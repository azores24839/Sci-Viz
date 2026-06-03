export function Tag({ children, color }: { children: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      background: color ? `${color}14` : '#f0f0f2',
      color: color || '#6f6f7b',
      border: `1px solid ${color ? `${color}30` : '#e0e0e4'}`,
      lineHeight: '18px',
    }}>
      {children}
    </span>
  );
}

const RATING_TEXT: Record<number, string> = {
  1: '无参考价值',
  2: '普通参考',
  3: '可保留',
  4: '值得拆解',
  5: '标杆案例',
};

export function RatingDisplay({ rating }: { rating: number }) {
  if (rating <= 0) return <span style={{ fontSize: 12, color: '#A0A4B4' }}>未评分</span>;
  return (
    <span style={{ fontSize: 12, color: '#A0A4B4' }}>
      <span style={{ color: '#e8a040', fontWeight: 500 }}>{rating}/5</span>
      <span style={{ margin: '0 4px', color: '#c4c4ce' }}>·</span>
      {RATING_TEXT[rating] || ''}
    </span>
  );
}
