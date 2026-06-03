import { theme } from '../theme';

export function Card({ children, style, padding, hover }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padding?: number | string;
  hover?: boolean;
}) {
  return (
    <div style={{
      background: theme.colors.bgCard,
      borderRadius: theme.radius.lg,
      border: `1px solid ${theme.colors.border}`,
      boxShadow: theme.shadow.card,
      padding: padding ?? 20,
      ...(hover ? {
        transition: 'box-shadow 0.15s, border-color 0.15s',
        cursor: 'default',
      } : {}),
      ...style,
    }}
      onMouseEnter={hover ? (e) => { e.currentTarget.style.boxShadow = theme.shadow.elevated; e.currentTarget.style.borderColor = theme.colors.borderFocus; } : undefined}
      onMouseLeave={hover ? (e) => { e.currentTarget.style.boxShadow = theme.shadow.card; e.currentTarget.style.borderColor = theme.colors.border; } : undefined}
    >
      {children}
    </div>
  );
}

export function CardImage({ src, alt, height, onError }: {
  src?: string;
  alt?: string;
  height?: number | string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  if (!src) {
    return (
      <div style={{
        height: height || 180,
        background: theme.colors.bgSubtle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: theme.colors.text.tertiary,
      }}>
        无图片
      </div>
    );
  }
  return (
    <div style={{
      height: height || 180,
      overflow: 'hidden',
      background: theme.colors.bgSubtle,
      position: 'relative',
    }}>
      <img
        src={src}
        alt={alt || ''}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        onError={onError}
      />
    </div>
  );
}
