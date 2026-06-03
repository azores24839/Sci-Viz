import { theme } from '../theme';
import { RATING_LABELS } from '../types';

export function StarRating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(r => (
        <button
          key={r}
          onClick={() => onChange(r)}
          style={{
            width: 28,
            height: 26,
            borderRadius: theme.radius.sm,
            border: `1px solid ${value >= r ? theme.colors.star : theme.colors.border}`,
            cursor: 'pointer',
            fontSize: 13,
            background: value >= r ? theme.colors.ratingBg : theme.colors.bgCard,
            color: value >= r ? theme.colors.star : theme.colors.starInactive,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.1s',
          }}
          title={RATING_LABELS[r]}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span style={{ fontSize: 11, color: theme.colors.text.secondary, marginLeft: 4, whiteSpace: 'nowrap' }}>
          {RATING_LABELS[value]}
        </span>
      )}
    </div>
  );
}
