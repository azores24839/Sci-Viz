import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import type { VisualCase, ReviewStatus } from '../types';
import { REVIEW_STATUS_LABELS } from '../types';
import { theme } from '../theme';
import { StatusBadge, StarRating, Card } from '../components';

interface QueuePanel {
  key: string;
  label: string;
  count: number;
  description: string;
}

const PANEL_MAP: Record<string, { status: string; ocrEmpty?: boolean }> = {
  pending_quality: { status: 'pending_ai_analysis' },
  pending_ocr: { status: 'pending_ai_analysis', ocrEmpty: true },
  pending_classify: { status: 'pending_ai_analysis' },
  needs_review: { status: 'needs_review' },
  low_confidence: { status: 'low_confidence_review' },
  approved: { status: 'approved' },
  failed: { status: 'analysis_failed' },
};

function normalizeContentTypeLabel(value: string): string {
  if (value === '科研人员') return '单人肖像';
  return value;
}

const QUEUE_CONFIG: Record<string, {
  label: string;
  description: string;
  taskReason: string;
  accent?: string;
  accentBg?: string;
  accentBorder?: string;
  deEmphasized?: boolean;
}> = {
  pending_quality: {
    label: '待质检',
    description: '等待系统自动检查图片质量',
    taskReason: '等待系统自动检查图片质量',
  },
  pending_ocr: {
    label: '待 OCR',
    description: '等待系统自动进行 OCR 识别',
    taskReason: 'OCR 缺失，等待处理',
  },
  pending_classify: {
    label: '待分类',
    description: '等待系统自动进行分类',
    taskReason: '等待系统自动分类',
  },
  needs_review: {
    label: '待确认',
    description: 'AI 已完成分析，请人工确认后入库',
    taskReason: 'AI 已完成分析，等待确认',
    accent: theme.colors.orange,
    accentBg: theme.colors.orangeBg,
    accentBorder: theme.colors.orangeBorder,
  },
  low_confidence: {
    label: '重点复核',
    description: 'AI 结果低置信或不完整，需要人工重点判断',
    taskReason: '分类结果低置信，需要人工复核',
    accent: theme.colors.yellow,
    accentBg: theme.colors.yellowBg,
    accentBorder: theme.colors.yellowBorder,
  },
  approved: {
    label: '已入库',
    description: '已通过审核，可在案例库查看',
    taskReason: '已通过审核',
    deEmphasized: true,
  },
  failed: {
    label: '处理失败',
    description: '下载、OCR 或分析过程中失败，需要重试或人工处理',
    taskReason: '处理过程中发生错误',
    accent: theme.colors.purple,
    accentBg: theme.colors.purpleBg,
    accentBorder: theme.colors.purpleBorder,
  },
};

const QUEUE_ACTIONS: Record<string, Array<{ label: string; action: 'approve' | 'reject' | 'reanalyze'; primary?: boolean }>> = {
  pending_quality: [{ label: '重新处理', action: 'reanalyze' }],
  pending_ocr: [{ label: '重新处理', action: 'reanalyze' }],
  pending_classify: [{ label: '重新处理', action: 'reanalyze' }],
  needs_review: [
    { label: '确认入库', action: 'approve', primary: true },
    { label: '标记异常', action: 'reject' },
  ],
  low_confidence: [
    { label: '确认入库', action: 'approve', primary: true },
    { label: '拒绝', action: 'reject' },
    { label: '重新分析', action: 'reanalyze' },
  ],
  approved: [],
  failed: [
    { label: '重试', action: 'reanalyze', primary: true },
    { label: '标记异常', action: 'reject' },
  ],
};

export default function ReviewPage() {
  const [panels, setPanels] = useState<QueuePanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [cases, setCases] = useState<VisualCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [batchType, setBatchType] = useState<'quality' | 'ocr' | 'classify' | null>(null);
  const [batchResult, setBatchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [approving, setApproving] = useState(false);
  const [batchElapsed, setBatchElapsed] = useState(0);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchStartRef = useRef(0);
  const taskListRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.getQueueStatus();
      if (res.success) setPanels(res.data.panels);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current);
    };
  }, []);

  const fetchPanelCases = useCallback(async (key: string) => {
    setCasesLoading(true);
    setActivePanel(key);
    const config = PANEL_MAP[key];
    if (!config) { setCasesLoading(false); return; }
    const params: Record<string, string> = { limit: '50' };
    if (config.status === 'analysis_failed') {
      params.review_status = 'analysis_failed,source_missing';
    } else {
      params.review_status = config.status;
    }
    if (config.ocrEmpty) {
      params.ocr_status = 'empty';
    }
    try {
      const res = await api.getCases(params);
      if (res.success) setCases(res.data);
    } catch { /* ignore */ }
    setCasesLoading(false);
  }, []);

  const runBatch = async (type: 'quality' | 'ocr' | 'classify') => {
    setBatchType(type);
    setBatchResult(null);
    setBatchElapsed(0);
    batchStartRef.current = Date.now();
    batchTimerRef.current = setInterval(() => {
      setBatchElapsed(Math.round((Date.now() - batchStartRef.current) / 1000));
    }, 1000);

    try {
      let res: any;
      if (type === 'quality') res = await api.batchQualityCheck();
      else if (type === 'ocr') res = await api.batchOcr();
      else res = await api.batchClassify();

      if (batchTimerRef.current) clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;

      if (res?.success) {
        const s = res.summary;
        let msg = '';
        if (type === 'quality') msg = `完成：${s.ok ?? 0} 张合格，${s.broken ?? 0} 张损坏，${s.lowQuality ?? 0} 张低质`;
        else if (type === 'ocr') msg = `完成：${s.updated ?? 0} 张已识别，${s.skipped ?? 0} 张跳过，${s.failed ?? 0} 张失败`;
        else msg = `完成：${s.classified ?? 0} 张已分类，${s.skipped ?? 0} 张跳过，${s.failed ?? 0} 张失败`;
        const elapsed = Math.round((Date.now() - batchStartRef.current) / 1000);
        msg += ` · 耗时 ${elapsed}s`;
        setBatchResult({ success: true, message: msg });
        await fetchStatus();
        if (activePanel) fetchPanelCases(activePanel);
      } else {
        setBatchResult({ success: false, message: res?.error || '操作失败' });
      }
    } catch (e: any) {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
      setBatchResult({ success: false, message: e.message || '操作异常' });
    }
    setBatchType(null);
    setTimeout(() => setBatchResult(null), 10000);
  };

  const handleAction = async (caseId: string, action: 'approve' | 'reject' | 'reanalyze') => {
    if (action === 'approve') {
      await api.updateCase(caseId, { reviewStatus: 'approved' as ReviewStatus } as any);
      setCases(prev => prev.filter(c => c.id !== caseId));
    } else if (action === 'reject') {
      await api.updateCase(caseId, { reviewStatus: 'rejected' as ReviewStatus } as any);
      setCases(prev => prev.filter(c => c.id !== caseId));
    } else {
      await api.reanalyze(caseId);
    }
    fetchStatus();
  };

  const switchToPanel = (key: string) => {
    fetchPanelCases(key);
    setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const imageCandidates = (c: VisualCase) => [c.thumbnailPath, c.imagePath, c.imageUrl].filter(Boolean);

  const handleImageError = (c: VisualCase) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const candidates = imageCandidates(c);
    const currentIndex = candidates.findIndex(cand => {
      try { return new URL(img.src).href === new URL(cand, window.location.origin).href; }
      catch { return img.src === cand; }
    });
    const next = candidates.slice(Math.max(0, currentIndex) + 1).find(Boolean);
    if (next) img.src = next; else img.style.display = 'none';
  };

  const panelCount = (key: string) => panels.find(p => p.key === key)?.count ?? 0;
  const pendingTotal = panels.filter(p => p.key !== 'approved').reduce((s, p) => s + p.count, 0);
  const needsReviewCount = panelCount('needs_review');
  const lowConfidenceCount = panelCount('low_confidence');

  const queueConfig = activePanel ? QUEUE_CONFIG[activePanel] : null;
  const queueActions = activePanel ? (QUEUE_ACTIONS[activePanel] ?? []) : [];
  const queueCount = activePanel ? panelCount(activePanel) : 0;

  const autoActions = [
    { type: 'quality' as const, label: '开始图片质检', panelKey: 'pending_quality' },
    { type: 'ocr' as const, label: '开始 OCR', panelKey: 'pending_ocr' },
    { type: 'classify' as const, label: '开始分类', panelKey: 'pending_classify' },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: theme.colors.text.tertiary }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      {/* ═══════ Header ═══════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: theme.typography.size['3xl'], fontWeight: 600, color: theme.colors.text.primary, letterSpacing: '-0.03em' }}>
            处理工作台
          </h1>
          <p style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.tertiary, marginTop: 2 }}>
            管理从采集到入库的中间处理流程
          </p>
        </div>
        <button onClick={() => { fetchStatus(); if (activePanel) fetchPanelCases(activePanel); }}
          style={{
            padding: '6px 14px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`,
            cursor: 'pointer', background: theme.colors.bgCard, color: theme.colors.text.secondary,
            fontSize: theme.typography.size.sm, fontWeight: 500,
          }}>
          刷新
        </button>
      </div>

      {/* ═══════ Section 1: Processing Summary ═══════ */}
      <div style={{
        background: `linear-gradient(135deg, ${theme.colors.accentBg} 0%, #f4f4ff 100%)`,
        borderRadius: theme.radius.xl,
        border: `1px solid ${theme.colors.accentBorder}`,
        padding: '24px 28px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.tertiary, marginBottom: 2 }}>
              当前待处理
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, color: theme.colors.text.primary, lineHeight: 1.1 }}>
              {pendingTotal}
              <span style={{ fontSize: theme.typography.size.base, fontWeight: 400, color: theme.colors.text.secondary, marginLeft: 6 }}>条</span>
            </div>
            <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.secondary, marginTop: 8, lineHeight: 1.8 }}>
              {panels.filter(p => p.key !== 'approved').map(p => {
                const cfg = QUEUE_CONFIG[p.key];
                return `${cfg?.label || p.label} ${p.count}`;
              }).join(' · ')}
            </div>
          </div>
          {(needsReviewCount > 0 || lowConfidenceCount > 0) && (
            <div style={{ flex: '1 1 280px', maxWidth: 420 }}>
              <div style={{
                background: theme.colors.bgCard,
                borderRadius: theme.radius.lg,
                padding: '16px 20px',
                border: `1px solid ${theme.colors.yellowBorder}`,
              }}>
                <div style={{ fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.text.primary, marginBottom: 4 }}>
                  当前最需要你处理的是：
                </div>
                <div style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.secondary, marginBottom: 12 }}>
                  {[
                    needsReviewCount > 0 ? `${needsReviewCount} 条待确认` : null,
                    lowConfidenceCount > 0 ? `${lowConfidenceCount} 条重点复核` : null,
                  ].filter(Boolean).join(' 和 ')}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {needsReviewCount > 0 && (
                    <button onClick={() => switchToPanel('needs_review')}
                      style={{
                        padding: '8px 16px', borderRadius: theme.radius.md,
                        background: theme.colors.accent, color: '#fff',
                        border: 'none', fontSize: theme.typography.size.sm,
                        fontWeight: 600, cursor: 'pointer',
                      }}>
                      去处理待确认（{needsReviewCount}）
                    </button>
                  )}
                  {lowConfidenceCount > 0 && (
                    <button onClick={() => switchToPanel('low_confidence')}
                      style={{
                        padding: '8px 16px', borderRadius: theme.radius.md,
                        background: theme.colors.yellowBg, color: theme.colors.yellow,
                        border: `1px solid ${theme.colors.yellowBorder}`,
                        fontSize: theme.typography.size.sm,
                        fontWeight: 600, cursor: 'pointer',
                      }}>
                      去处理重点复核（{lowConfidenceCount}）
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ Section 2: Auto Processing Zone ═══════ */}
      <div style={{
        background: theme.colors.bgCard,
        borderRadius: theme.radius.lg,
        border: `1px solid ${batchType ? theme.colors.accentBorder : theme.colors.border}`,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: theme.shadow.card,
        transition: 'border-color 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: theme.typography.size.lg, fontWeight: 600, color: theme.colors.text.primary }}>
            自动处理
          </span>
          <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
            系统可自动执行，完成后会自动进入下一阶段
          </span>
        </div>
        {/* Running indicator */}
        {batchType && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', marginBottom: 12,
            borderRadius: theme.radius.md,
            background: theme.colors.accentBg,
            border: `1px solid ${theme.colors.accentBorder}`,
          }}>
            <span style={{
              display: 'inline-block', width: 16, height: 16,
              border: `2px solid ${theme.colors.accentBorder}`,
              borderTopColor: theme.colors.accent,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <div>
              <div style={{ fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.accent }}>
                正在执行{batchType === 'quality' ? '图片质检' : batchType === 'ocr' ? 'OCR 识别' : '智能分类'}...
              </div>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, marginTop: 1 }}>
                已用时 {batchElapsed}s{batchElapsed > 15 ? ' · 大批量任务可能需要较长时间，请耐心等待' : ''}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {autoActions.map(action => {
            const count = panelCount(action.panelKey);
            const isRunning = batchType === action.type;
            const isDisabled = batchType !== null;
            return (
              <button
                key={action.type}
                onClick={() => runBatch(action.type)}
                disabled={isDisabled}
                style={{
                  padding: '8px 16px',
                  borderRadius: theme.radius.md,
                  border: `1px solid ${isRunning ? theme.colors.accentBorder : theme.colors.border}`,
                  background: isRunning ? theme.colors.accentBg : theme.colors.bgCard,
                  color: isRunning ? theme.colors.accent : (isDisabled ? theme.colors.text.disabled : theme.colors.text.primary),
                  fontSize: theme.typography.size.sm,
                  fontWeight: 500,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isDisabled && !isRunning ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {isRunning ? '处理中...' : `${action.label}（${count}）`}
              </button>
            );
          })}
        </div>
        {(needsReviewCount > 0 || lowConfidenceCount > 0) && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${theme.colors.borderLight}` }}>
            <button
              onClick={async () => {
                setApproving(true);
                setBatchResult(null);
                try {
                  const res = await api.batchApprove();
                  if (res.success) {
                    setBatchResult({ success: true, message: `已批量入库 ${res.data.approved} 条案例` });
                    await fetchStatus();
                    if (activePanel) fetchPanelCases(activePanel);
                  } else {
                    setBatchResult({ success: false, message: res.error || '操作失败' });
                  }
                } catch (e: any) {
                  setBatchResult({ success: false, message: e.message || '操作异常' });
                }
                setApproving(false);
                setTimeout(() => setBatchResult(null), 6000);
              }}
              disabled={batchType !== null || approving}
              style={{
                padding: '10px 24px',
                borderRadius: theme.radius.md,
                border: 'none',
                background: approving ? theme.colors.greenBg : theme.colors.green,
                color: approving ? theme.colors.green : '#fff',
                fontSize: theme.typography.size.base,
                fontWeight: 600,
                cursor: (batchType !== null || approving) ? 'not-allowed' : 'pointer',
                opacity: (batchType !== null || approving) ? 0.6 : 1,
                transition: 'all 0.15s',
              }}
            >
              {approving ? '入库中...' : `一键入库（${needsReviewCount + lowConfidenceCount}）`}
            </button>
            <span style={{ marginLeft: 12, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
              将所有已分类案例批量确认为已入库
            </span>
          </div>
        )}
        {batchResult && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: theme.radius.md,
            background: batchResult.success ? theme.colors.greenBg : theme.colors.redBg,
            border: `1px solid ${batchResult.success ? theme.colors.greenBorder : theme.colors.redBorder}`,
            color: batchResult.success ? theme.colors.green : theme.colors.red,
            fontSize: theme.typography.size.sm,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>{batchResult.success ? '✓' : '✗'}</span>
            <span>{batchResult.message}</span>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ═══════ Section 3: Queue Switcher ═══════ */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {panels.map(p => {
          const cfg = QUEUE_CONFIG[p.key];
          if (!cfg) return null;
          const isActive = activePanel === p.key;
          return (
            <button
              key={p.key}
              onClick={() => fetchPanelCases(p.key)}
              style={{
                padding: '12px 16px',
                borderRadius: theme.radius.lg,
                border: `1.5px solid ${isActive ? (cfg.accentBorder || theme.colors.accentBorder) : theme.colors.border}`,
                background: isActive ? (cfg.accentBg || theme.colors.accentBg) : theme.colors.bgCard,
                cursor: 'pointer',
                textAlign: 'left',
                minWidth: 120,
                flex: cfg.deEmphasized ? '0 0 auto' : '1 1 130px',
                opacity: cfg.deEmphasized ? 0.7 : 1,
                transition: 'all 0.15s',
                boxShadow: isActive ? `0 0 0 1px ${cfg.accentBorder || theme.colors.accentBorder}` : 'none',
              }}
            >
              <div style={{
                fontSize: theme.typography.size.xs,
                color: isActive ? (cfg.accent || theme.colors.accent) : theme.colors.text.tertiary,
                fontWeight: 600,
                marginBottom: 2,
              }}>
                {cfg.label}
              </div>
              <div style={{
                fontSize: 24,
                fontWeight: 700,
                color: isActive ? (cfg.accent || theme.colors.accent) : (cfg.deEmphasized ? theme.colors.text.tertiary : theme.colors.text.primary),
                lineHeight: 1.2,
              }}>
                {p.count}
              </div>
              <div style={{
                fontSize: 11,
                color: theme.colors.text.tertiary,
                marginTop: 4,
                lineHeight: 1.3,
              }}>
                {cfg.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══════ Section 4: Task List ═══════ */}
      <div ref={taskListRef}>
        {activePanel && queueConfig && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <h2 style={{ fontSize: theme.typography.size['2xl'], fontWeight: 600, color: theme.colors.text.primary }}>
                  {queueConfig.label}队列
                  <span style={{ fontSize: theme.typography.size.base, fontWeight: 400, color: theme.colors.text.secondary, marginLeft: 8 }}>
                    {queueCount}
                  </span>
                </h2>
                <p style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.secondary, marginTop: 2 }}>
                  {queueConfig.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {!activePanel && (
          <div style={{ textAlign: 'center', padding: 60, color: theme.colors.text.tertiary }}>
            <div style={{ fontSize: 14 }}>选择上方的队列查看案例</div>
          </div>
        )}

        {casesLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: theme.colors.text.tertiary }}>
            加载中...
          </div>
        )}

        {!casesLoading && activePanel && cases.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: theme.colors.text.tertiary }}>
            暂无此分组的案例
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cases.map(c => {
            const isExpanded = expandedCase === c.id;
            const actions = queueActions;
            const reason = queueConfig?.taskReason || '';
            const hasOcr = Boolean(c.ocrText);
            const hasSummary = Boolean(c.aiSummary);
            const hasRisk = Boolean(c.riskNotes);

            return (
              <Card key={c.id} padding={0} style={{ overflow: 'hidden' }}>
                {/* Task Item Row */}
                <div style={{
                  display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12,
                }}>
                  {/* Left: Thumbnail + Info */}
                  <div style={{
                    width: 48, height: 36, borderRadius: theme.radius.sm, overflow: 'hidden',
                    background: theme.colors.bgSubtle, flexShrink: 0,
                  }}>
                    {imageCandidates(c).length > 0 ? (
                      <img src={imageCandidates(c)[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={handleImageError(c)} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 10, color: theme.colors.text.tertiary }}>无</div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.text.primary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.caseTitle || c.pageTitle || c.title || '未命名'}
                      </span>
                    </div>
                    <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary, marginTop: 2 }}>
                      {c.sourceDomain || '未知来源'}{c.discipline ? ` · ${c.discipline}` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: theme.colors.accent, background: theme.colors.accentBg, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                        {reason}
                      </span>
                      {c.confidence > 0 && (activePanel === 'needs_review' || activePanel === 'low_confidence') && (
                        <span style={{ fontSize: 11, color: theme.colors.text.secondary }}>
                          置信度 {Math.round(c.confidence * 100)}%
                        </span>
                      )}
                      {(c.mediaType || c.discipline) && (
                        <span style={{ fontSize: 11, color: theme.colors.text.tertiary, background: theme.colors.bgSubtle, padding: '1px 6px', borderRadius: 4 }}>
                          {[c.mediaType, c.discipline].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {hasOcr && <span style={{ fontSize: 11, color: theme.colors.green }}>OCR ✓</span>}
                      {hasSummary && <span style={{ fontSize: 11, color: theme.colors.green }}>摘要 ✓</span>}
                      {hasRisk && <span style={{ fontSize: 11, color: theme.colors.orange }}>风险</span>}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                    {actions.map(act => (
                      <button
                        key={act.action + act.label}
                        onClick={() => handleAction(c.id, act.action)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: theme.radius.md,
                          border: `1px solid ${
                            act.primary ? theme.colors.accent :
                            act.action === 'reject' ? theme.colors.redBorder :
                            theme.colors.border
                          }`,
                          background: act.primary ? theme.colors.accent : (act.action === 'reject' ? theme.colors.redBg : theme.colors.bgCard),
                          color: act.primary ? '#fff' : (act.action === 'reject' ? theme.colors.red : theme.colors.text.secondary),
                          fontSize: theme.typography.size.xs,
                          fontWeight: act.primary ? 600 : 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {act.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setExpandedCase(isExpanded ? null : c.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: theme.radius.sm,
                        border: 'none',
                        background: 'transparent',
                        color: theme.colors.text.tertiary,
                        cursor: 'pointer',
                        fontSize: theme.typography.size.xs,
                      }}
                    >
                      {isExpanded ? '收起 ▲' : '详情 ▼'}
                    </button>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${theme.colors.borderLight}` }}>
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                      {/* Left: Image + Source */}
                      <div style={{ flex: '0 0 340px', minWidth: 280, borderRight: `1px solid ${theme.colors.borderLight}` }}>
                        <div style={{ background: theme.colors.bgSubtle }}>
                          {imageCandidates(c).length > 0 ? (
                            <img src={imageCandidates(c)[0]} alt="" style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'contain' }}
                              onError={handleImageError(c)} />
                          ) : (
                            <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.tertiary }}>无图片</div>
                          )}
                        </div>
                        <div style={{ padding: 14, fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
                          {c.pageTitle && <div style={{ marginBottom: 6 }}><b style={{ color: theme.colors.text.tertiary }}>网页标题</b><br />{c.pageTitle}</div>}
                          <div style={{ marginBottom: 6 }}>
                            <b style={{ color: theme.colors.text.tertiary }}>来源</b><br />
                            {c.sourceUrl ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.accent }}>{c.sourceDomain || c.sourceUrl}</a> : <span style={{ color: theme.colors.text.tertiary }}>缺少来源</span>}
                          </div>
                          {c.contextText && <div style={{ marginBottom: 6 }}><b style={{ color: theme.colors.text.tertiary }}>上下文</b><br />{c.contextText}</div>}
                          {c.ocrText && (
                            <div>
                              <b style={{ color: theme.colors.text.tertiary }}>OCR 识别</b>
                              <div style={{ background: theme.colors.bgSubtle, padding: '6px 8px', borderRadius: theme.radius.sm, maxHeight: 80, overflowY: 'auto', fontFamily: theme.typography.fontMono, marginTop: 2 }}>
                                {c.ocrText}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Details */}
                      <div style={{ flex: 1, minWidth: 280, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: theme.typography.size.xs }}>
                          {[
                            ['呈现方式', c.mediaType],
                            ['内容类型', normalizeContentTypeLabel(c.contentType)],
                            ['学科', c.discipline],
                            ['技术手段', c.technicalMethod],
                            ['构图', c.composition],
                            ['色调', c.colorTone],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <div style={{ color: theme.colors.text.tertiary, fontWeight: 500, marginBottom: 1 }}>{label}</div>
                              <div style={{ color: value ? theme.colors.text.primary : theme.colors.text.tertiary }}>{value || '—'}</div>
                            </div>
                          ))}
                        </div>

                        {c.aiSummary && (
                          <div style={{
                            fontSize: theme.typography.size.xs, color: theme.colors.text.secondary,
                            padding: 10, background: theme.colors.bgSubtle, borderRadius: theme.radius.sm,
                            fontStyle: 'italic', lineHeight: 1.5, border: `1px solid ${theme.colors.borderLight}`,
                          }}>
                            {c.aiSummary}
                          </div>
                        )}

                        {c.riskNotes && (
                          <div style={{
                            fontSize: theme.typography.size.xs, color: theme.colors.orange,
                            padding: 8, background: theme.colors.orangeBg, borderRadius: theme.radius.sm,
                            border: `1px solid ${theme.colors.orangeBorder}`,
                          }}>
                            ⚠ {c.riskNotes}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>评分</span>
                          <StarRating value={c.rating} onChange={async (r) => { await api.updateCase(c.id, { rating: r } as any); setCases(prev => prev.map(x => x.id === c.id ? { ...x, rating: r } : x)); }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
