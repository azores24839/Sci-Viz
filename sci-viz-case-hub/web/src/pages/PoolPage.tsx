import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { theme } from '../theme';
import { Card } from '../components';
import type { CrawlSource, CrawlJob } from '../types';
import { CATEGORY_LABELS, SOURCE_TYPE_LABELS } from '../types';
import UrlCrawlPage from './UrlCrawlPage';

function sourceTypeLabel(st: string): string {
  return SOURCE_TYPE_LABELS[st] || st.replace(/_/g, ' ');
}

const AVAILABILITY_META: Record<string, { label: string; bg: string; color: string }> = {
  auto: { label: '可自动抓', bg: '#e9f8ef', color: '#287a43' },
  needs_adapter: { label: '需适配', bg: '#fff4dc', color: '#966b12' },
  blocked: { label: '被阻断', bg: '#ffe8e8', color: '#a63a3a' },
  dead: { label: '入口失效', bg: '#eeeeF2', color: '#66616f' },
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export default function PoolPage() {
  const [sources, setSources] = useState<CrawlSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [crawlState, setCrawlState] = useState<{
    sourceId: number;
    sourceName: string;
    jobId: number;
    status: string;
    totalCount: number;
    crawledCount: number;
    newCases: number;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const [showUrlCrawl, setShowUrlCrawl] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPoolSources(activeCategory || undefined);
      setSources(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeCategory]);

  useEffect(() => { loadSources(); }, [loadSources]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startCrawl = async (source: CrawlSource) => {
    try {
      const res = await api.triggerCrawl(source.id);
      const jobId = res.data?.jobId;
      if (!jobId) return;

      setCrawlState({
        sourceId: source.id,
        sourceName: source.name,
        jobId,
        status: 'pending',
        totalCount: 0,
        crawledCount: 0,
        newCases: 0,
      });

      pollRef.current = setInterval(async () => {
        try {
          const jobRes = await api.getCrawlJob(jobId);
          if (!mountedRef.current) return;
          const job = jobRes.data as CrawlJob;
          setCrawlState(prev => prev ? {
            ...prev,
            status: job.status,
            totalCount: job.totalCount,
            crawledCount: job.crawledCount,
            newCases: job.newCases,
          } : null);

          if (job.status === 'completed' || job.status === 'failed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setTimeout(() => {
              setCrawlState(null);
              loadSources();
            }, 3000);
          }
        } catch {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setCrawlState(null);
        }
      }, 2000);
    } catch { /* ignore */ }
  };

  const filteredSources = activeCategory
    ? sources.filter(s => s.category === activeCategory)
    : sources;

  const categories = [...new Set(sources.map(s => s.category))].sort();
  const availabilityCounts = sources.reduce<Record<string, number>>((acc, source) => {
    const key = source.crawlAvailability || 'auto';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

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
          margin: 0,
        }}>
          来源池
        </h1>
        <button
          onClick={() => setShowUrlCrawl(true)}
          style={{
            padding: '6px 14px',
            borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`,
            cursor: 'pointer',
            background: theme.colors.bgCard,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.size.sm,
            fontWeight: 500,
          }}
        >
          URL 自动采集
        </button>
      </div>

      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}>
        {Object.entries(AVAILABILITY_META).map(([key, meta]) => (
          <span key={key} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            borderRadius: 6,
            background: meta.bg,
            color: meta.color,
            fontSize: theme.typography.size.xs,
            fontWeight: 600,
          }}>
            {meta.label}
            <span style={{ opacity: 0.72 }}>{availabilityCounts[key] || 0}</span>
          </span>
        ))}
      </div>

      {crawlState && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: theme.radius.xl,
            padding: 28,
            minWidth: 360,
            maxWidth: 420,
            boxShadow: theme.shadow.popover,
          }}>
            <h3 style={{
              fontSize: theme.typography.size.lg,
              fontWeight: 600,
              color: theme.colors.text.primary,
              marginBottom: 8,
            }}>
              {crawlState.sourceName}
            </h3>
            <div style={{
              fontSize: theme.typography.size.sm,
              color: theme.colors.text.secondary,
              marginBottom: 16,
            }}>
              {crawlState.status === 'discovering' && '正在发现文章链接...'}
              {crawlState.status === 'crawling' && `正在采集 ${crawlState.crawledCount}/${crawlState.totalCount} 篇文章`}
              {crawlState.status === 'completed' && `采集完成！入库 ${crawlState.newCases} 张图片`}
              {crawlState.status === 'failed' && '采集失败'}
              {crawlState.status === 'pending' && '准备中...'}
            </div>
            {(crawlState.status === 'discovering' || crawlState.status === 'crawling' || crawlState.status === 'pending') && (
              <div style={{
                width: '100%',
                height: 4,
                background: theme.colors.borderLight,
                borderRadius: 2,
                overflow: 'hidden',
                marginBottom: 12,
              }}>
                <div style={{
                  height: '100%',
                  width: crawlState.totalCount > 0
                    ? `${(crawlState.crawledCount / crawlState.totalCount) * 100}%`
                    : '30%',
                  background: theme.colors.accent,
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
            {(crawlState.status === 'completed' || crawlState.status === 'failed') && (
              <button
                onClick={() => setCrawlState(null)}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  borderRadius: theme.radius.md,
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.bgSubtle,
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.size.sm,
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            )}
          </div>
        </div>
      )}

      {showUrlCrawl && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 40,
        }}>
          <div style={{
            background: theme.colors.bgCard,
            borderRadius: theme.radius.xl,
            width: '90vw',
            maxWidth: 1100,
            maxHeight: 'calc(100vh - 80px)',
            overflow: 'auto',
            boxShadow: theme.shadow.popover,
            position: 'relative',
          }}>
            <button
              onClick={() => setShowUrlCrawl(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                fontSize: 18,
                color: theme.colors.text.tertiary,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: theme.radius.sm,
                zIndex: 10,
              }}
            >
              ✕
            </button>
            <div style={{ padding: 32 }}>
              <UrlCrawlPage />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{
          width: 160,
          flexShrink: 0,
          background: theme.colors.bgCard,
          borderRadius: theme.radius.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: 12,
          alignSelf: 'flex-start',
          position: 'sticky',
          top: 72,
        }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              borderRadius: theme.radius.sm,
              border: 'none',
              background: activeCategory === null ? theme.colors.bgSubtle : 'transparent',
              color: activeCategory === null ? theme.colors.text.primary : theme.colors.text.secondary,
              fontSize: theme.typography.size.sm,
              fontWeight: activeCategory === null ? 600 : 400,
              cursor: 'pointer',
              marginBottom: 2,
            }}
          >
            全部 ({sources.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: theme.radius.sm,
                border: 'none',
                background: activeCategory === cat ? theme.colors.bgSubtle : 'transparent',
                color: activeCategory === cat ? theme.colors.text.primary : theme.colors.text.secondary,
                fontSize: theme.typography.size.sm,
                fontWeight: activeCategory === cat ? 600 : 400,
                cursor: 'pointer',
                marginBottom: 2,
              }}
            >
              {cat}. {CATEGORY_LABELS[cat] || cat}
              <span style={{ color: theme.colors.text.tertiary, marginLeft: 4 }}>
                ({sources.filter(s => s.category === cat).length})
              </span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <Card style={{ textAlign: 'center', padding: 48, color: theme.colors.text.tertiary }}>
              加载中...
            </Card>
          ) : filteredSources.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 48, color: theme.colors.text.tertiary }}>
              暂无来源
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
              {filteredSources.map(source => (
                <div key={source.id} style={{
                  background: theme.colors.bgCard,
                  borderRadius: theme.radius.lg,
                  border: `1px solid ${theme.colors.border}`,
                  boxShadow: theme.shadow.card,
                  padding: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: theme.typography.size.base,
                        fontWeight: 600,
                        color: theme.colors.text.primary,
                        marginBottom: 2,
                      }}>
                        {source.name}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: '#f0f0f5',
                          color: '#6f6f7b',
                        }}>
                          {sourceTypeLabel(source.sourceType)}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          padding: '1px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: AVAILABILITY_META[source.crawlAvailability || 'auto']?.bg,
                          color: AVAILABILITY_META[source.crawlAvailability || 'auto']?.color,
                          whiteSpace: 'nowrap',
                        }}>
                          {AVAILABILITY_META[source.crawlAvailability || 'auto']?.label}
                        </span>
                        <span style={{
                          fontSize: 11,
                          color: theme.colors.text.tertiary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {(() => { try { return new URL(source.url).hostname; } catch { return source.url; } })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    fontSize: theme.typography.size.xs,
                    color: source.existingCases > 0 ? theme.colors.text.secondary : theme.colors.text.tertiary,
                    marginTop: 8,
                  }}>
                    {source.lastJob
                      ? `上次采集: ${timeAgo(source.lastJob.createdAt)} · 已入库 ${source.existingCases} 张`
                      : `从未采集${source.existingCases > 0 ? ` · 已有 ${source.existingCases} 张历史记录` : ' · 暂无入库照片'}`
                    }
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => setExpandedId(expandedId === source.id ? null : source.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: theme.radius.sm,
                        border: `1px solid ${theme.colors.border}`,
                        background: 'transparent',
                        color: theme.colors.text.secondary,
                        fontSize: theme.typography.size.xs,
                        cursor: 'pointer',
                      }}
                    >
                      {expandedId === source.id ? '收起' : '详情'}
                    </button>
                    <button
                      onClick={() => startCrawl(source)}
                      disabled={crawlState !== null}
                      style={{
                        padding: '4px 10px',
                        borderRadius: theme.radius.sm,
                        border: 'none',
                        background: crawlState !== null ? theme.colors.border : theme.colors.text.primary,
                        color: theme.colors.bgCard,
                        fontSize: theme.typography.size.xs,
                        fontWeight: 500,
                        cursor: crawlState !== null ? 'not-allowed' : 'pointer',
                        opacity: crawlState !== null ? 0.5 : 1,
                      }}
                    >
                      采集
                    </button>
                  </div>

                  {expandedId === source.id && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid ${theme.colors.borderLight}`,
                      fontSize: theme.typography.size.xs,
                      color: theme.colors.text.secondary,
                      lineHeight: 1.6,
                    }}>
                      {source.visualValue && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ color: theme.colors.text.tertiary, fontWeight: 600 }}>视觉价值 </span>
                          {source.visualValue}
                        </div>
                      )}
                      {source.strategyHint && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ color: theme.colors.text.tertiary, fontWeight: 600 }}>策略 </span>
                          {source.strategyHint}
                        </div>
                      )}
                      {source.notes && (
                        <div>
                          <span style={{ color: theme.colors.text.tertiary, fontWeight: 600 }}>备注 </span>
                          {source.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
