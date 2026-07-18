import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../api';
import { theme } from '../theme';
import { Card } from '../components';
import type { CrawlSource, CrawlJob, SourceDistributionGroupKey, SourceDistributionSummary } from '../types';
import { SOURCE_TYPE_LABELS } from '../types';
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

const JOB_STATUS_LABEL: Record<string, string> = {
  pending: '排队中', discovering: '正在找文章', crawling: '正在下载',
  completed: '已完成', partial: '完成但需注意', failed: '失败',
};

type SourceOwnerKind = NonNullable<CrawlSource['sourceOwnerKind']>;

const OWNER_KIND_META: Array<{ key: SourceOwnerKind; label: string }> = [
  { key: 'university', label: '高校' },
  { key: 'research_institute', label: '科研机构' },
  { key: 'government', label: '政府机构' },
  { key: 'company', label: '企业' },
  { key: 'publisher_media', label: '出版与媒体' },
  { key: 'platform', label: '平台' },
  { key: 'other', label: '其他' },
];

type SourceOwnerGroup = {
  key: string;
  name: string;
  kind: SourceOwnerKind;
  sources: CrawlSource[];
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

function DistributionMetric({
  value,
  unit,
  percent,
  color,
}: {
  value: number;
  unit: string;
  percent: number;
  color: string;
}) {
  return (
    <span style={{ minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: theme.typography.size.base, fontWeight: 600 }}>
          {value.toLocaleString()} {unit}
        </span>
        <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
          {percent.toFixed(1)}%
        </span>
      </span>
      <span style={{ display: 'block', height: 3, marginTop: 5, borderRadius: 2, background: theme.colors.borderLight, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', background: color }} />
      </span>
    </span>
  );
}

export default function PoolPage() {
  const [sources, setSources] = useState<CrawlSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOwnerKind, setActiveOwnerKind] = useState<SourceOwnerKind | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [crawlState, setCrawlState] = useState<{
    sourceId: number;
    sourceName: string;
    jobId: number;
    status: string;
    totalCount: number;
    crawledCount: number;
    newCases: number;
    warning: string;
    error: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const [showUrlCrawl, setShowUrlCrawl] = useState(false);
  const [sourceDistribution, setSourceDistribution] = useState<SourceDistributionSummary | null>(null);
  const [distributionLoading, setDistributionLoading] = useState(true);
  const [distributionError, setDistributionError] = useState(false);
  const [activeDistributionGroup, setActiveDistributionGroup] = useState<SourceDistributionGroupKey | null>(null);
  const [recentJobs, setRecentJobs] = useState<CrawlJob[]>([]);
  const [batchStarting, setBatchStarting] = useState(false);
  const [operationMessage, setOperationMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPoolSources();
      setSources(res.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api.getCrawlJobs(12);
      if (mountedRef.current) setRecentJobs(res.data || []);
    } catch { /* 页面仍可继续使用 */ }
  }, []);

  useEffect(() => {
    loadJobs();
    const timer = setInterval(loadJobs, 5000);
    return () => clearInterval(timer);
  }, [loadJobs]);

  const loadSourceDistribution = useCallback(async () => {
    setDistributionLoading(true);
    try {
      const res = await api.getPoolDistribution();
      if (!mountedRef.current) return;
      if (res.success) {
        setSourceDistribution(res.data);
        setDistributionError(false);
      } else {
        setDistributionError(true);
      }
    } catch {
      if (mountedRef.current) setDistributionError(true);
    } finally {
      if (mountedRef.current) setDistributionLoading(false);
    }
  }, []);

  useEffect(() => { loadSourceDistribution(); }, [loadSourceDistribution]);

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
        warning: '',
        error: '',
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
            warning: job.warning,
            error: job.error,
          } : null);

          if (job.status === 'completed' || job.status === 'partial' || job.status === 'failed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            loadSources();
            loadJobs();
            loadSourceDistribution();
          }
        } catch {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setCrawlState(null);
        }
      }, 2000);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : '无法开始采集，请稍后重试。');
    }
  };

  const ownerGroups = useMemo<SourceOwnerGroup[]>(() => {
    const groups = new Map<string, SourceOwnerGroup>();
    sources.forEach(source => {
      const key = source.sourceOwnerKey || `source:${source.id}`;
      const kind = source.sourceOwnerKind || 'other';
      const existing = groups.get(key);
      if (existing) existing.sources.push(source);
      else groups.set(key, {
        key,
        name: source.sourceOwnerName || source.name,
        kind,
        sources: [source],
      });
    });
    return [...groups.values()]
      .map(group => ({ ...group, sources: [...group.sources].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }, [sources]);

  const filteredOwnerGroups = useMemo(() => ownerGroups
    .filter(group => !activeOwnerKind || group.kind === activeOwnerKind)
    .map(group => ({
      ...group,
      sources: activeDistributionGroup
        ? group.sources.filter(source => source.sourceDistributionGroup === activeDistributionGroup)
        : group.sources,
    }))
    .filter(group => group.sources.length > 0), [ownerGroups, activeOwnerKind, activeDistributionGroup]);

  const filteredSources = filteredOwnerGroups.flatMap(group => group.sources);
  const batchSources = activeOwnerKind || activeDistributionGroup
    ? filteredSources.filter(source => source.enabled && (source.crawlAvailability || 'auto') === 'auto')
    : [];

  const startBatchCrawl = async () => {
    if (!batchSources.length) {
      setOperationMessage('当前分组没有可自动采集的来源。');
      return;
    }
    const confirmed = window.confirm(
      `将依次更新 ${batchSources.length} 个来源。每个来源默认最多检查 30 篇文章，重复图片不会再次入库。是否继续？`,
    );
    if (!confirmed) return;
    setBatchStarting(true);
    setOperationMessage('');
    try {
      const res = await api.triggerBatchCrawl(batchSources.map(source => source.id), {
        mode: 'incremental',
        maxLinksPerSource: 30,
        maxPages: 5,
      });
      const queued = (res.data || []).filter(item => item.queued).length;
      setOperationMessage(`已将 ${queued} 个来源加入队列。你可以离开此页面，任务会继续运行。`);
      await loadJobs();
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : '批量采集启动失败。');
    } finally {
      setBatchStarting(false);
    }
  };

  const retryJob = async (job: CrawlJob) => {
    try {
      await api.retryCrawlJob(job.id);
      setOperationMessage(`“${job.sourceName || '该来源'}”已重新加入队列。`);
      await loadJobs();
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : '重试失败。');
    }
  };

  const ownerKindCounts = ownerGroups.reduce<Record<string, number>>((acc, group) => {
    acc[group.kind] = (acc[group.kind] || 0) + 1;
    return acc;
  }, {});
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
        <div style={{ display: 'flex', gap: 8 }}>
          {(activeOwnerKind || activeDistributionGroup) && <button
            onClick={startBatchCrawl}
            disabled={batchStarting || batchSources.length === 0}
            style={{
              padding: '8px 16px', borderRadius: theme.radius.md, border: 'none',
              cursor: batchStarting || batchSources.length === 0 ? 'not-allowed' : 'pointer',
              background: theme.colors.text.primary, color: theme.colors.bgCard,
              fontSize: theme.typography.size.sm, fontWeight: 600,
              opacity: batchStarting || batchSources.length === 0 ? 0.5 : 1,
            }}
          >
            {batchStarting ? '正在加入队列…' : `更新当前分组（${batchSources.length}）`}
          </button>}
          <button
            onClick={() => setShowUrlCrawl(true)}
            style={{
              padding: '6px 14px', borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`, cursor: 'pointer',
              background: theme.colors.bgCard, color: theme.colors.text.secondary,
              fontSize: theme.typography.size.sm, fontWeight: 500,
            }}
          >
            输入网址采集
          </button>
        </div>
      </div>

      {operationMessage && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: theme.radius.md,
          background: theme.colors.bgSubtle, color: theme.colors.text.secondary,
          fontSize: theme.typography.size.sm,
        }}>
          {operationMessage}
        </div>
      )}

      <Card padding={20} style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: theme.typography.size.lg, fontWeight: 600, color: theme.colors.text.primary }}>
              机构构成
            </div>
            {sourceDistribution && (
              <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.secondary }}>
                {sourceDistribution.totalSources.toLocaleString()} 家机构 · {sourceDistribution.totalMedia.toLocaleString()} 张关联媒体
              </div>
            )}
          </div>
          <div style={{ marginTop: 3, fontSize: theme.typography.size.sm, color: theme.colors.text.secondary }}>
            机构已合并同一组织下的不同采集入口。媒体按来源域名归属，每张只计算一次；点击一行可筛选下方机构。
          </div>
        </div>
        {distributionLoading ? (
          <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.tertiary }}>正在统计来源...</div>
        ) : distributionError || !sourceDistribution ? (
          <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.tertiary }}>
            暂时无法读取来源构成，来源列表的其他功能不受影响。
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 620 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) minmax(180px, 1fr) minmax(180px, 1fr)',
              gap: 16, padding: '0 12px 7px', color: theme.colors.text.tertiary,
              fontSize: theme.typography.size.xs, fontWeight: 600,
            }}>
              <span>机构类型</span><span>机构数量</span><span>媒体数量</span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {sourceDistribution.groups.map(group => {
                const active = activeDistributionGroup === group.key;
                return (
                  <button
                    key={group.key}
                    onClick={() => {
                      setActiveOwnerKind(null);
                      setActiveDistributionGroup(active ? null : group.key);
                    }}
                    style={{
                      display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) minmax(180px, 1fr) minmax(180px, 1fr)',
                      gap: 16, alignItems: 'center', width: '100%', padding: '10px 12px', textAlign: 'left',
                      borderRadius: theme.radius.md, border: `1px solid ${active ? theme.colors.accent : 'transparent'}`,
                      background: active ? theme.colors.accentBg : theme.colors.bgSubtle,
                      color: theme.colors.text.primary, cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: theme.typography.size.base, fontWeight: 600 }}>{group.label}</span>
                    <DistributionMetric value={group.sourceCount} unit="个" percent={group.sourcePercent} color="#6476d3" />
                    <DistributionMetric value={group.mediaCount} unit="张" percent={group.mediaPercent} color="#9b6bb5" />
                  </button>
                );
              })}
            </div>
            {sourceDistribution.unmatchedMedia > 0 && (
              <div style={{ marginTop: 9, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
                另有 {sourceDistribution.unmatchedMedia.toLocaleString()} 张媒体尚未匹配到启用来源，不计入上方媒体比例。
              </div>
            )}
            </div>
          </div>
        )}
      </Card>

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

      {recentJobs.length > 0 && (
        <Card padding={16} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.text.primary, marginBottom: 10 }}>
            最近采集任务
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recentJobs.slice(0, 6).map(job => {
              const needsAttention = job.status === 'partial' || job.status === 'failed';
              return (
                <div key={job.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '9px 10px', borderRadius: theme.radius.sm, background: theme.colors.bgSubtle,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.primary, fontWeight: 500 }}>
                      {job.sourceName || `来源 #${job.sourceId}`}
                    </div>
                    <div style={{ fontSize: theme.typography.size.xs, color: needsAttention ? '#966b12' : theme.colors.text.tertiary, marginTop: 2 }}>
                      {JOB_STATUS_LABEL[job.status] || job.status} · 检查 {job.crawledCount}/{job.totalCount} 篇 · 新增 {job.newCases} 张
                      {(job.warning || job.error) ? ` · ${job.warning || job.error}` : ''}
                    </div>
                  </div>
                  {needsAttention && (
                    <button onClick={() => retryJob(job)} style={{
                      flex: '0 0 auto', padding: '4px 9px', borderRadius: theme.radius.sm,
                      border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
                      color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, cursor: 'pointer',
                    }}>
                      重试更新
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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
              {crawlState.status === 'partial' && `采集已结束，但有内容需要注意。新增 ${crawlState.newCases} 张图片`}
              {crawlState.status === 'failed' && '采集失败'}
              {crawlState.status === 'pending' && '准备中...'}
            </div>
            {(crawlState.warning || crawlState.error) && (
              <div style={{
                marginBottom: 14, padding: 10, borderRadius: theme.radius.sm,
                background: '#fff4dc', color: '#7a5913', fontSize: theme.typography.size.xs, lineHeight: 1.5,
              }}>
                {crawlState.warning || crawlState.error}
              </div>
            )}
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
            {(crawlState.status === 'completed' || crawlState.status === 'partial' || crawlState.status === 'failed') && (
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
            onClick={() => {
              setActiveOwnerKind(null);
              setActiveDistributionGroup(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              borderRadius: theme.radius.sm,
              border: 'none',
              background: activeOwnerKind === null && activeDistributionGroup === null ? theme.colors.bgSubtle : 'transparent',
              color: activeOwnerKind === null && activeDistributionGroup === null ? theme.colors.text.primary : theme.colors.text.secondary,
              fontSize: theme.typography.size.sm,
              fontWeight: activeOwnerKind === null && activeDistributionGroup === null ? 600 : 400,
              cursor: 'pointer',
              marginBottom: 2,
            }}
          >
            全部 ({ownerGroups.length})
          </button>
          {OWNER_KIND_META.filter(item => ownerKindCounts[item.key]).map(item => (
            <button
              key={item.key}
              onClick={() => {
                setActiveOwnerKind(item.key);
                setActiveDistributionGroup(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: theme.radius.sm,
                border: 'none',
                background: activeOwnerKind === item.key ? theme.colors.bgSubtle : 'transparent',
                color: activeOwnerKind === item.key ? theme.colors.text.primary : theme.colors.text.secondary,
                fontSize: theme.typography.size.sm,
                fontWeight: activeOwnerKind === item.key ? 600 : 400,
                cursor: 'pointer',
                marginBottom: 2,
              }}
            >
              {item.label}
              <span style={{ color: theme.colors.text.tertiary, marginLeft: 4 }}>
                ({ownerKindCounts[item.key]})
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
            <div style={{ display: 'grid', gap: 20 }}>
              {filteredOwnerGroups.map(owner => (
                <section key={owner.key}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 2px 8px' }}>
                    <h2 style={{ margin: 0, fontSize: theme.typography.size.lg, fontWeight: 600, color: theme.colors.text.primary }}>
                      {owner.name}
                    </h2>
                    <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
                      {owner.sources.length} 个采集入口
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                  {owner.sources.map(source => (
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
                      立即更新
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
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
