import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || '登录失败');
      } else {
        onLogin();
        navigate('/');
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
          管理员可登录编辑，访客可直接只读浏览
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="case-hub-username" style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: theme.colors.text.secondary,
              marginBottom: 6,
            }}>
              用户名
            </label>
            <input
              id="case-hub-username"
              type="text"
              autoComplete="username"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'case-hub-login-error' : undefined}
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
            <label htmlFor="case-hub-password" style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: theme.colors.text.secondary,
              marginBottom: 6,
            }}>
              密码
            </label>
            <input
              id="case-hub-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'case-hub-login-error' : undefined}
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
            <div id="case-hub-login-error" role="alert" style={{
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

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '22px 0',
          color: theme.colors.text.tertiary,
          fontSize: 12,
        }}>
          <span style={{ flex: 1, height: 1, background: theme.colors.border }} />
          <span>或</span>
          <span style={{ flex: 1, height: 1, background: theme.colors.border }} />
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            width: '100%',
            padding: '10px 0',
            fontSize: 14,
            fontWeight: 600,
            color: theme.colors.text.primary,
            background: theme.colors.bg,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          以 Guest 身份浏览
        </button>
      </div>
    </div>
  );
}
