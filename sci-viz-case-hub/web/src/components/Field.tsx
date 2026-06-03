import { theme } from '../theme';

export function Field({ label, value }: { label: string; value: string }) {
  const display = value && value !== '不确定' ? value : '-';
  return (
    <div>
      <div style={{
        fontSize: theme.typography.size.xs,
        color: theme.colors.text.tertiary,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: theme.typography.size.base,
        color: theme.colors.text.primary,
      }}>
        {display}
      </div>
    </div>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
      gap: '4px 16px',
    }}>
      {children}
    </div>
  );
}
