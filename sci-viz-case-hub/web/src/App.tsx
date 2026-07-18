import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import CaseList from './pages/CaseList';
import CaseDetail from './pages/CaseDetail';
import ReviewPage from './pages/ReviewPage';
import PoolPage from './pages/PoolPage';
import InsightsPage from './pages/InsightsPage';
import ComparisonPage from './pages/ComparisonPage';
import AnalysisReportPage from './pages/AnalysisReportPage';
import LoginPage from './pages/LoginPage';
import { api, setOnUnauthorized } from './api';
import { theme } from './theme';

const navItems = [
  { path: '/', label: '案例库', adminOnly: false },
  { path: '/review', label: '处理工作台', adminOnly: true },
  { path: '/pool', label: '采集来源', adminOnly: true },
  { path: '/insights', label: '案例库现状与对比', adminOnly: false },
  { path: '/comparison', label: '跨源对比', adminOnly: false },
  { path: '/report', label: '分析报告', adminOnly: false },
];

function App() {
  const location = useLocation();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');

  const checkAuth = useCallback(async () => {
    const res = await api.checkAuth();
    if (res.success && res.data) {
      setAuthenticated(true);
      setUsername(res.data.username);
    } else {
      setAuthenticated(false);
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    checkAuth();
    setOnUnauthorized(() => {
      setAuthenticated(false);
      setAuthChecked(true);
    });
  }, [checkAuth]);

  async function handleLogout() {
    await api.logout();
    setAuthenticated(false);
  }

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', background: theme.colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: theme.colors.text.secondary, fontSize: 14 }}>加载中...</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.colors.bg }}>
      <style>{`
        .app-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 ${theme.spacing['2xl']}px;
          height: 52px;
          display: flex;
          align-items: center;
          gap: 32px;
          box-sizing: border-box;
        }
        .app-nav {
          display: flex;
          gap: 4px;
          height: 100%;
          align-items: stretch;
          flex: 1;
          min-width: 0;
        }
        .app-account { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
        .app-main {
          max-width: 1680px;
          width: calc(100% - 80px);
          margin: 0 auto;
          padding: 8px 40px 0;
          box-sizing: content-box;
        }
        @media (max-width: 767px) {
          .app-header-inner {
            height: auto;
            min-height: 52px;
            padding: 0 16px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 0 12px;
          }
          .app-nav {
            grid-column: 1 / -1;
            grid-row: 2;
            width: 100%;
            height: 42px;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .app-nav::-webkit-scrollbar { display: none; }
          .app-nav a { flex: 0 0 auto; white-space: nowrap; }
          .app-account { justify-self: end; }
          .app-account > span { display: none; }
          .app-main {
            width: calc(100% - 32px);
            padding: 8px 16px 0;
          }
        }
      `}</style>
      <header style={{
        background: theme.colors.bgCard,
        borderBottom: `1px solid ${theme.colors.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div className="app-header-inner">
          <span style={{
            fontWeight: 700,
            fontSize: 15,
            color: theme.colors.text.primary,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}>
            Sci-Viz Case Hub
          </span>
          <nav className="app-nav">
            {navItems.filter(item => authenticated || !item.adminOnly).map(item => {
              const isActive = item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: isActive ? theme.colors.text.primary : theme.colors.text.secondary,
                    borderBottom: isActive ? `2px solid ${theme.colors.text.primary}` : '2px solid transparent',
                    transition: 'color 0.1s, border-color 0.1s',
                    textDecoration: 'none',
                  }}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
          <div className="app-account">
            <span style={{ fontSize: 13, color: theme.colors.text.secondary }}>
              {authenticated ? username : 'Guest'}
            </span>
            {authenticated ? (
              <button
                onClick={handleLogout}
                style={{
                  fontSize: 12,
                  color: theme.colors.text.secondary,
                  background: 'none',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4,
                  padding: '3px 10px',
                  cursor: 'pointer',
                }}
              >
                登出
              </button>
            ) : (
              <NavLink
                to="/login"
                style={{
                  fontSize: 12,
                  color: theme.colors.text.secondary,
                  background: 'none',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4,
                  padding: '3px 10px',
                  textDecoration: 'none',
                }}
              >
                管理员登录
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<CaseList isAdmin={authenticated} />} />
          <Route path="/cases" element={<CaseList isAdmin={authenticated} />} />
          <Route path="/cases/:id" element={<CaseDetail isAdmin={authenticated} />} />
          <Route path="/login" element={<LoginPage onLogin={checkAuth} />} />
          <Route path="/review" element={authenticated ? <ReviewPage /> : <CaseList isAdmin={false} />} />
          <Route path="/pool" element={authenticated ? <PoolPage /> : <CaseList isAdmin={false} />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/report" element={<AnalysisReportPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
