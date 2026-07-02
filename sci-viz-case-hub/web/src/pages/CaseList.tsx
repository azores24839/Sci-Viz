import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { VisualCase, Pagination, CrawlSource } from '../types';
import { REVIEW_STATUS_LABELS, MEDIA_TYPES, CONTENT_TYPES, DISCIPLINES, TECHNICAL_METHODS, DISTRIBUTION_MEDIUMS, FUNCTIONAL_PURPOSES, CAPTURE_TYPE_LABELS, CATEGORY_LABELS } from '../types';
import { theme } from '../theme';

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'approved', label: REVIEW_STATUS_LABELS.approved },
  { key: 'needs_review', label: REVIEW_STATUS_LABELS.needs_review },
  { key: 'low_confidence_review', label: REVIEW_STATUS_LABELS.low_confidence_review },
  { key: 'pending_ai_analysis', label: REVIEW_STATUS_LABELS.pending_ai_analysis },
  { key: 'analysis_failed', label: REVIEW_STATUS_LABELS.analysis_failed },
  { key: 'source_missing', label: REVIEW_STATUS_LABELS.source_missing },
  { key: 'rejected', label: REVIEW_STATUS_LABELS.rejected },
];

const DEFAULT_FILTERS: Record<string, string> = { review_status: 'approved' };
const CASE_BATCH_SIZE = 60;
const FILTER_PARAM_KEYS = [
  'review_status',
  'search',
  'source_name',
  'media_type',
  'content_type',
  'discipline',
  'technical_method',
  'distribution_medium',
  'functional_purpose',
  'capture_type',
  'ocr_status',
  'ai_status',
  'rating',
  'source_domain',
] as const;
const SCROLL_RESTORE_PREFIX = 'case-list-scroll:';

function filtersFromSearchParams(searchParams: URLSearchParams): Record<string, string> {
  const next: Record<string, string> = { ...DEFAULT_FILTERS };
  FILTER_PARAM_KEYS.forEach(key => {
    const value = searchParams.get(key);
    if (value) next[key] = value;
    else if (key === 'review_status' && searchParams.has(key)) delete next.review_status;
  });
  return next;
}

function pageFromSearchParams(searchParams: URLSearchParams): number {
  const parsed = Number.parseInt(searchParams.get('page') || '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function makeSearchParams(filters: Record<string, string>, page: number): URLSearchParams {
  const params = new URLSearchParams();
  FILTER_PARAM_KEYS.forEach(key => {
    const value = filters[key];
    if (value && !(key === 'review_status' && value === DEFAULT_FILTERS.review_status)) {
      params.set(key, value);
    }
  });
  if (page > 1) params.set('page', String(page));
  return params;
}

function makeCaseTitle(c: VisualCase): string {
  const caseTitle = c.caseTitle?.trim();
  if (caseTitle && !isSourceLikeTitle(caseTitle)) return trimTitle(caseTitle);
  const summaryTitle = firstMeaningfulSentence(c.aiSummary || c.contextText);
  if (summaryTitle) return trimTitle(summaryTitle);
  if (c.pageTitle) return c.pageTitle;
  if (c.title) return c.title;
  return '未命名';
}

function isSourceLikeTitle(text: string): boolean {
  return /封面\s*-\s*[A-Z][a-z]+ \d{4}/.test(text)
    || /^Nature.+Volume\s+\d+/i.test(text)
    || /^Nature.+Issue\s+\d+/i.test(text);
}

function firstMeaningfulSentence(text?: string): string {
  if (!text) return '';
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/Cover design by.*$/i, '')
    .replace(/Letter by.*$/i, '')
    .trim();
  const sentence = cleaned.match(/^.+?[。.!?](?:\s|$)/)?.[0] || cleaned;
  return sentence.replace(/[。.!?]\s*$/, '').trim();
}

function trimTitle(text: string): string {
  const hasHan = /[\u4e00-\u9fff]/.test(text);
  const maxLen = hasHan ? 28 : 72;
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function cleanSourceName(domain: string): string {
  let cleaned = domain.replace(/^www\./, '').replace(/\.[^.]+$/, '');
  if (cleaned.length <= 2) return domain.replace(/^www\./, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function makeSourceLine(c: VisualCase): string {
  if (c.sourceDomain) return cleanSourceName(c.sourceDomain);
  if (c.sourceUrl) {
    try {
      const hostname = new URL(c.sourceUrl).hostname;
      return cleanSourceName(hostname);
    } catch {
      return '缺少来源';
    }
  }
  return '缺少来源';
}

function makeCardMeta(c: VisualCase): string {
  return [makeSourceLine(c), c.discipline].filter(v => v && v !== '不确定').join(' · ');
}

function normalizePrimaryTag(value: string): string {
  if (value === '3D渲染') return '3D建模';
  return value;
}

function normalizeContentTypeLabel(value: string): string {
  if (value === '科研人员') return '单人肖像';
  return value;
}

function makeConceptTag(title: string): string {
  const text = title
    .replace(/[，。,.!?:：；;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (/[\u4e00-\u9fff]/.test(text)) return text.slice(0, 8);
  const match = text.match(/^(.+?)\s+(?:are|is|used|for|with|in|of|and)\b/i);
  return (match?.[1] || text).split(' ').slice(0, 4).join(' ');
}

function makeCardTags(c: VisualCase): string[] {
  const title = makeCaseTitle(c);
  const ordered = [
    c.functionalPurpose,
    c.distributionMedium,
    c.technicalMethod,
    c.contentType && c.contentType !== '科普传播' ? normalizeContentTypeLabel(c.contentType) : '',
    makeSourceLine(c),
    c.discipline,
    normalizePrimaryTag(c.mediaType),
    makeConceptTag(title),
  ].filter(v => v && v !== '不确定');

  return [...new Set(ordered)].slice(0, 6);
}

function imageCandidates(c: VisualCase): string[] {
  return [c.thumbnailPath, c.imagePath, c.imageUrl].filter(Boolean);
}

function sameImageUrl(currentSrc: string, candidate: string): boolean {
  try {
    const current = new URL(currentSrc, window.location.origin);
    const next = new URL(candidate, window.location.origin);
    return current.href === next.href;
  } catch {
    return currentSrc === candidate;
  }
}

const selectStyle: React.CSSProperties = {
  height: '34px',
  minWidth: '140px',
  maxWidth: '155px',
  padding: '0 28px 0 12px',
  borderRadius: '8px',
  border: `1px solid ${theme.colors.border}`,
  fontSize: '14px',
  color: theme.colors.text.secondary,
  background: theme.colors.bgCard,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236f6f7b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  cursor: 'pointer',
};

export default function CaseList() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const lastAppliedSearchRef = useRef(searchParams.toString());
  const applyingUrlChangeRef = useRef(false);
  const restoredScrollKeyRef = useRef<string | null>(null);
  const [cases, setCases] = useState<VisualCase[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(() => pageFromSearchParams(searchParams));
  const [filters, setFilters] = useState<Record<string, string>>(() => filtersFromSearchParams(searchParams));
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [facetCounts, setFacetCounts] = useState<Record<string, Record<string, number>>>({});
  const [poolSources, setPoolSources] = useState<CrawlSource[]>([]);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [managementMode, setManagementMode] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const sourceDropdownRef = useRef<HTMLDivElement>(null);

  const sourceNameSelected = new Set(
    (filters.source_name || '').split(',').filter(Boolean)
  );

  const sourceNameCounts: Record<string, number> = facetCounts.sourceName || {};
  const sourcesWithCases = poolSources.filter(source => (sourceNameCounts[source.name] || source.existingCases || 0) > 0);

  const sourceGroups: Record<string, CrawlSource[]> = {};
  sourcesWithCases.forEach(s => {
    if (!sourceGroups[s.category]) sourceGroups[s.category] = [];
    sourceGroups[s.category].push(s);
  });

  const categoryOrder = Object.keys(sourceGroups).sort();

  const toggleSource = (name: string) => {
    const selected = new Set((filters.source_name || '').split(',').filter(Boolean));
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    const value = [...selected].join(',');
    setPage(1);
    setFilters(f => {
      const next = { ...f };
      if (value) next.source_name = value;
      else delete next.source_name;
      return next;
    });
  };

  const toggleGroupSources = (names: string[], selectAll: boolean) => {
    const selected = new Set((filters.source_name || '').split(',').filter(Boolean));
    names.forEach(n => selectAll ? selected.add(n) : selected.delete(n));
    const value = [...selected].join(',');
    setPage(1);
    setFilters(f => {
      const next = { ...f };
      if (value) next.source_name = value;
      else delete next.source_name;
      return next;
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target as Node)) {
        setSourceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchCases = async () => {
    if (page === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      if (page > 1 && cases.length === 0) {
        const pages = Array.from({ length: page }, (_, index) => index + 1);
        const results = await Promise.all(
          pages.map(pageNumber => api.getCases({ ...filters, page: String(pageNumber), limit: String(CASE_BATCH_SIZE) }))
        );
        const successful = results.filter(res => res.success);
        setCases(successful.flatMap(res => res.data));
        const latestPagination = successful[successful.length - 1]?.pagination;
        if (latestPagination) setPagination(latestPagination);
      } else {
        const params: Record<string, string> = { ...filters, page: String(page), limit: String(CASE_BATCH_SIZE) };
        const res = await api.getCases(params);
        if (res.success) {
          setCases(prev => page === 1 ? res.data : [...prev, ...res.data]);
          if (res.pagination) setPagination(res.pagination);
        }
      }
    } catch {
      if (page === 1) setCases([]);
    }
    setLoading(false);
    setLoadingMore(false);
  };

  const fetchCounts = async () => {
    const statusKeys = STATUS_FILTERS.filter(s => s.key !== '').map(s => s.key);
    const results = await Promise.all(
      ['', ...statusKeys].map(
        async (status) => {
          const params: Record<string, string> = status ? { review_status: status, limit: '1' } : { limit: '1' };
          const res = await api.getCases(params);
          return { status, count: res.pagination?.total ?? 0 };
        }
      )
    );
    const counts: Record<string, number> = {};
    results.forEach(r => { counts[r.status || 'all'] = r.count; });
    setStatusCounts(counts);
  };

  const fetchFacetCounts = async () => {
    try {
      const res = await api.getFacetCounts(filters);
      if (res.success && res.data) setFacetCounts(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchCases(); }, [page, filters]);
  useEffect(() => { fetchCounts(); fetchFacetCounts(); }, [filters]);

  useEffect(() => {
    const currentSearch = searchParams.toString();
    if (currentSearch === lastAppliedSearchRef.current) return;
    applyingUrlChangeRef.current = true;
    lastAppliedSearchRef.current = currentSearch;
    setFilters(filtersFromSearchParams(searchParams));
    setPage(pageFromSearchParams(searchParams));
    setCases([]);
  }, [searchParams]);

  useEffect(() => {
    if (applyingUrlChangeRef.current) {
      applyingUrlChangeRef.current = false;
      return;
    }
    const nextParams = makeSearchParams(filters, page);
    const nextSearch = nextParams.toString();
    if (nextSearch !== searchParams.toString()) {
      lastAppliedSearchRef.current = nextSearch;
      setSearchParams(nextParams, { replace: true });
    }
  }, [filters, page, searchParams, setSearchParams]);

  useEffect(() => {
    if (loading || cases.length === 0) return;
    const key = `${SCROLL_RESTORE_PREFIX}${location.pathname}?${searchParams.toString()}`;
    if (restoredScrollKeyRef.current === key) return;
    const saved = sessionStorage.getItem(key);
    if (!saved) return;
    const y = Number.parseInt(saved, 10);
    if (!Number.isFinite(y) || y <= 0) return;
    restoredScrollKeyRef.current = key;
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [cases.length, loading, location.pathname, searchParams]);

  useEffect(() => {
    api.getPoolSources().then(res => {
      if (res.success) setPoolSources(res.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedCaseIds(new Set());
  }, [filters]);

  const setFilter = (key: string, value: string) => {
    setPage(1);
    setFilters(f => {
      const next = { ...f };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const toggleManagementMode = () => {
    setManagementMode(active => {
      if (active) setSelectedCaseIds(new Set());
      return !active;
    });
  };

  const toggleCaseSelection = (id: string) => {
    setSelectedCaseIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllLoaded = () => {
    setSelectedCaseIds(new Set(cases.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedCaseIds(new Set());
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedCaseIds);
    if (ids.length === 0 || bulkDeleting) return;
    const ok = window.confirm(`确定删除已选的 ${ids.length} 个案例吗？此操作会同时移除本地图片文件，无法在界面中撤销。`);
    if (!ok) return;

    setBulkDeleting(true);
    try {
      const res = await api.batchDeleteCases(ids);
      if (!res.success) {
        window.alert(res.error || '批量删除失败');
        return;
      }
      const deleted = res.data?.deleted ?? ids.length;
      const deletedIds = new Set(ids);
      setCases(prev => prev.filter(item => !deletedIds.has(item.id)));
      setSelectedCaseIds(new Set());
      setPagination(prev => {
        if (!prev) return prev;
        const total = Math.max(0, prev.total - deleted);
        return { ...prev, total, totalPages: Math.ceil(total / prev.limit) };
      });
      fetchCounts();
      fetchFacetCounts();
    } finally {
      setBulkDeleting(false);
    }
  };

  const activeFilterCount = Object.entries(filters)
    .filter(([key, value]) => value && !(key === 'review_status' && value === 'approved'))
    .length;

  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const handleImgError = (c: VisualCase) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const candidates = imageCandidates(c);
    const currentIndex = candidates.findIndex(candidate => sameImageUrl(img.src, candidate));
    const next = candidates.slice(currentIndex >= 0 ? currentIndex + 1 : 1).find(Boolean);
    if (next) {
      img.src = next;
    } else {
      setImgErrors(prev => new Set(prev).add(c.id));
    }
  };

  const quickFilters: Array<{ label: string; filters: Record<string, string> }> = [
    { label: 'Nature 封面', filters: { search: 'Nature', technical_method: '渲染' } },
    { label: 'Nature Photonics', filters: { search: 'Nature Photonics' } },
    { label: '视频案例', filters: { distribution_medium: '视频' } },
    { label: '3D建模', filters: { media_type: '3D渲染' } },
    { label: '机制图', filters: { content_type: '机制模型' } },
    { label: '显微图', filters: { media_type: '显微图' } },
    { label: '数据可视化', filters: { media_type: '数据可视化' } },
  ];

  const applyQuickFilter = (quick: Record<string, string>) => {
    setPage(1);
    setFilters({ ...DEFAULT_FILTERS, ...quick });
  };

  const rememberListPosition = () => {
    const key = `${SCROLL_RESTORE_PREFIX}${location.pathname}?${makeSearchParams(filters, page).toString()}`;
    sessionStorage.setItem(key, String(window.scrollY));
  };

  const displayedCount = cases.length;
  const totalCount = pagination?.total ?? 0;
  const canLoadMore = !!pagination && page < pagination.totalPages;
  const selectedCount = selectedCaseIds.size;
  const allLoadedSelected = cases.length > 0 && cases.every(item => selectedCaseIds.has(item.id));

  return (
    <div>
      <style>{`
        .case-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 14px;
        }
        @media (min-width: 1480px) {
          .case-grid { grid-template-columns: repeat(6, 1fr); }
        }
        @media (min-width: 1180px) and (max-width: 1479px) {
          .case-grid { grid-template-columns: repeat(5, 1fr); }
        }
        @media (max-width: 767px) {
          .case-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        }
        @media (max-width: 460px) {
          .case-grid { grid-template-columns: 1fr; }
        }
        .case-card:hover {
          box-shadow: ${theme.shadow.elevated};
          border-color: ${theme.colors.borderFocus};
          transform: translateY(-1px);
        }
        .case-card.is-selected {
          border-color: ${theme.colors.text.primary} !important;
          box-shadow: 0 0 0 2px rgba(30, 30, 35, 0.14), ${theme.shadow.card};
        }
        .case-card.is-managing {
          cursor: pointer;
        }
        .case-select-control {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 3;
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 30px;
          padding: 5px 8px 5px 6px;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.72);
          background: rgba(255, 255, 255, 0.94);
          box-shadow: ${theme.shadow.popover};
          color: ${theme.colors.text.primary};
          font-size: 11px;
          font-weight: 700;
        }
        .case-select-control input {
          width: 16px;
          height: 16px;
          margin: 0;
          accent-color: ${theme.colors.text.primary};
        }
        .case-card:hover .case-hover-meta {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .case-toolbar {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) minmax(150px, 190px) repeat(4, minmax(130px, 170px)) auto;
          gap: 10px;
          align-items: center;
          margin-bottom: 12px;
        }
        @media (max-width: 1180px) {
          .case-toolbar { grid-template-columns: minmax(260px, 1fr) repeat(3, minmax(130px, 1fr)); }
        }
        @media (max-width: 767px) {
          .case-toolbar { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 20,
        marginBottom: 18,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 13, color: theme.colors.text.secondary }}>
            浏览已经整理好的科研视觉案例，按主题、学科和视觉形式快速找到可复用灵感。
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 13, color: theme.colors.text.tertiary }}>
            已显示 {displayedCount || '-'} / {pagination?.total ?? '-'} 条 · 已入库 {statusCounts.approved ?? '-'} 条
          </div>
          <button
            onClick={toggleManagementMode}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 8,
              border: `1px solid ${managementMode ? theme.colors.text.primary : theme.colors.border}`,
              background: managementMode ? theme.colors.text.primary : theme.colors.bgCard,
              color: managementMode ? theme.colors.bgCard : theme.colors.text.secondary,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {managementMode ? '退出管理' : '管理'}
          </button>
        </div>
      </div>

      <div className="case-toolbar">
        <input
          value={filters.search || ''}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder="搜索主题、视觉关键词、期刊或用途"
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 8,
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.bgCard,
            color: theme.colors.text.primary,
            fontSize: 14,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ position: 'relative' }} ref={sourceDropdownRef}>
          <button
            onClick={() => setSourceDropdownOpen(o => !o)}
            style={{
              ...selectStyle,
              height: 38,
              width: '100%',
              maxWidth: 'none',
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sourceNameSelected.size > 0
              ? `已选择 ${sourceNameSelected.size} 个来源`
              : '全部来源'}
          </button>
          {sourceDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 4,
              zIndex: 100,
              background: theme.colors.bgCard,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 10,
              boxShadow: theme.shadow.popover,
              width: 300,
              maxHeight: 400,
              overflowY: 'auto',
              padding: '8px 0',
            }}>
              {categoryOrder.map(cat => {
                const groupSources = sourceGroups[cat] || [];
                if (groupSources.length === 0) return null;
                const groupNames = groupSources.map(s => s.name);
                const groupCaseCount = groupNames.reduce((sum, n) => sum + (sourceNameCounts[n] || 0), 0);
                const allSelected = groupNames.length > 0 && groupNames.every(n => sourceNameSelected.has(n));
                const someSelected = groupNames.some(n => sourceNameSelected.has(n));
                const categoryLabel = CATEGORY_LABELS[cat] || cat;
                return (
                  <div key={cat}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 14px',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      color: theme.colors.text.primary,
                    }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                        onChange={() => toggleGroupSources(groupNames, !allSelected)}
                        style={{ margin: 0, accentColor: theme.colors.text.primary }}
                      />
                      <span>{cat}. {categoryLabel}</span>
                      <span style={{ color: theme.colors.text.tertiary, fontSize: 12, fontWeight: 400 }}>
                        ({groupCaseCount})
                      </span>
                    </label>
                    {groupSources.map(s => {
                      const name = s.name;
                      if (!name) return null;
                      const checked = sourceNameSelected.has(name);
                      return (
                        <label
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 14px 3px 34px',
                            cursor: 'pointer',
                            fontSize: 13,
                            color: theme.colors.text.secondary,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSource(name)}
                            style={{ margin: 0, accentColor: theme.colors.text.primary }}
                          />
                          <span>{name}{sourceNameCounts[name] ? ` (${sourceNameCounts[name]})` : ''}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <select value={filters.media_type || ''} onChange={(e) => setFilter('media_type', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部图像类型</option>
          {MEDIA_TYPES.map(t => {
            const count = facetCounts.mediaType?.[t];
            return <option key={t} value={t}>{t === '3D渲染' ? '3D建模' : t}{count !== undefined ? ` (${count})` : ''}</option>;
          })}
        </select>
        <select value={filters.content_type || ''} onChange={(e) => setFilter('content_type', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部内容主题</option>
          {CONTENT_TYPES.map(t => {
            const count = facetCounts.contentType?.[t];
            return <option key={t} value={t}>{t}{count !== undefined ? ` (${count})` : ''}</option>;
          })}
        </select>
        <select value={filters.discipline || ''} onChange={(e) => setFilter('discipline', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部学科</option>
          {DISCIPLINES.map(t => {
            const count = facetCounts.discipline?.[t];
            return <option key={t} value={t}>{t}{count !== undefined ? ` (${count})` : ''}</option>;
          })}
        </select>
        <select value={filters.technical_method || ''} onChange={(e) => setFilter('technical_method', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部技术手段</option>
          {TECHNICAL_METHODS.map(t => {
            const count = facetCounts.technicalMethod?.[t];
            return <option key={t} value={t}>{t}{count !== undefined ? ` (${count})` : ''}</option>;
          })}
        </select>
        <select value={filters.distribution_medium || ''} onChange={(e) => setFilter('distribution_medium', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部传播媒介</option>
          {DISTRIBUTION_MEDIUMS.map(t => {
            const count = facetCounts.distributionMedium?.[t];
            return <option key={t} value={t}>{t}{count !== undefined ? ` (${count})` : ''}</option>;
          })}
        </select>
        <select value={filters.functional_purpose || ''} onChange={(e) => setFilter('functional_purpose', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部功能维度</option>
          {FUNCTIONAL_PURPOSES.map(t => {
            const count = facetCounts.functionalPurpose?.[t];
            return <option key={t} value={t}>{t}{count !== undefined ? ` (${count})` : ''}</option>;
          })}
        </select>
        <button
          onClick={() => setAdvancedOpen(o => !o)}
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 8,
            border: `1px solid ${advancedOpen || activeFilterCount > 0 ? theme.colors.text.primary : theme.colors.border}`,
            background: advancedOpen ? theme.colors.text.primary : theme.colors.bgCard,
            color: advancedOpen ? theme.colors.bgCard : theme.colors.text.secondary,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          更多筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: advancedOpen ? 12 : 22 }}>
        {quickFilters.map(q => (
          <button
            key={q.label}
            onClick={() => applyQuickFilter(q.filters)}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 9999,
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.bgCard,
              color: theme.colors.text.secondary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {q.label}
          </button>
        ))}
        {(activeFilterCount > 0 || filters.review_status !== 'approved') && (
          <button
            onClick={resetFilters}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 9999,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent',
              color: theme.colors.text.tertiary,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            清除
          </button>
        )}
      </div>

      {advancedOpen && (
        <div style={{
          background: theme.colors.bgCard,
          border: `1px solid ${theme.colors.borderLight}`,
          borderRadius: theme.radius.lg,
          padding: 14,
          marginBottom: 22,
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {STATUS_FILTERS.map(sf => {
              const count = statusCounts[sf.key || 'all'];
              const active = sf.key === (filters.review_status || '');
              return (
                <button
                  key={sf.key}
                  onClick={() => setFilter('review_status', sf.key)}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 9999,
                    border: `1px solid ${active ? theme.colors.text.primary : theme.colors.border}`,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 500,
                    background: active ? theme.colors.text.primary : theme.colors.bgCard,
                    color: active ? theme.colors.bgCard : theme.colors.text.secondary,
                  }}
                >
                  {sf.label}{count !== undefined ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={filters.capture_type || ''} onChange={(e) => setFilter('capture_type', e.target.value)} style={selectStyle}>
              <option value="">全部采集方式</option>
              {Object.entries(CAPTURE_TYPE_LABELS).map(([k, v]) => {
                const count = facetCounts.captureType?.[k];
                return <option key={k} value={k}>{v}{count !== undefined ? ` (${count})` : ''}</option>;
              })}
            </select>
            <select value={filters.ocr_status || ''} onChange={(e) => setFilter('ocr_status', e.target.value)} style={selectStyle}>
              <option value="">全部OCR状态</option>
              <option value="has_text">已识别文字</option>
              <option value="no_text">无OCR文字</option>
            </select>
          </div>
        </div>
      )}

      {managementMode && (
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${theme.colors.border}`,
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow: theme.shadow.card,
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: theme.colors.text.primary }}>
              已选 {selectedCount} 项
            </strong>
            <span style={{ fontSize: 12, color: theme.colors.text.tertiary }}>
              当前已加载 {displayedCount} 条
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={allLoadedSelected ? clearSelection : selectAllLoaded}
              disabled={cases.length === 0}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.bgCard,
                color: cases.length === 0 ? theme.colors.text.tertiary : theme.colors.text.secondary,
                cursor: cases.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {allLoadedSelected ? '取消全选' : '全选当前页'}
            </button>
            {selectedCount > 0 && (
              <button
                onClick={clearSelection}
                style={{
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: `1px solid ${theme.colors.border}`,
                  background: 'transparent',
                  color: theme.colors.text.tertiary,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                清空选择
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={selectedCount === 0 || bulkDeleting}
              style={{
                height: 32,
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid #d14a3a',
                background: selectedCount === 0 || bulkDeleting ? '#f8e5e1' : '#c7372f',
                color: selectedCount === 0 || bulkDeleting ? '#a8756c' : '#fff',
                cursor: selectedCount === 0 || bulkDeleting ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {bulkDeleting ? '删除中...' : '删除所选'}
            </button>
          </div>
        </div>
      )}

      {loading && cases.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
          color: theme.colors.text.tertiary,
          fontSize: 13,
          gap: 8,
        }}>
          <span style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: `2px solid ${theme.colors.border}`,
            borderTopColor: theme.colors.text.tertiary,
            animation: 'spin 0.6s linear infinite',
            display: 'inline-block',
          }} />
          加载中...
          <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
        </div>
      )}

      <div className="case-grid">
        {cases.map((c) => {
          const title = makeCaseTitle(c);
          const tags = makeCardTags(c);
          const selected = selectedCaseIds.has(c.id);
          return (
          <Link
            to={managementMode ? '#' : `/cases/${c.id}`}
            state={{ from: `${location.pathname}${location.search}` }}
            onClick={(e) => {
              if (managementMode) {
                e.preventDefault();
                toggleCaseSelection(c.id);
                return;
              }
              rememberListPosition();
            }}
            key={c.id}
            className={`case-card${managementMode ? ' is-managing' : ''}${selected ? ' is-selected' : ''}`}
            aria-selected={managementMode ? selected : undefined}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              background: theme.colors.bgCard,
              borderRadius: 8,
              border: `1px solid ${theme.colors.borderLight}`,
              boxShadow: theme.shadow.card,
              overflow: 'hidden',
              transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.15s',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}
          >
            <div style={{
              height: 170,
              background: theme.colors.bgSubtle,
              overflow: 'hidden',
              position: 'relative',
            }}>
              {imgErrors.has(c.id) ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.colors.text.tertiary, fontSize: 13 }}>
                  加载失败
                </div>
              ) : imageCandidates(c).length > 0 ? (
                <img
                  src={imageCandidates(c)[0]}
                  alt={title}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={handleImgError(c)}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.colors.text.tertiary, fontSize: 13 }}>
                  无图片
                </div>
              )}
              {managementMode && (
                <label
                  className="case-select-control"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleCaseSelection(c.id)}
                    aria-label={`选择案例：${title}`}
                  />
                  <span>{selected ? '已选' : '选择'}</span>
                </label>
              )}
              {c.captureType === 'video' && !imgErrors.has(c.id) && (
                <div style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                    <polygon points="6,3 20,12 6,21" />
                  </svg>
                </div>
              )}
              <div
                className="case-hover-meta"
                style={{
                  position: 'absolute',
                  left: 8,
                  right: 8,
                  bottom: 8,
                  opacity: 0,
                  pointerEvents: 'none',
                  transform: 'translateY(4px)',
                  transition: 'opacity 0.15s, transform 0.15s',
                  borderRadius: 8,
                  padding: '7px 8px',
                  background: 'rgba(255, 255, 255, 0.94)',
                  border: `1px solid ${theme.colors.borderLight}`,
                  boxShadow: theme.shadow.popover,
                }}
              >
                <div style={{
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: theme.colors.text.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {REVIEW_STATUS_LABELS[c.reviewStatus] || c.reviewStatus || '未标记'}
                  {c.rating ? ` · ${c.rating}分` : ''}
                  {c.technicalMethod && c.technicalMethod !== '不确定' ? ` · ${c.technicalMethod}` : ''}
                </div>
                <div style={{
                  display: 'flex',
                  gap: 4,
                  flexWrap: 'wrap',
                  marginTop: 5,
                  maxHeight: 42,
                  overflow: 'hidden',
                }}>
                  {tags.map(tag => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        lineHeight: '16px',
                        padding: '0 6px',
                        borderRadius: 9999,
                        background: theme.colors.bgSubtle,
                        border: `1px solid ${theme.colors.borderLight}`,
                        color: theme.colors.text.secondary,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{
              padding: '9px 10px 10px',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}>
              <div style={{
                fontWeight: 600,
                fontSize: 13,
                color: theme.colors.text.primary,
                lineHeight: 1.35,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {title}
              </div>

              <div style={{
                fontSize: 11,
                color: theme.colors.text.secondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: 5,
              }}>
                {makeCardMeta(c)}
              </div>

              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                marginTop: 7,
                height: 18,
                overflow: 'hidden',
              }}>
                {tags.slice(0, 2).map(tag => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 10,
                      lineHeight: '16px',
                      padding: '0 6px',
                      borderRadius: 9999,
                      background: theme.colors.bgSubtle,
                      border: `1px solid ${theme.colors.borderLight}`,
                      color: theme.colors.text.secondary,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Link>
          );
        })}
      </div>

      {!loading && cases.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 60,
          color: theme.colors.text.tertiary,
          fontSize: 14,
        }}>
          暂无案例数据
        </div>
      )}

      {pagination && pagination.total > 0 && (
        <div style={{
          marginTop: 28,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          flexDirection: 'column',
        }}>
          <span style={{ fontSize: 13, color: theme.colors.text.tertiary }}>
            已显示 {displayedCount} / {totalCount} 条
          </span>
          {canLoadMore && (
            <button
              disabled={loadingMore}
              onClick={() => setPage(p => p + 1)}
              style={{
                height: 38,
                padding: '0 18px',
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.border}`,
                cursor: loadingMore ? 'wait' : 'pointer',
                background: theme.colors.bgCard,
                color: theme.colors.text.secondary,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {loadingMore ? '加载中...' : '加载更多'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
