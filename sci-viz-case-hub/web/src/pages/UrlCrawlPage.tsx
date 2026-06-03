import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { SOURCE_TYPE_OPTIONS } from '../types';
import { theme } from '../theme';
import { Card } from '../components';

export default function UrlCrawlPage() {
  const [urlText, setUrlText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    summary: {
      inputUrlCount: number;
      fetchedPageCount: number;
      failedPageCount: number;
      candidateImageCount: number;
      filteredImageCount: number;
      createdCaseCount: number;
      failedImageCount: number;
    } | null;
    results: Array<{
      url: string;
      status: string;
      pageTitle: string;
      candidateImageCount: number;
      filteredImageCount: number;
      createdCaseCount: number;
      errors: string[];
    }>;
  }>({ summary: null, results: [] });
  const [error, setError] = useState('');
  const [networkStatus, setNetworkStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [cookie, setCookie] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleCrawl = async () => {
    const urls = urlText.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) {
      setError('请输入至少一个 URL');
      return;
    }
    if (urls.length > 20) {
      setError('一次最多采集 20 个 URL');
      return;
    }
    setLoading(true);
    setError('');
    setResult({ summary: null, results: [] });
    try {
      const res = await api.crawlUrls(urls, sourceName, sourceType || undefined, cookie || undefined);
      if (res.success || res.summary) {
        setResult({
          summary: res.summary,
          results: res.results || [],
        });
      } else {
        setError('采集失败');
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleTestNetwork = async () => {
    setNetworkLoading(true);
    setNetworkStatus(null);
    try {
      const res = await api.testNetwork();
      setNetworkStatus({ success: res.success, message: res.message });
    } catch (err) {
      setNetworkStatus({ success: false, message: (err as Error).message });
    }
    setNetworkLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: theme.typography.size.sm,
    color: theme.colors.text.primary,
    background: theme.colors.bgCard,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
      }}>
        <h1 style={{
          fontSize: theme.typography.size['3xl'],
          fontWeight: 600,
          color: theme.colors.text.primary,
          letterSpacing: '-0.03em',
        }}>
          URL 自动采集
        </h1>
        <button
          onClick={handleTestNetwork}
          disabled={networkLoading}
          style={{
            padding: '6px 14px',
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            cursor: 'pointer',
            background: theme.colors.bgCard,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.size.sm,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: networkStatus
              ? (networkStatus.success ? theme.colors.green : theme.colors.red)
              : theme.colors.text.tertiary,
            flexShrink: 0,
          }} />
          {networkLoading ? '检测中...' : '测试网络'}
        </button>
      </div>

      {networkStatus && (
        <div style={{
          padding: '10px 14px',
          borderRadius: theme.radius.md,
          fontSize: theme.typography.size.sm,
          marginBottom: 16,
          background: networkStatus.success ? theme.colors.greenBg : theme.colors.redBg,
          border: `1px solid ${networkStatus.success ? theme.colors.greenBorder : theme.colors.redBorder}`,
          color: networkStatus.success ? theme.colors.green : theme.colors.red,
        }}>
          {networkStatus.success ? '✓ ' : '✗ '}
          {networkStatus.message}
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: theme.radius.md,
          fontSize: theme.typography.size.sm,
          marginBottom: 16,
          background: theme.colors.redBg,
          border: `1px solid ${theme.colors.redBorder}`,
          color: theme.colors.red,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {/* Left: Input Panel */}
        <Card style={{ flex: '0 0 420px', minWidth: 320 }}>
          <h2 style={{
            fontSize: theme.typography.size.xl,
            fontWeight: 600,
            color: theme.colors.text.primary,
            marginBottom: 16,
          }}>
            采集任务
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: 'block',
              fontSize: theme.typography.size.xs,
              color: theme.colors.text.tertiary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 4,
            }}>
              目标 URL（每行一个）
            </label>
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder={'https://example.com/page-1\nhttps://example.com/page-2'}
              rows={6}
              style={{
                ...inputStyle,
                fontFamily: theme.typography.fontMono,
                fontSize: theme.typography.size.xs,
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}>
                来源名称
              </label>
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="例如：Nature 官网"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}>
                来源类型
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236f6f7b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  paddingRight: 28,
                  cursor: 'pointer',
                }}
              >
                {SOURCE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary,
                padding: '4px 0', fontWeight: 500,
              }}
            >
              {showAdvanced ? '−' : '+'} 高级选项
            </button>
            {showAdvanced && (
              <div style={{ marginTop: 8, padding: 12, background: '#f8f8fa', borderRadius: theme.radius.md }}>
                <label style={{
                  display: 'block', fontSize: theme.typography.size.xs,
                  color: theme.colors.text.tertiary, fontWeight: 600,
                  marginBottom: 4,
                }}>
                  Cookie（用于需要登录的网站）
                </label>
                <textarea
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  placeholder="粘贴从浏览器复制的 Cookie 字符串..."
                  rows={3}
                  style={{
                    ...inputStyle,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    resize: 'vertical',
                  }}
                />
                <div style={{
                  fontSize: 11, color: theme.colors.text.tertiary,
                  marginTop: 6, lineHeight: 1.5,
                }}>
                  从浏览器 DevTools → Network → 请求头复制 Cookie 值。
                  粘贴的不是账号密码，而是你登录后的会话凭证。
                  采集完成后建议立即清空此字段。
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleCrawl}
            disabled={loading}
            style={{
              width: '100%',
              padding: '9px 0',
              borderRadius: theme.radius.md,
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: theme.typography.size.base,
              fontWeight: 600,
              background: loading ? theme.colors.border : theme.colors.text.primary,
              color: theme.colors.bgCard,
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.1s',
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.6s linear infinite',
                  display: 'inline-block',
                }} />
                采集中...
                <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
              </span>
            ) : '开始采集'}
          </button>
        </Card>

        {/* Right: Results Panel */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {loading && (
            <Card style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 48,
              gap: 12,
            }}>
              <span style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '3px solid #e6e6eb',
                borderTopColor: '#6f6f7b',
                animation: 'spin 0.6s linear infinite',
              }} />
              <div style={{ fontSize: theme.typography.size.base, color: theme.colors.text.secondary }}>
                正在采集页面
              </div>
              <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.tertiary }}>
                采集完成后结果将显示在下方
              </div>
            </Card>
          )}

          {result.summary && (
            <Card style={{ marginBottom: 16 }}>
              <h3 style={{
                fontSize: theme.typography.size.base,
                fontWeight: 600,
                color: theme.colors.text.primary,
                marginBottom: 14,
              }}>
                采集结果摘要
              </h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: 8,
              }}>
                <SummaryCard label="输入 URL" value={result.summary.inputUrlCount} />
                <SummaryCard label="成功抓取" value={result.summary.fetchedPageCount} color={theme.colors.green} />
                <SummaryCard label="抓取失败" value={result.summary.failedPageCount} color={theme.colors.red} />
                <SummaryCard label="候选图片" value={result.summary.candidateImageCount} />
                <SummaryCard label="过滤掉" value={result.summary.filteredImageCount} color={theme.colors.text.tertiary} />
                <SummaryCard label="已入库" value={result.summary.createdCaseCount} color={theme.colors.accent} />
                <SummaryCard label="下载失败" value={result.summary.failedImageCount} color={theme.colors.orange} />
              </div>
            </Card>
          )}

          {result.results.length > 0 && (
            <Card padding={0}>
              <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${theme.colors.borderLight}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <h3 style={{
                  fontSize: theme.typography.size.base,
                  fontWeight: 600,
                  color: theme.colors.text.primary,
                }}>
                  URLs 详情
                </h3>
                <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
                  {result.results.filter(r => r.status === 'success').length}/{result.results.length} 成功
                </span>
              </div>
              {result.results.map((r, i) => (
                <div key={i} style={{
                  padding: '12px 20px',
                  borderBottom: i < result.results.length - 1 ? `1px solid ${theme.colors.borderLight}` : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: theme.typography.size.sm,
                        fontWeight: 500,
                        color: theme.colors.text.primary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {r.url}
                      </div>
                      {r.pageTitle && (
                        <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary, marginTop: 1 }}>
                          {r.pageTitle}
                        </div>
                      )}
                    </div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '1px 8px',
                      borderRadius: 9999,
                      fontSize: theme.typography.size.xs,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      ...(r.status === 'success'
                        ? { background: theme.colors.greenBg, color: theme.colors.green, border: `1px solid ${theme.colors.greenBorder}` }
                        : r.status === 'auth_required'
                        ? { background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082' }
                        : { background: theme.colors.redBg, color: theme.colors.red, border: `1px solid ${theme.colors.redBorder}` }),
                    }}>
                      <span style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        ...(r.status === 'success'
                          ? { background: theme.colors.green }
                          : r.status === 'auth_required'
                          ? { background: '#f57f17' }
                          : { background: theme.colors.red }),
                      }} />
                      {r.status === 'success' ? '成功' : r.status === 'auth_required' ? '需登录' : '失败'}
                    </span>
                  </div>
                  {r.status === 'success' && (
                    <div style={{
                      display: 'flex',
                      gap: 16,
                      marginTop: 8,
                      fontSize: theme.typography.size.xs,
                      color: theme.colors.text.secondary,
                    }}>
                      <span>候选 <strong style={{ color: theme.colors.text.primary }}>{r.candidateImageCount}</strong></span>
                      <span>过滤 <strong style={{ color: theme.colors.text.primary }}>{r.filteredImageCount}</strong></span>
                      <span>入库 <strong style={{ color: theme.colors.text.primary }}>{r.createdCaseCount}</strong></span>
                    </div>
                  )}
                  {r.errors.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {r.errors.map((e, j) => (
                        <div key={j} style={{
                          fontSize: theme.typography.size.xs,
                          color: theme.colors.red,
                          marginTop: 2,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          <span>·</span> {e}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          {!loading && !result.summary && (
            <Card style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 48,
              gap: 8,
              border: `1px dashed ${theme.colors.border}`,
              background: theme.colors.bg,
            }}>
              <div style={{ fontSize: 24, color: theme.colors.text.tertiary }}>⌗</div>
              <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.tertiary }}>
                输入 URL 并开始采集
              </div>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.disabled, textAlign: 'center', maxWidth: 280 }}>
                采集结果会自动完成 OCR 和 AI 分类，进入待确认状态
              </div>
            </Card>
          )}
        </div>
      </div>

      {result.summary && (
        <div style={{
          marginTop: 16,
          padding: '10px 16px',
          borderRadius: theme.radius.md,
          fontSize: theme.typography.size.sm,
          background: theme.colors.accentBg,
          border: `1px solid ${theme.colors.accentBorder}`,
          color: theme.colors.accent,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>⏎</span>
          <span>
            采集结果已进入案例库并完成 AI 分析。前往{' '}
            <Link to="/review" style={{ fontWeight: 600, textDecoration: 'underline' }}>
              处理队列
            </Link>{' '}
            进行人工判断和评分。
          </span>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: theme.colors.bgSubtle,
      borderRadius: theme.radius.md,
      padding: '10px 12px',
      textAlign: 'center',
      border: `1px solid ${theme.colors.borderLight}`,
    }}>
      <div style={{
        fontSize: 22,
        fontWeight: 700,
        color: color || theme.colors.text.primary,
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: theme.typography.size.xs,
        color: theme.colors.text.tertiary,
        marginTop: 2,
      }}>
        {label}
      </div>
    </div>
  );
}
