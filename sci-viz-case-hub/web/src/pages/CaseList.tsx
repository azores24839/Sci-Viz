import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { VisualCase, Pagination, CrawlSource } from '../types';
import { REVIEW_STATUS_LABELS, MEDIA_TYPES, CONTENT_TYPES, DISCIPLINES, VISUAL_STYLES, CAPTURE_TYPE_LABELS, CATEGORY_LABELS } from '../types';
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
  'visual_style',
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
    normalizePrimaryTag(c.mediaType),
    c.visualStyle === '顶刊封面' ? '期刊封面' : '',
    c.contentType && c.contentType !== '科普传播' ? normalizeContentTypeLabel(c.contentType) : '',
    makeSourceLine(c),
    c.discipline,
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
    { label: 'Nature 封面', filters: { search: 'Nature', visual_style: '顶刊封面' } },
    { label: 'Nature Photonics', filters: { search: 'Nature Photonics' } },
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
        <div style={{ fontSize: 13, color: theme.colors.text.tertiary }}>
          已显示 {displayedCount || '-'} / {pagination?.total ?? '-'} 条 · 已入库 {statusCounts.approved ?? '-'} 条
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
        <select value={filters.visual_style || ''} onChange={(e) => setFilter('visual_style', e.target.value)} style={{ ...selectStyle, height: 38, maxWidth: 'none' }}>
          <option value="">全部视觉风格</option>
          {VISUAL_STYLES.map(t => {
            const count = facetCounts.visualStyle?.[t];
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
          return (
          <Link
            to={`/cases/${c.id}`}
            state={{ from: `${location.pathname}${location.search}` }}
            onClick={rememberListPosition}
            key={c.id}
            className="case-card"
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
                  {c.visualStyle && c.visualStyle !== '不确定' ? ` · ${c.visualStyle}` : ''}
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
