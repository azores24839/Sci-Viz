import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { SOURCE_TYPE_OPTIONS, type SiteDiscoveryResult, type UrlCrawlTask } from '../types';
import { theme } from '../theme';
import { Card } from '../components';

interface CrawlSummary {
  inputUrlCount: number;
  fetchedPageCount: number;
  failedPageCount: number;
  candidateImageCount: number;
  filteredImageCount: number;
  filterReasons?: ImageFilterReasons;
  createdCaseCount: number;
  duplicateImageCount: number;
  cappedImageCount: number;
  failedImageCount: number;
  caseLimit?: number | null;
  reachedCaseLimit?: boolean;
  unprocessedPageCount?: number;
  deletedCaseCount?: number;
}

interface CrawlCreatedCase {
  id: string;
  pageTitle: string;
  sourceUrl: string;
  imageUrl: string;
  imagePath: string;
  thumbnailPath: string;
}

interface CrawlPageResult {
  url: string;
  status: string;
  pageTitle: string;
  candidateImageCount: number;
  filteredImageCount: number;
  filterReasons?: ImageFilterReasons;
  createdCaseCount: number;
  duplicateImageCount: number;
  cappedImageCount: number;
  failedImageCount: number;
  deletedCaseCount?: number;
  createdCases: CrawlCreatedCase[];
  errors: string[];
  notices: string[];
}

interface ImageFilterReasons {
  missingSourceCount: number;
  inlineDataCount: number;
  unsupportedFormatCount: number;
  tooSmallCount: number;
  duplicateUrlCount: number;
}

const ACTIVE_CRAWL_TASK_KEY = 'sci-viz-active-url-crawl-task';

export default function UrlCrawlPage() {
  const [urlText, setUrlText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    summary: CrawlSummary | null;
    results: CrawlPageResult[];
  }>({ summary: null, results: [] });
  const [error, setError] = useState('');
  const [cookie, setCookie] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [deletingCaseIds, setDeletingCaseIds] = useState<string[]>([]);
  const [sitePreview, setSitePreview] = useState<SiteDiscoveryResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [crawlTask, setCrawlTask] = useState<UrlCrawlTask | null>(null);
  const [crawlTaskId, setCrawlTaskId] = useState<string | null>(() => (
    window.localStorage.getItem(ACTIVE_CRAWL_TASK_KEY)
  ));
  const hasRequiredDetails = Boolean(sourceName.trim() && sourceType && urlText.trim());

  useEffect(() => {
    if (!crawlTaskId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollTask = async () => {
      try {
        const response = await api.getSiteCrawlTask(crawlTaskId);
        if (disposed) return;
        if (!response.success || !response.data) {
          throw new Error(response.error || '无法读取采集任务状态');
        }
        const task = response.data;
        setCrawlTask(task);
        const active = task.status === 'queued' || task.status === 'running' || task.status === 'cancelling';
        setLoading(active);

        if (task.status === 'completed' && task.result) {
          setResult({
            summary: task.result.summary,
            results: task.result.results || [],
          });
          setCrawlTask(null);
          setCrawlTaskId(null);
          window.localStorage.removeItem(ACTIVE_CRAWL_TASK_KEY);
          return;
        }
        if (task.status === 'failed' || task.status === 'cancelled') {
          setCrawlTaskId(null);
          window.localStorage.removeItem(ACTIVE_CRAWL_TASK_KEY);
          return;
        }
        timer = setTimeout(pollTask, 1000);
      } catch (pollError) {
        if (disposed) return;
        setLoading(false);
        setError(pollError instanceof Error ? pollError.message : '无法读取采集任务状态');
        setCrawlTaskId(null);
        window.localStorage.removeItem(ACTIVE_CRAWL_TASK_KEY);
      }
    };

    void pollTask();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [crawlTaskId]);

  const previewSite = async (preset: 'standard' | 'deep' | 'full' = 'standard') => {
    if (!sourceName.trim()) {
      setError('请填写来源名称');
      return;
    }
    if (!sourceType) {
      setError('请选择来源类型');
      return;
    }
    const urls = urlText.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) {
      setError('请输入一个网站地址');
      return;
    }
    if (urls.length > 1) {
      setError('网站诊断一次只需要一个入口地址');
      return;
    }

    setPreviewLoading(true);
    setError('');
    setResult({ summary: null, results: [] });
    try {
      const response = await api.previewSiteCrawl(
        urls[0],
        preset,
        sourceName.trim(),
        sourceType,
        cookie || undefined,
      );
      if (!response.success || !response.data) throw new Error(response.error || '网站诊断失败');
      setSitePreview(response.data);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '网站诊断失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const collectPages = async (urls: string[]) => {
    if (!sitePreview || urls.length === 0) return;
    if (!sourceName.trim() || !sourceType) {
      setError('请填写来源名称并选择来源类型');
      return;
    }
    setLoading(true);
    setError('');
    setResult({ summary: null, results: [] });
    try {
      const response = await api.startSiteCrawlTask({
        rootUrl: sitePreview.rootUrl,
        urls,
        sourceName: sourceName.trim(),
        sourceType,
        cookie: cookie || undefined,
      });
      if (!response.success || !response.data) throw new Error(response.error || '无法启动采集任务');
      setCrawlTask(response.data);
      setCrawlTaskId(response.data.id);
      window.localStorage.setItem(ACTIVE_CRAWL_TASK_KEY, response.data.id);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const cancelCrawlTask = async () => {
    if (!crawlTask) return;
    const confirmed = window.confirm('停止后不会再处理新网页，已经入库的图片会保留。确定停止吗？');
    if (!confirmed) return;
    try {
      const response = await api.cancelSiteCrawlTask(crawlTask.id);
      if (!response.success || !response.data) throw new Error(response.error || '无法停止采集任务');
      setCrawlTask(response.data);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '无法停止采集任务');
    }
  };

  const changeUrlText = (value: string) => {
    setUrlText(value);
    setSitePreview(null);
    setResult({ summary: null, results: [] });
  };

  const handleDeleteCollectedCase = async (item: CrawlCreatedCase) => {
    const confirmed = window.confirm('确定删除这张图片吗？数据库记录、原图和缩略图都会被删除。');
    if (!confirmed) return;

    setDeletingCaseIds(ids => [...ids, item.id]);
    setError('');
    try {
      const response = await api.deleteCase(item.id);
      if (!response.success) throw new Error(response.error || '删除失败');

      setResult(previous => {
        let removed = false;
        const results = previous.results.map(pageResult => {
          if (!pageResult.createdCases.some(created => created.id === item.id)) return pageResult;
          removed = true;
          return {
            ...pageResult,
            createdCaseCount: Math.max(0, pageResult.createdCaseCount - 1),
            deletedCaseCount: (pageResult.deletedCaseCount || 0) + 1,
            createdCases: pageResult.createdCases.filter(created => created.id !== item.id),
          };
        });

        if (!removed || !previous.summary) return { ...previous, results };
        return {
          results,
          summary: {
            ...previous.summary,
            createdCaseCount: Math.max(0, previous.summary.createdCaseCount - 1),
            deletedCaseCount: (previous.summary.deletedCaseCount || 0) + 1,
          },
        };
      });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
    } finally {
      setDeletingCaseIds(ids => ids.filter(id => id !== item.id));
    }
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
          网页采集助手
        </h1>
      </div>

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
        <Card style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}>
                来源名称 <span style={{ color: theme.colors.red }}>*</span>
              </label>
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="例如：Nature 官网"
                required
                aria-required="true"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 4,
              }}>
                来源类型 <span style={{ color: theme.colors.red }}>*</span>
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                required
                aria-required="true"
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
                <option value="" disabled>请选择来源类型</option>
                {SOURCE_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

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
              网站地址 <span style={{ color: theme.colors.red }}>*</span>
            </label>
            <textarea
              value={urlText}
              onChange={(e) => changeUrlText(e.target.value)}
              placeholder="https://example.com/"
              rows={3}
              required
              aria-required="true"
              style={{
                ...inputStyle,
                fontFamily: theme.typography.fontMono,
                fontSize: theme.typography.size.xs,
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
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
            onClick={() => previewSite('standard')}
            disabled={!hasRequiredDetails || loading || previewLoading}
            style={{
              width: '100%',
              padding: '9px 0',
              borderRadius: theme.radius.md,
              border: 'none',
              cursor: loading || previewLoading ? 'wait' : (!hasRequiredDetails ? 'not-allowed' : 'pointer'),
              fontSize: theme.typography.size.base,
              fontWeight: 600,
              background: !hasRequiredDetails || loading || previewLoading ? theme.colors.border : theme.colors.text.primary,
              color: theme.colors.bgCard,
              opacity: !hasRequiredDetails || loading || previewLoading ? 0.7 : 1,
              transition: 'opacity 0.1s',
            }}
          >
            {previewLoading ? (
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
                正在分析网站…
                <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
              </span>
            ) : sitePreview ? '重新分析这个网站' : '分析这个网站'}
          </button>
        </Card>

        {/* Right: Results Panel */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {previewLoading && (
            <Card style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 42,
              gap: 10,
            }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                border: '3px solid #e6e6eb',
                borderTopColor: theme.colors.accent,
                animation: 'spin 0.6s linear infinite',
              }} />
              <div style={{ fontSize: theme.typography.size.base, color: theme.colors.text.primary, fontWeight: 600 }}>
                正在看看这个网站有多大
              </div>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary, textAlign: 'center' }}>
                只统计网页和图片，不会下载图片
              </div>
            </Card>
          )}

          {sitePreview && !previewLoading && !loading && !crawlTask && !result.summary && (
            <SitePreviewCard
              preview={sitePreview}
              onCollect={() => collectPages(sitePreview.urls)}
              onCollectCurrent={() => collectPages(sitePreview.urls.slice(0, 1))}
              onExpand={sitePreview.limitReached && sitePreview.pageLimit < 1000
                ? () => previewSite(sitePreview.pageLimit < 200 ? 'deep' : 'full')
                : undefined}
            />
          )}

          {crawlTask && !result.summary && (
            <CrawlProgressCard
              task={crawlTask}
              onCancel={cancelCrawlTask}
              onDismiss={() => setCrawlTask(null)}
            />
          )}

          {result.summary && (
            <CollectionSummary summary={result.summary} />
          )}

          {result.results.some(pageResult => pageResult.createdCases?.length > 0) && (
            <CollectedImages
              images={result.results.flatMap(pageResult => pageResult.createdCases || [])}
              deletingCaseIds={deletingCaseIds}
              onDelete={handleDeleteCollectedCase}
            />
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
                  网页明细
                </h3>
                <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
                  共 {result.results.length} 个网页
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
                        {r.pageTitle || readableUrl(r.url)}
                      </div>
                      <div
                        title={r.url}
                        style={{
                          fontFamily: theme.typography.fontMono,
                          fontSize: 10,
                          color: theme.colors.text.tertiary,
                          marginTop: 3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.url}
                      </div>
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
                  {r.status === 'success' && pageMetrics(r).length > 0 && (
                    <div style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 8,
                      fontSize: theme.typography.size.xs,
                      color: theme.colors.text.secondary,
                    }}>
                      {pageMetrics(r).map(metric => (
                        <span key={metric.label} style={{
                          padding: '3px 7px',
                          borderRadius: theme.radius.sm,
                          background: metric.background,
                          color: metric.color,
                        }}>
                          {metric.label} <strong>{metric.value}</strong>
                        </span>
                      ))}
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
                  {r.notices?.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{
                        cursor: 'pointer',
                        fontSize: theme.typography.size.xs,
                        color: theme.colors.text.secondary,
                      }}>
                        查看未保存图片明细（{r.notices.length}）
                      </summary>
                      <div style={{ marginTop: 5, paddingLeft: 12 }}>
                        {r.notices.map((notice, j) => (
                          <div key={j} style={{
                            fontSize: theme.typography.size.xs,
                            color: theme.colors.text.tertiary,
                            marginTop: 3,
                            overflowWrap: 'anywhere',
                          }}>
                            · {notice}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </Card>
          )}

          {!loading && !previewLoading && !sitePreview && !result.summary && (
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
                填写左侧的网站地址
              </div>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.disabled, textAlign: 'center', maxWidth: 280 }}>
                系统会先告诉你范围和预计图片数，确认后才开始下载
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
            已入库图片正在进行 AI 分析。前往{' '}
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

function CrawlProgressCard({
  task,
  onCancel,
  onDismiss,
}: {
  task: UrlCrawlTask;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const active = task.status === 'queued' || task.status === 'running' || task.status === 'cancelling';
  const progress = task.totalPageCount > 0
    ? Math.min(100, (task.processedPageCount / task.totalPageCount) * 100)
    : 0;
  const startedMs = task.startedAt ? new Date(task.startedAt).getTime() : 0;
  const elapsedSeconds = startedMs ? Math.max(0, Math.floor((Date.now() - startedMs) / 1000)) : 0;
  const staleSeconds = Math.max(0, Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / 1000));
  const slow = task.status === 'running' && staleSeconds >= 30;
  const remainingSeconds = task.processedPageCount > 0 && elapsedSeconds > 0
    ? Math.round((task.totalPageCount - task.processedPageCount) / (task.processedPageCount / elapsedSeconds))
    : null;
  const stageLabel: Record<UrlCrawlTask['stage'], string> = {
    queued: '等待开始',
    reading_pages: '正在读取网页',
    processing_images: '正在处理图片',
    finalizing: '正在整理结果',
    completed: '采集完成',
    failed: '采集任务停止',
    cancelled: '采集已取消',
  };

  return (
    <Card padding={0} style={{ overflow: 'hidden', marginBottom: 16 }}>
      <div style={{
        padding: '16px 18px 14px',
        borderBottom: `1px solid ${theme.colors.borderLight}`,
        background: slow ? theme.colors.orangeBg : theme.colors.bgCard,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{
              width: 9,
              height: 9,
              marginTop: 5,
              borderRadius: '50%',
              flexShrink: 0,
              background: task.status === 'failed'
                ? theme.colors.red
                : task.status === 'cancelled'
                  ? theme.colors.orange
                  : theme.colors.green,
              boxShadow: active ? `0 0 0 4px ${slow ? theme.colors.orangeBorder : theme.colors.greenBg}` : 'none',
            }} />
            <div>
              <h3 style={{ fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.text.primary }}>
                {slow ? '当前页面响应较慢' : stageLabel[task.stage]}
              </h3>
              <div style={{ marginTop: 3, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
                {task.status === 'queued'
                  ? '前一个采集任务结束后会自动开始'
                  : slow
                    ? `已有 ${staleSeconds} 秒没有新进度，系统仍在等待；单个请求最长等待 30 秒。`
                    : active
                      ? `已运行 ${formatDuration(elapsedSeconds)}${remainingSeconds !== null && task.processedPageCount >= 2 ? ` · 按当前速度约剩 ${formatDuration(remainingSeconds)}` : ''}`
                      : task.error || `已处理 ${task.processedPageCount} 个网页`}
              </div>
            </div>
          </div>
          <span style={{
            fontFamily: theme.typography.fontMono,
            fontSize: theme.typography.size.xs,
            color: theme.colors.text.secondary,
            whiteSpace: 'nowrap',
          }}>
            {Math.round(progress)}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={task.totalPageCount}
          aria-valuenow={task.processedPageCount}
          aria-label={`已处理 ${task.processedPageCount} / ${task.totalPageCount} 个网页`}
          style={{
            height: 8,
            marginTop: 14,
            background: theme.colors.bgSubtle,
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div style={{
            width: `${progress}%`,
            height: '100%',
            borderRadius: 999,
            background: slow ? theme.colors.orange : theme.colors.accent,
            transition: 'width 0.25s ease',
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          fontSize: 10,
          color: theme.colors.text.tertiary,
        }}>
          <span>已完成 {task.processedPageCount} 个网页</span>
          <span>共 {task.totalPageCount} 个</span>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <ProgressMetric label="已处理图片" value={task.processedImageCount} note={task.candidateImageCount > 0 ? `已发现 ${task.candidateImageCount}` : '等待网页返回'} />
          <ProgressMetric label="已入库" value={task.createdCaseCount} note="已保存案例" accent />
          <ProgressMetric label="已跳过" value={task.duplicateImageCount + task.filteredImageCount + task.cappedImageCount} note={`重复 ${task.duplicateImageCount} · 异常 ${task.failedImageCount}`} />
        </div>

        {task.activeUrls.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, color: theme.colors.text.tertiary, fontWeight: 600, marginBottom: 5 }}>
              当前正在处理
            </div>
            {task.activeUrls.slice(0, 2).map(url => (
              <div key={url} title={url} style={{
                padding: '6px 8px',
                marginTop: 4,
                borderRadius: theme.radius.sm,
                background: theme.colors.bgSubtle,
                fontFamily: theme.typography.fontMono,
                fontSize: 10,
                color: theme.colors.text.secondary,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}>
                {url}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          {active ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={task.status === 'cancelling'}
              style={{
                padding: '7px 12px',
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.redBorder}`,
                background: theme.colors.redBg,
                color: theme.colors.red,
                cursor: task.status === 'cancelling' ? 'wait' : 'pointer',
                fontSize: theme.typography.size.xs,
                fontWeight: 600,
              }}
            >
              {task.status === 'cancelling' ? '正在停止…' : '停止采集'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              style={{
                padding: '7px 12px',
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.bgCard,
                color: theme.colors.text.secondary,
                cursor: 'pointer',
                fontSize: theme.typography.size.xs,
              }}
            >
              返回采集选择
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProgressMetric({ label, value, note, accent = false }: { label: string; value: number; note: string; accent?: boolean }) {
  return (
    <div style={{ padding: '9px 10px', borderRadius: theme.radius.md, background: accent ? theme.colors.accentBg : theme.colors.bgSubtle }}>
      <div style={{ fontSize: 10, color: theme.colors.text.tertiary }}>{label}</div>
      <strong style={{ display: 'block', marginTop: 2, fontSize: 20, color: accent ? theme.colors.accent : theme.colors.text.primary }}>
        {value}
      </strong>
      <div style={{ marginTop: 2, fontSize: 9, color: theme.colors.text.disabled, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {note}
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  if (totalSeconds < 60) return `${Math.max(1, Math.round(totalSeconds))} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes < 60) return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

function SitePreviewCard({
  preview,
  onCollect,
  onCollectCurrent,
  onExpand,
}: {
  preview: SiteDiscoveryResult;
  onCollect: () => void;
  onCollectCurrent: () => void;
  onExpand?: () => void;
}) {
  const assessment = assessSitePreview(preview);
  return (
    <Card padding={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{
        padding: '15px 20px',
        borderBottom: `1px solid ${theme.colors.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.colors.green }} />
        <div>
          <h3 style={{ fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.text.primary }}>
            第 2 步：根据诊断决定是否采集
          </h3>
          <div style={{ marginTop: 2, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
            现在还没有下载图片，可以放心确认
          </div>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        <div style={{
          padding: '13px 14px',
          borderRadius: theme.radius.md,
          background: assessment.background,
          border: `1px solid ${assessment.border}`,
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <strong style={{ fontSize: theme.typography.size.base, color: assessment.color }}>
              {assessment.title}
            </strong>
            <span style={{ fontSize: 10, color: theme.colors.text.tertiary }}>
              {preview.browserRenderedPageCount > 0
                ? '已自动渲染动态页面'
                : preview.embeddedImageCount > 0
                  ? '基于静态页面及内嵌数据抽查'
                  : '基于静态页面抽查'}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, lineHeight: 1.55 }}>
            {assessment.description}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 8,
        }}>
          <PreviewMetric label="已检查" value={preview.scannedPageCount} unit="个网页" color={theme.colors.accent} background={theme.colors.accentBg} />
          <PreviewMetric label="有效候选" value={preview.estimatedImageCount} unit="张图片" color={theme.colors.text.primary} background={theme.colors.bgSubtle} />
          {preview.interactiveCount > 0 && (
            <PreviewMetric label="发现" value={preview.interactiveCount} unit="个展开入口" color={theme.colors.orange} background={theme.colors.orangeBg} />
          )}
        </div>

        <div style={{
          marginTop: 12,
          padding: '9px 11px',
          borderRadius: theme.radius.md,
          background: preview.limitReached ? theme.colors.orangeBg : theme.colors.greenBg,
          color: preview.limitReached ? '#8a5f1b' : theme.colors.green,
          fontSize: theme.typography.size.xs,
          lineHeight: 1.55,
        }}>
          {preview.limitReached
            ? `已发现至少 ${Math.max(preview.discoveredPageCount, preview.scannedPageCount)} 个同站网页，当前只抽查了前 ${preview.pageLimit} 个；这不是网站总量。`
            : `当前路径下发现了 ${preview.discoveredPageCount} 个同站网页，已完成可发现范围检查。`}
          {preview.estimatedTotalImageCount > preview.estimatedImageCount
            ? ` 按本次抽样密度粗略估算，至少约 ${preview.estimatedTotalImageCount} 张有效候选图；全站采集最多入库 500 张，达到上限会停止并提示仍有页面未采。`
            : ' 全站采集最多入库 500 张，达到上限会停止并提示仍有页面未采。'}
          {preview.rawImageCount > preview.estimatedImageCount
            ? ` 原始发现 ${preview.rawImageCount} 张，已排除 ${preview.filteredImageCount} 张无效候选和 ${preview.duplicateAcrossPageCount} 张跨页重复图片。`
            : ''}
          {preview.embeddedImageCount > 0
            ? ` 已从页面内嵌数据识别 ${preview.embeddedImageCount} 个图片引用和 ${preview.embeddedLinkCount} 个同站网页入口。`
            : ''}
          {preview.dynamicShellCount > 0
            ? ` 有 ${preview.dynamicShellCount} 个页面疑似只返回 JavaScript 空壳，当前数量不能代表其真实图片内容。`
            : ''}
          {preview.browserRenderedPageCount > 0
            ? ` 已自动渲染 ${preview.browserRenderedPageCount} 个动态页面。`
            : ''}
          {preview.browserRenderFailureCount > 0
            ? ` 另有 ${preview.browserRenderFailureCount} 个页面动态渲染失败，已保留静态扫描结果。`
            : ''}
          {preview.interactiveCount > 0 && ' HTML 中已经包含的 Tab 内容会一起采集；点击后才联网加载的内容可能需要单独适配。'}
        </div>

        <div style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${theme.colors.borderLight}`,
        }}>
          <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary, fontWeight: 600, marginBottom: 8 }}>
            选择下一步
          </div>
          <button
            type="button"
            onClick={onCollect}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: theme.radius.md, border: 'none',
              background: theme.colors.text.primary, color: theme.colors.bgCard, cursor: 'pointer',
              fontSize: theme.typography.size.sm, fontWeight: 600,
            }}
          >
            采集已检查的 {preview.urls.length} 个网页 · 最多入库 500 张
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onCollectCurrent}
              style={{
                flex: '1 1 150px', padding: '8px 10px', borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
                color: theme.colors.text.secondary, cursor: 'pointer', fontSize: theme.typography.size.xs,
              }}
            >
              只采集当前页面
            </button>
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                style={{
                  flex: '1 1 150px', padding: '8px 10px', borderRadius: theme.radius.md,
                  border: `1px solid ${theme.colors.accentBorder}`, background: theme.colors.accentBg,
                  color: theme.colors.accent, cursor: 'pointer', fontSize: theme.typography.size.xs, fontWeight: 600,
                }}
              >
                内容较多，扩大检查到 200 页
              </button>
            )}
          </div>
        </div>

        {preview.pages.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{
              cursor: 'pointer',
              fontSize: theme.typography.size.xs,
              color: theme.colors.text.secondary,
              fontWeight: 600,
            }}>
              查看准备采集的网页（{preview.pages.length}）
            </summary>
            <div style={{
              marginTop: 8,
              maxHeight: 180,
              overflowY: 'auto',
              borderTop: `1px solid ${theme.colors.borderLight}`,
            }}>
              {preview.pages.map((page, index) => (
                <div key={`${page.url}-${index}`} style={{
                  padding: '7px 2px',
                  borderBottom: `1px solid ${theme.colors.borderLight}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: theme.typography.size.xs,
                      color: theme.colors.text.primary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {index + 1}. {page.title || readableUrl(page.url)}
                    </div>
                    <div title={page.url} style={{
                      marginTop: 2,
                      fontFamily: theme.typography.fontMono,
                      fontSize: 9,
                      color: theme.colors.text.tertiary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {page.url}
                    </div>
                  </div>
                  {page.imageCount > 0 && (
                    <span style={{ flexShrink: 0, fontSize: 10, color: theme.colors.text.secondary }}>
                      约 {page.imageCount} 张
                    </span>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {preview.warnings.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: theme.typography.size.xs, color: theme.colors.orange }}>
              {preview.warnings.length} 个网页暂时无法读取
            </summary>
            <div style={{ marginTop: 6, fontSize: 10, color: theme.colors.text.tertiary, lineHeight: 1.5 }}>
              {preview.warnings.map(warning => <div key={warning}>· {warning}</div>)}
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

function assessSitePreview(preview: SiteDiscoveryResult) {
  const imageCount = preview.estimatedImageCount;
  const readablePages = Math.max(1, preview.scannedPageCount);
  const imagesPerPage = imageCount / readablePages;

  if (imageCount === 0 && preview.dynamicShellCount > 0) {
    return {
      title: '静态扫描无法判断图片潜力',
      description: '页面内容需要 JavaScript 运行后才出现，当前的 0 张不是网站真实图片数量。该来源需要动态页面适配后再采集。',
      color: theme.colors.orange,
      background: theme.colors.orangeBg,
      border: theme.colors.orangeBorder,
    };
  }

  if (imageCount === 0 && preview.warnings.length > 0) {
    return {
      title: '暂时无法判断采集价值',
      description: '没有读到有效候选图片，且部分页面无法访问。可以检查 Cookie，或先尝试只采集当前页面。',
      color: theme.colors.orange,
      background: theme.colors.orangeBg,
      border: theme.colors.orangeBorder,
    };
  }

  if (imageCount >= 40 || (imageCount >= 20 && imagesPerPage >= 2)) {
    return {
      title: '图片潜力较高，值得采集',
      description: `抽查范围内有 ${imageCount} 张去重后的有效候选，平均每页约 ${imagesPerPage.toFixed(1)} 张。建议先采集已检查范围，再从入库结果判断内容质量。`,
      color: theme.colors.green,
      background: theme.colors.greenBg,
      border: theme.colors.greenBorder,
    };
  }

  if (imageCount >= 10) {
    return {
      title: '有一定图片潜力，适合小批量采集',
      description: `抽查范围内有 ${imageCount} 张去重后的有效候选。数量不算多，建议先采集当前范围，不必急着扩大到整个网站。`,
      color: theme.colors.accent,
      background: theme.colors.accentBg,
      border: theme.colors.accentBorder,
    };
  }

  return {
    title: '图片较少，采集收益可能有限',
    description: `抽查范围内只发现 ${imageCount} 张去重后的有效候选。除非这个来源很重要，否则建议只采当前页面或暂不采集。`,
    color: theme.colors.orange,
    background: theme.colors.orangeBg,
    border: theme.colors.orangeBorder,
  };
}

function PreviewMetric({
  label,
  value,
  unit,
  color,
  background,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  background: string;
}) {
  return (
    <div style={{ padding: '10px 11px', borderRadius: theme.radius.md, background }}>
      <div style={{ fontSize: 10, color: theme.colors.text.tertiary }}>{label}</div>
      <div style={{ marginTop: 3, color }}>
        <strong style={{ fontSize: 22, lineHeight: 1 }}>{value}</strong>
        <span style={{ marginLeft: 4, fontSize: theme.typography.size.xs }}>{unit}</span>
      </div>
    </div>
  );
}

function CollectedImages({
  images,
  deletingCaseIds,
  onDelete,
}: {
  images: CrawlCreatedCase[];
  deletingCaseIds: string[];
  onDelete: (item: CrawlCreatedCase) => void;
}) {
  return (
    <Card padding={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 20px',
        borderBottom: `1px solid ${theme.colors.borderLight}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <h3 style={{
            fontSize: theme.typography.size.base,
            fontWeight: 600,
            color: theme.colors.text.primary,
          }}>
            本次入库图片
          </h3>
          <div style={{
            marginTop: 3,
            fontSize: theme.typography.size.xs,
            color: theme.colors.text.tertiary,
          }}>
            点击图片查看完整案例，也可以在这里直接删除
          </div>
        </div>
        <span style={{
          padding: '3px 8px',
          borderRadius: 999,
          background: theme.colors.accentBg,
          color: theme.colors.accent,
          fontSize: theme.typography.size.xs,
          fontWeight: 600,
        }}>
          {images.length} 张
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))',
        gap: 10,
        padding: 12,
        maxHeight: 480,
        overflowY: 'auto',
      }}>
        {images.map(item => {
          const deleting = deletingCaseIds.includes(item.id);
          const previewSrc = item.thumbnailPath || item.imagePath || item.imageUrl;
          return (
            <div key={item.id} style={{
              minWidth: 0,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.md,
              overflow: 'hidden',
              background: theme.colors.bgCard,
              opacity: deleting ? 0.55 : 1,
            }}>
              <Link
                to={`/cases/${item.id}`}
                title="查看案例详情"
                style={{ display: 'block', background: theme.colors.bgSubtle }}
              >
                <img
                  src={previewSrc}
                  alt={item.pageTitle || '本次采集图片'}
                  loading="lazy"
                  style={{
                    display: 'block',
                    width: '100%',
                    aspectRatio: '4 / 3',
                    objectFit: 'cover',
                  }}
                />
              </Link>
              <div style={{ padding: '8px 9px 9px' }}>
                <div title={item.pageTitle} style={{
                  fontSize: theme.typography.size.xs,
                  color: theme.colors.text.primary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.pageTitle || readableUrl(item.sourceUrl)}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 7,
                }}>
                  <Link to={`/cases/${item.id}`} style={{
                    fontSize: theme.typography.size.xs,
                    color: theme.colors.accent,
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}>
                    查看详情
                  </Link>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => onDelete(item)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: theme.colors.red,
                      padding: 0,
                      fontSize: theme.typography.size.xs,
                      cursor: deleting ? 'wait' : 'pointer',
                    }}
                  >
                    {deleting ? '删除中…' : '删除'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CollectionSummary({ summary }: { summary: CrawlSummary }) {
  const filterBreakdown = imageFilterBreakdown(summary.filteredImageCount, summary.filterReasons);
  const duplicateCount = summary.duplicateImageCount
    + (summary.filterReasons?.duplicateUrlCount || 0);
  const breakdown = [
    {
      label: '已入库',
      description: '已保存到案例库',
      value: summary.createdCaseCount,
      color: theme.colors.accent,
      background: theme.colors.accentBg,
    },
    {
      label: '本次已删除',
      description: '已从案例库和本地文件中移除',
      value: summary.deletedCaseCount || 0,
      color: theme.colors.red,
      background: theme.colors.redBg,
    },
    ...filterBreakdown,
    {
      label: '重复图片',
      description: '页面内或案例库中已有',
      value: duplicateCount,
      color: '#a0448f',
      background: '#f8edf6',
    },
    {
      label: '超过安全上限',
      description: '本次未处理',
      value: summary.cappedImageCount,
      color: '#c77816',
      background: '#fff4e4',
    },
    {
      label: '下载或保存失败',
      description: '网络、访问限制或写入异常，可查看网页明细',
      value: summary.failedImageCount,
      color: '#8f1d2c',
      background: '#fbecef',
    },
  ].filter(item => item.value > 0);

  const totalForBar = Math.max(
    summary.candidateImageCount,
    breakdown.reduce((sum, item) => sum + item.value, 0),
  );
  const hasPageFailures = summary.failedPageCount > 0;

  return (
    <Card style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '15px 20px',
        borderBottom: `1px solid ${theme.colors.borderLight}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: hasPageFailures ? theme.colors.orange : theme.colors.green,
          }} />
          <h3 style={{
            fontSize: theme.typography.size.base,
            fontWeight: 600,
            color: theme.colors.text.primary,
          }}>
            {summary.reachedCaseLimit
              ? '已达到 500 张上限，网站尚未采完'
              : hasPageFailures ? '采集完成，部分网页未读取' : '采集完成'}
          </h3>
        </div>
        {summary.fetchedPageCount > 0 && (
          <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
            已读取 {summary.fetchedPageCount}/{summary.inputUrlCount} 个网页
          </span>
        )}
      </div>
      {summary.reachedCaseLimit && (
        <div style={{ padding: '10px 20px', background: theme.colors.orangeBg, color: '#8a5f1b', fontSize: theme.typography.size.xs }}>
          本次最多入库 {summary.caseLimit || 500} 张，已停止继续处理；仍有 {summary.unprocessedPageCount || '部分'} 个网页未采，可在下一批继续。
        </div>
      )}

      <div style={{ padding: '22px 20px 20px' }}>
        {summary.candidateImageCount > 0 ? (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              alignItems: 'end',
              gap: 20,
            }}>
              <div>
                <div style={{
                  fontSize: theme.typography.size.xs,
                  color: theme.colors.text.secondary,
                  marginBottom: 5,
                }}>
                  网页中发现的图片
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 7,
                  color: theme.colors.text.primary,
                }}>
                  <strong style={{ fontSize: 34, lineHeight: 1, letterSpacing: '-0.04em' }}>
                    {summary.candidateImageCount}
                  </strong>
                  <span style={{ fontSize: theme.typography.size.base }}>张图片</span>
                </div>
                <div style={{
                  fontSize: theme.typography.size.xs,
                  color: theme.colors.text.tertiary,
                  marginTop: 7,
                }}>
                  这是处理前总数，包含之后识别出的重复或不支持项目
                </div>
              </div>

              {summary.createdCaseCount > 0 && (
                <div style={{
                  minWidth: 128,
                  padding: '11px 14px',
                  borderRadius: theme.radius.lg,
                  background: theme.colors.accentBg,
                  border: `1px solid ${theme.colors.accentBorder}`,
                }}>
                  <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.accent }}>
                    已保存到案例库
                  </div>
                  <div style={{ color: theme.colors.accent, marginTop: 2 }}>
                    <strong style={{ fontSize: 24, lineHeight: 1.1 }}>{summary.createdCaseCount}</strong>
                    <span style={{ fontSize: theme.typography.size.xs, marginLeft: 4 }}>张</span>
                  </div>
                </div>
              )}
            </div>

            {breakdown.length > 0 && (
              <>
                <div
                  aria-label={`共发现 ${summary.candidateImageCount} 张图片的处理结果`}
                  style={{
                    display: 'flex',
                    width: '100%',
                    height: 9,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: theme.colors.bgSubtle,
                    marginTop: 22,
                  }}
                >
                  {breakdown.map(item => (
                    <div
                      key={item.label}
                      title={`${item.label}：${item.value} 张`}
                      style={{
                        width: `${(item.value / totalForBar) * 100}%`,
                        background: item.color,
                      }}
                    />
                  ))}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 8,
                  marginTop: 12,
                }}>
                  {breakdown.map(item => (
                    <div key={item.label} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: theme.radius.md,
                      background: item.background,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: theme.typography.size.xs,
                          color: item.color,
                          fontWeight: 600,
                        }}>
                          {item.label}
                        </div>
                        <div style={{
                          fontSize: 10,
                          color: theme.colors.text.tertiary,
                          marginTop: 1,
                        }}>
                          {item.description}
                        </div>
                      </div>
                      <strong style={{ fontSize: 18, color: item.color }}>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div style={{
            padding: '10px 0',
            fontSize: theme.typography.size.sm,
            color: theme.colors.text.secondary,
          }}>
            已读取网页，但没有发现可处理的图片。
          </div>
        )}
      </div>
    </Card>
  );
}

function readableUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return rawUrl;
  }
}

function pageMetrics(result: CrawlPageResult) {
  const filters = imageFilterBreakdown(result.filteredImageCount, result.filterReasons)
    .map(item => ({
      label: item.label,
      value: item.value,
      color: item.color,
      background: item.background,
    }));
  const duplicateCount = result.duplicateImageCount
    + (result.filterReasons?.duplicateUrlCount || 0);
  return [
    { label: '发现图片', value: result.candidateImageCount, color: theme.colors.text.primary, background: theme.colors.bgSubtle },
    { label: '已入库', value: result.createdCaseCount, color: theme.colors.accent, background: theme.colors.accentBg },
    { label: '已删除', value: result.deletedCaseCount || 0, color: theme.colors.red, background: theme.colors.redBg },
    ...filters,
    { label: '重复', value: duplicateCount, color: '#a0448f', background: '#f8edf6' },
    { label: '超过上限', value: result.cappedImageCount, color: '#c77816', background: '#fff4e4' },
    { label: '失败', value: result.failedImageCount, color: '#8f1d2c', background: '#fbecef' },
  ].filter(metric => metric.value > 0);
}

function imageFilterBreakdown(filteredTotal: number, reasons?: ImageFilterReasons) {
  if (!reasons) {
    return [{
      label: '未保存（旧版合并统计）',
      description: '需要重新采集才能查看具体原因',
      value: filteredTotal,
      color: '#667085',
      background: '#f1f3f5',
    }];
  }

  const invalidSourceCount = reasons.missingSourceCount + reasons.inlineDataCount;
  const detailedTotal = invalidSourceCount
    + reasons.unsupportedFormatCount
    + reasons.tooSmallCount
    + reasons.duplicateUrlCount;
  const unclassifiedCount = Math.max(0, filteredTotal - detailedTotal);

  return [
    {
      label: '图片过小',
      description: '只排除真正微小的图片',
      value: reasons.tooSmallCount,
      color: '#52606d',
      background: '#eef1f4',
    },
    {
      label: '格式暂不支持',
      description: 'SVG、ICO 或无法识别的图片数据',
      value: reasons.unsupportedFormatCount,
      color: '#d13f45',
      background: '#fdecee',
    },
    {
      label: '无效图片地址',
      description: '缺少、过期、返回 400/404，或内嵌 data 图片',
      value: invalidSourceCount,
      color: '#b95d24',
      background: '#fff0e7',
    },
    {
      label: '其他未保存',
      description: '未能归入已有原因',
      value: unclassifiedCount,
      color: '#667085',
      background: '#f1f3f5',
    },
  ].filter(item => item.value > 0);
}
