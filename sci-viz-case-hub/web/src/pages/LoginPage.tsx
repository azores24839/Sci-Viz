import { useState, FormEvent } from 'react';
import { theme } from '../theme';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || '登录失败');
      } else {
        onLogin();
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.colors.bg,
    }}>
      <div style={{
        background: theme.colors.bgCard,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8,
        padding: 40,
        width: 360,
      }}>
        <h1 style={{
          fontSize: 18,
          fontWeight: 700,
          color: theme.colors.text.primary,
          margin: '0 0 4px',
          textAlign: 'center',
        }}>
          Sci-Viz Case Hub
        </h1>
        <p style={{
          fontSize: 13,
          color: theme.colors.text.secondary,
          margin: '0 0 28px',
          textAlign: 'center',
        }}>
          请登录以继续
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: theme.colors.text.secondary,
              marginBottom: 6,
            }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 6,
                color: theme.colors.text.primary,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: theme.colors.text.secondary,
              marginBottom: 6,
            }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                background: theme.colors.bg,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: 6,
                color: theme.colors.text.primary,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 13,
              color: '#e74c3c',
              marginBottom: 16,
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: '100%',
              padding: '10px 0',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: theme.colors.text.primary,
              border: 'none',
              borderRadius: 6,
              cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
              opacity: loading || !username || !password ? 0.5 : 1,
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
