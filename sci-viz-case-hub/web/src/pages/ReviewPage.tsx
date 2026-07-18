import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { withBaseUrl } from '../baseUrl';
import type { VisualCase, ReviewStatus, OcrJob, AnalysisJob } from '../types';
import { theme } from '../theme';
import { StarRating } from '../components';

interface QueuePanel {
  key: string;
  label: string;
  count: number;
  description: string;
}

interface ManualCaseDraft {
  sourceUrl: string;
  functionalPurpose: string;
  distributionMedium: string;
  technicalMethod: string;
  contentType: string;
  discipline: string;
}

const FUNCTION_OPTIONS = ['记录', '解释', '数据', '展示', '传播', '交互'];
const MEDIUM_OPTIONS = ['静图', '动图', '视频', '图组', '交互', '实体'];
const TECHNICAL_OPTIONS = ['拍摄', '成像', '绘设', '数据', '渲染', '生成'];
const CONTENT_OPTIONS = ['单人肖像', '群体肖像', '绘画肖像', '实验设备', '实验过程', '微观样本', '机制模型', '数据结果', '空间环境', '团队场景', '科普传播'];
const DISCIPLINE_OPTIONS = ['生命科学', '材料', '医学', '工程', '物理', '化学', '信息科学', '环境科学', '综合交叉'];

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
  accent?: string;
  accentBg?: string;
  accentBorder?: string;
  deEmphasized?: boolean;
}> = {
  pending_quality: {
    label: '待质检',
    description: '检查图片是否清晰、完整',
  },
  pending_ocr: {
    label: '待 OCR',
    description: '可选：只提取图片里的文字，不负责理解内容',
  },
  pending_classify: {
    label: '待 Qwen 分析',
    description: '理解图片内容，生成摘要和三轴分类',
  },
  needs_review: {
    label: '待确认',
    description: '逐张检查识别结果，确认后入库',
    accent: theme.colors.orange,
    accentBg: theme.colors.orangeBg,
    accentBorder: theme.colors.orangeBorder,
  },
  low_confidence: {
    label: '重点复核',
    description: '需要仔细看图判断',
    accent: theme.colors.yellow,
    accentBg: theme.colors.yellowBg,
    accentBorder: theme.colors.yellowBorder,
  },
  approved: {
    label: '已入库',
    description: '已通过审核，可在案例库查看',
    deEmphasized: true,
  },
  failed: {
    label: '分析异常',
    description: '图片不可读、来源缺失或识别结果无效',
    accent: theme.colors.purple,
    accentBg: theme.colors.purpleBg,
    accentBorder: theme.colors.purpleBorder,
  },
};

const QUEUE_ACTIONS: Record<string, Array<{ label: string; action: 'approve' | 'reject' | 'reanalyze'; primary?: boolean }>> = {
  pending_quality: [{ label: '重新处理', action: 'reanalyze' }],
  pending_ocr: [{ label: '重新处理', action: 'reanalyze' }],
  pending_classify: [{ label: '重新处理', action: 'reanalyze' }],
  needs_review: [],
  low_confidence: [
    { label: '重新分析', action: 'reanalyze' },
  ],
  approved: [],
  failed: [
    { label: '重试', action: 'reanalyze', primary: true },
  ],
};

const ACTIVE_OCR_STATUSES = new Set(['queued', 'running', 'cancelling']);

function ocrMethodLabel(method: OcrJob['currentMethod']): string {
  if (method === 'local') return 'Apple Vision 本地识别';
  if (method === 'remote') return '远程视觉识别';
  if (method === 'remote_fallback') return '本地失败，已切换远程识别';
  if (method === 'existing') return '已存在识别结果';
  return '正在定位图片';
}

function formatJobTime(value: string | null | undefined): string {
  if (!value) return '尚无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export default function ReviewPage() {
  const [panels, setPanels] = useState<QueuePanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [cases, setCases] = useState<VisualCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [managementMode, setManagementMode] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [selectionWorking, setSelectionWorking] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualCaseDraft | null>(null);
  const [manualSaveWorking, setManualSaveWorking] = useState(false);
  const [manualEditError, setManualEditError] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);
  const [batchType, setBatchType] = useState<'quality' | 'ocr' | 'classify' | null>(null);
  const [batchResult, setBatchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [batchElapsed, setBatchElapsed] = useState(0);
  const [ocrJob, setOcrJob] = useState<OcrJob | null>(null);
  const [ocrPollingWarning, setOcrPollingWarning] = useState('');
  const [ocrCancelWorking, setOcrCancelWorking] = useState(false);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [analysisPollingWarning, setAnalysisPollingWarning] = useState('');
  const [analysisCancelWorking, setAnalysisCancelWorking] = useState(false);
  const batchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchStartRef = useRef(0);
  const observedActiveOcrRef = useRef(false);
  const handledOcrTerminalRef = useRef('');
  const observedActiveAnalysisRef = useRef(false);
  const handledAnalysisTerminalRef = useRef('');
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
    let disposed = false;
    Promise.all([api.getLatestOcrJob(), api.getLatestAnalysisJob()]).then(([ocrRes, analysisRes]) => {
      if (disposed) return;
      if (ocrRes.success) setOcrJob(ocrRes.data);
      if (analysisRes.success) setAnalysisJob(analysisRes.data);
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);

  const ocrIsActive = Boolean(ocrJob && ACTIVE_OCR_STATUSES.has(ocrJob.status));
  const analysisIsActive = Boolean(analysisJob && ACTIVE_OCR_STATUSES.has(analysisJob.status));

  useEffect(() => {
    if (!ocrJob || !ocrIsActive) return;
    observedActiveOcrRef.current = true;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const poll = async () => {
      try {
        const res = await api.getOcrJob(ocrJob.id);
        if (disposed) return;
        if (res.success) {
          consecutiveFailures = 0;
          setOcrPollingWarning('');
          setOcrJob(res.data);
        } else {
          consecutiveFailures += 1;
        }
      } catch {
        consecutiveFailures += 1;
      }
      if (!disposed) {
        if (consecutiveFailures >= 3) setOcrPollingWarning('进度连接暂时中断，任务仍会在后台继续');
        timer = setTimeout(poll, consecutiveFailures > 0 ? 2000 : 1000);
      }
    };

    timer = setTimeout(poll, 500);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [ocrJob?.id, ocrIsActive]);

  useEffect(() => {
    if (!analysisJob || !analysisIsActive) return;
    observedActiveAnalysisRef.current = true;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;

    const poll = async () => {
      try {
        const res = await api.getAnalysisJob(analysisJob.id);
        if (disposed) return;
        if (res.success) {
          consecutiveFailures = 0;
          setAnalysisPollingWarning('');
          setAnalysisJob(res.data);
        } else {
          consecutiveFailures += 1;
        }
      } catch {
        consecutiveFailures += 1;
      }
      if (!disposed) {
        if (consecutiveFailures >= 3) setAnalysisPollingWarning('进度连接暂时中断，Qwen 任务仍会在后台继续');
        timer = setTimeout(poll, consecutiveFailures > 0 ? 2000 : 1000);
      }
    };

    timer = setTimeout(poll, 500);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [analysisJob?.id, analysisIsActive]);

  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearInterval(batchTimerRef.current);
    };
  }, []);

  const fetchPanelCases = useCallback(async (key: string) => {
    setCasesLoading(true);
    setActivePanel(key);
    setSelectedCaseIds(new Set());
    setManagementMode(false);
    setExpandedCase(null);
    setEditingCaseId(null);
    setManualDraft(null);
    setManualEditError('');
    const config = PANEL_MAP[key];
    if (!config) { setCasesLoading(false); return; }
    const params: Record<string, string> = { limit: '100' };
    if (config.status === 'analysis_failed') {
      params.review_status = 'analysis_failed,source_missing';
    } else {
      params.review_status = config.status;
    }
    if (config.ocrEmpty) {
      params.ocr_status = 'no_text';
    }
    try {
      const res = await api.getCases(params);
      if (res.success) setCases(res.data);
    } catch { /* ignore */ }
    setCasesLoading(false);
  }, []);

  useEffect(() => {
    if (!ocrJob || ocrIsActive || !observedActiveOcrRef.current) return;
    const terminalKey = `${ocrJob.id}:${ocrJob.status}`;
    if (handledOcrTerminalRef.current === terminalKey) return;
    handledOcrTerminalRef.current = terminalKey;
    observedActiveOcrRef.current = false;

    if (ocrJob.status === 'completed') {
      setBatchResult({ success: true, message: `OCR 完成：${ocrJob.updated} 张已识别，${ocrJob.skipped} 张无可读文字，${ocrJob.failed} 张失败` });
    } else if (ocrJob.status === 'cancelled') {
      setBatchResult({ success: true, message: `OCR 已停止：已完成 ${ocrJob.processed}/${ocrJob.total} 张` });
    } else {
      setBatchResult({ success: false, message: ocrJob.error || 'OCR 任务异常终止' });
    }
    void fetchStatus();
    if (activePanel) void fetchPanelCases(activePanel);
  }, [activePanel, fetchPanelCases, fetchStatus, ocrIsActive, ocrJob]);

  useEffect(() => {
    if (!analysisJob || analysisIsActive || !observedActiveAnalysisRef.current) return;
    const terminalKey = `${analysisJob.id}:${analysisJob.status}`;
    if (handledAnalysisTerminalRef.current === terminalKey) return;
    handledAnalysisTerminalRef.current = terminalKey;
    observedActiveAnalysisRef.current = false;

    if (analysisJob.status === 'completed') {
      setBatchResult({ success: analysisJob.failed === 0, message: `Qwen 分析完成：${analysisJob.analyzed} 张成功，${analysisJob.failed} 张失败` });
    } else if (analysisJob.status === 'cancelled') {
      setBatchResult({ success: true, message: `Qwen 分析已停止：已完成 ${analysisJob.processed}/${analysisJob.total} 张` });
    } else {
      setBatchResult({ success: false, message: analysisJob.error || 'Qwen 分析任务异常终止' });
    }
    void fetchStatus();
    if (activePanel) void fetchPanelCases(activePanel);
  }, [activePanel, analysisIsActive, analysisJob, fetchPanelCases, fetchStatus]);

  useEffect(() => {
    if (loading || activePanel || panels.length === 0) return;
    const firstPanel = panels.find(panel => panel.key === 'needs_review' && panel.count > 0)
      ?? panels.find(panel => panel.key === 'low_confidence' && panel.count > 0)
      ?? panels.find(panel => panel.key === 'failed' && panel.count > 0);
    if (firstPanel) fetchPanelCases(firstPanel.key);
  }, [activePanel, fetchPanelCases, loading, panels]);

  const runBatch = async (type: 'quality' | 'ocr' | 'classify') => {
    if (type === 'ocr') {
      setBatchResult(null);
      try {
        const res = await api.startOcrJob();
        if (res.success) {
          observedActiveOcrRef.current = ACTIVE_OCR_STATUSES.has(res.data.status);
          setOcrJob(res.data);
        } else {
          setBatchResult({ success: false, message: res.error || 'OCR 启动失败' });
        }
      } catch (error) {
        setBatchResult({ success: false, message: error instanceof Error ? error.message : 'OCR 启动异常' });
      }
      return;
    }

    if (type === 'classify') {
      setBatchResult(null);
      try {
        const res = await api.startAnalysisJob();
        if (res.success) {
          observedActiveAnalysisRef.current = ACTIVE_OCR_STATUSES.has(res.data.status);
          setAnalysisJob(res.data);
        } else {
          setBatchResult({ success: false, message: res.error || 'Qwen 分析启动失败' });
        }
      } catch (error) {
        setBatchResult({ success: false, message: error instanceof Error ? error.message : 'Qwen 分析启动异常' });
      }
      return;
    }

    setBatchType(type);
    setBatchResult(null);
    setBatchElapsed(0);
    batchStartRef.current = Date.now();
    batchTimerRef.current = setInterval(() => {
      setBatchElapsed(Math.round((Date.now() - batchStartRef.current) / 1000));
    }, 1000);

    try {
      let res: any;
      res = await api.batchQualityCheck();

      if (batchTimerRef.current) clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;

      if (res?.success) {
        const s = res.summary;
        let msg = '';
        msg = `完成：${s.ok ?? 0} 张合格，${s.broken ?? 0} 张损坏，${s.lowQuality ?? 0} 张低质`;
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

  const cancelCurrentOcr = async () => {
    if (!ocrJob || !ocrIsActive || ocrCancelWorking) return;
    setOcrCancelWorking(true);
    try {
      const res = await api.cancelOcrJob(ocrJob.id);
      if (res.success) setOcrJob(res.data);
      else setBatchResult({ success: false, message: res.error || '无法停止 OCR' });
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '无法停止 OCR' });
    } finally {
      setOcrCancelWorking(false);
    }
  };

  const cancelCurrentAnalysis = async () => {
    if (!analysisJob || !analysisIsActive || analysisCancelWorking) return;
    setAnalysisCancelWorking(true);
    try {
      const res = await api.cancelAnalysisJob(analysisJob.id);
      if (res.success) setAnalysisJob(res.data);
      else setBatchResult({ success: false, message: res.error || '无法停止 Qwen 分析' });
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '无法停止 Qwen 分析' });
    } finally {
      setAnalysisCancelWorking(false);
    }
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

  const handleApproveAll = async () => {
    if (approvingAll || !activePanel) return;
    const status = activePanel === 'needs_review'
      ? 'needs_review'
      : activePanel === 'low_confidence'
        ? 'low_confidence_review'
        : null;
    if (!status) return;

    setApprovingAll(true);
    setBatchResult(null);
    try {
      const res = await api.batchApprove([status]);
      if (!res.success) {
        setBatchResult({ success: false, message: res.error || '入库失败' });
        return;
      }
      setCases([]);
      setSelectedCaseIds(new Set());
      setBatchResult({ success: true, message: `已将 ${res.data.approved} 个案例收入案例库` });
      await fetchStatus();
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '入库失败' });
    } finally {
      setApprovingAll(false);
    }
  };

  const toggleCaseSelection = (caseId: string) => {
    setSelectedCaseIds(current => {
      const next = new Set(current);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  const selectAllLoaded = () => {
    setSelectedCaseIds(new Set(cases.map(item => item.id)));
  };

  const handleSelectedDelete = async () => {
    const ids = [...selectedCaseIds];
    if (ids.length === 0 || selectionWorking) return;
    if (!window.confirm(`确定永久删除已选的 ${ids.length} 个案例吗？相关图片文件也会被删除。`)) return;
    setSelectionWorking(true);
    try {
      const res = await api.batchDeleteCases(ids);
      if (!res.success) {
        setBatchResult({ success: false, message: res.error || '删除失败' });
        return;
      }
      const deletedIds = new Set(ids);
      setCases(current => current.filter(item => !deletedIds.has(item.id)));
      setSelectedCaseIds(new Set());
      setBatchResult({ success: true, message: `已删除 ${res.data.deleted} 个案例` });
      await fetchStatus();
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '删除失败' });
    } finally {
      setSelectionWorking(false);
    }
  };

  const beginManualEdit = (visualCase: VisualCase) => {
    setEditingCaseId(visualCase.id);
    setManualEditError('');
    setManualDraft({
      sourceUrl: visualCase.sourceUrl || '',
      functionalPurpose: visualCase.functionalPurpose === '不确定' ? '' : visualCase.functionalPurpose,
      distributionMedium: visualCase.distributionMedium === '不确定' ? '' : visualCase.distributionMedium,
      technicalMethod: visualCase.technicalMethod === '不确定' ? '' : visualCase.technicalMethod,
      contentType: visualCase.contentType === '不确定' ? '' : normalizeContentTypeLabel(visualCase.contentType),
      discipline: visualCase.discipline === '不确定' ? '' : visualCase.discipline,
    });
    window.setTimeout(() => {
      document.getElementById(`manual-editor-${visualCase.id}`)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest',
      });
    }, 0);
  };

  const updateManualDraft = (field: keyof ManualCaseDraft, value: string) => {
    setManualDraft(current => current ? { ...current, [field]: value } : current);
  };

  const saveManualClassification = async () => {
    if (!editingCaseId || !manualDraft || manualSaveWorking) return;
    const requiredFields: Array<keyof ManualCaseDraft> = ['sourceUrl', 'functionalPurpose', 'distributionMedium', 'technicalMethod'];
    if (requiredFields.some(field => !manualDraft[field].trim())) {
      setManualEditError('请填写来源网址，并完成“功能、媒介、技术”三轴分类');
      return;
    }
    try {
      const parsedSource = new URL(manualDraft.sourceUrl.trim().match(/^https?:\/\//i) ? manualDraft.sourceUrl.trim() : `https://${manualDraft.sourceUrl.trim()}`);
      if (!['http:', 'https:'].includes(parsedSource.protocol)) throw new Error('invalid protocol');
    } catch {
      setManualEditError('请输入有效的 HTTP 或 HTTPS 来源网址');
      return;
    }

    setManualSaveWorking(true);
    setManualEditError('');
    try {
      const result = await api.updateCase(editingCaseId, {
        ...manualDraft,
        reviewStatus: 'needs_review',
      } as Partial<VisualCase>);
      if (!result.success) {
        setManualEditError(result.error || '保存失败');
        return;
      }
      setCases(current => current.filter(item => item.id !== editingCaseId));
      setSelectedCaseIds(current => {
        const next = new Set(current);
        next.delete(editingCaseId);
        return next;
      });
      setEditingCaseId(null);
      setManualDraft(null);
      setBatchResult({ success: true, message: '人工分类已保存，案例已进入待确认' });
      await fetchStatus();
    } catch (error) {
      setManualEditError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setManualSaveWorking(false);
    }
  };

  const switchToPanel = (key: string) => {
    fetchPanelCases(key);
    setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const imageCandidates = (c: VisualCase) => [c.thumbnailPath, c.imagePath, c.imageUrl].filter(Boolean).map(withBaseUrl);

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
  const pendingRecognitionCount = panelCount('pending_classify');
  const needsReviewCount = panelCount('needs_review');
  const lowConfidenceCount = panelCount('low_confidence');
  const reviewReadyCount = needsReviewCount + lowConfidenceCount;
  const failedCount = panelCount('failed');
  const approvedCount = panelCount('approved');

  const queueConfig = activePanel ? QUEUE_CONFIG[activePanel] : null;
  const queueActions = activePanel ? (QUEUE_ACTIONS[activePanel] ?? []) : [];
  const queueCount = activePanel ? panelCount(activePanel) : 0;
  const selectedCount = selectedCaseIds.size;
  const allLoadedSelected = cases.length > 0 && cases.every(item => selectedCaseIds.has(item.id));
  const anyBatchRunning = batchType !== null || ocrIsActive || analysisIsActive;
  const ocrElapsed = ocrJob?.startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(ocrJob.startedAt).getTime()) / 1000))
    : 0;
  const ocrStageLabel = ocrJob?.status === 'cancelling'
    ? '正在停止，将在当前图片完成后结束'
    : ocrJob?.stage === 'backing_up'
      ? '正在备份案例库'
      : ocrJob?.stage === 'preparing'
        ? '正在准备任务'
        : '正在识别图片文字';
  const analysisElapsed = analysisJob?.startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(analysisJob.startedAt).getTime()) / 1000))
    : 0;
  const analysisStageLabel = analysisJob?.status === 'cancelling'
    ? '正在停止，将在当前图片分析完成后结束'
    : analysisJob?.stage === 'backing_up'
      ? '正在备份案例库'
      : analysisJob?.stage === 'preparing'
        ? '正在准备 Qwen 任务'
        : 'Qwen 正在理解图片内容';

  const activeFlowStep = analysisIsActive
    ? 2
    : pendingRecognitionCount > 0
      ? 1
      : reviewReadyCount > 0
        ? 3
        : approvedCount > 0
          ? 4
          : 1;
  const lastJobFinished = analysisJob && !analysisIsActive;
  const lastJobSucceeded = lastJobFinished ? analysisJob.analyzed : 0;
  const lastJobFailed = lastJobFinished ? analysisJob.failed : 0;
  const autoActions = [
    { type: 'quality' as const, label: '开始图片质检', panelKey: 'pending_quality' },
    { type: 'classify' as const, label: '开始 Qwen 图片分析', panelKey: 'pending_classify' },
    { type: 'ocr' as const, label: '提取图片文字（可选）', panelKey: 'pending_ocr' },
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
      <section className="recognition-section recognition-flow" aria-label="处理流程">
        <button className="recognition-refresh" onClick={() => { fetchStatus(); if (activePanel) fetchPanelCases(activePanel); }}>
          刷新
        </button>
        <div className="recognition-steps">
          {[
            ['待处理', '尚未识别的图片'],
            ['识别中', 'OCR 与内容分析'],
            ['待确认', '人工检查与修正'],
            ['已入库', '完成确认，正式入库'],
          ].map(([label, description], index) => {
            const step = index + 1;
            const isActive = activeFlowStep === step;
            const isComplete = activeFlowStep > step;
            return (
              <div className={`recognition-step ${isActive ? 'is-active' : ''} ${isComplete ? 'is-complete' : ''}`} key={label}>
                <div className="recognition-step-marker">{isComplete ? '✓' : step}</div>
                <div><strong>{label}</strong><span>{description}</span></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`recognition-hero ${analysisIsActive ? 'is-running' : ''}`} aria-label="图片识别任务">
        {analysisJob && analysisIsActive ? (
          <div className="recognition-live" aria-live="polite">
            <div className="recognition-live-copy">
              <div className="recognition-live-kicker">{analysisStageLabel}</div>
              <div className="recognition-live-title">{analysisJob.currentCaseTitle || '正在建立图片识别序列'}</div>
              <div className="recognition-live-meta">已处理 {analysisJob.processed}/{analysisJob.total} · 成功 {analysisJob.analyzed} · 异常 {analysisJob.failed} · 已用时 {analysisElapsed}s</div>
            </div>
            <div className="recognition-live-value">{analysisJob.progress}%</div>
            <div className="recognition-progress-track" role="progressbar" aria-label="图片识别进度" aria-valuemin={0} aria-valuemax={analysisJob.total} aria-valuenow={analysisJob.processed}>
              <div className="recognition-progress-fill" style={{ width: `${analysisJob.progress}%` }} />
            </div>
            <div className="recognition-live-footer">
              <span>Qwen 正在检测图片质量、读取可见文字并理解图片内容。任务可在后台继续。</span>
              <button className="recognition-stop" onClick={cancelCurrentAnalysis} disabled={analysisCancelWorking || analysisJob.status === 'cancelling'}>
                {analysisJob.status === 'cancelling' ? '正在停止…' : '完成当前张后停止'}
              </button>
            </div>
            {analysisPollingWarning && <div className="recognition-warning">{analysisPollingWarning}</div>}
          </div>
        ) : (
          <div className="recognition-idle">
            <div className="recognition-inbox-icon"><img src="/OCR.png" alt="" aria-hidden="true" /></div>
            <div className="recognition-idle-copy">
              <div className="recognition-count">{pendingRecognitionCount}<span>张</span></div>
              <p>{pendingRecognitionCount > 0 ? '这些图片尚未进行识别，请开始批量处理。' : '当前没有尚未识别的图片。'}</p>
            </div>
            <div className="recognition-primary-action">
              <button onClick={() => runBatch('classify')} disabled={pendingRecognitionCount === 0 || anyBatchRunning}>
                <span aria-hidden="true">▶</span>{pendingRecognitionCount > 0 ? '开始 OCR 识别' : '暂无待处理图片'}
              </button>
              <span>系统将自动检测图片质量，提取文字与内容信息</span>
            </div>
          </div>
        )}
      </section>

      <section className="recognition-section recognition-result" aria-labelledby="recognition-result-title">
        <div className="recognition-result-head">
          <div><h2 id="recognition-result-title">上次识别结果</h2><span>{analysisJob ? formatJobTime(analysisJob.finishedAt || analysisJob.heartbeatAt) : '尚无识别记录'}</span></div>
          <div className={`recognition-result-state ${lastJobFailed > 0 ? 'has-warning' : ''}`}><span>{lastJobFailed > 0 ? '!' : '✓'}</span>{analysisJob ? (analysisJob.status === 'completed' ? '已完成' : analysisJob.status === 'cancelled' ? '已停止' : '任务异常') : '尚未处理'}</div>
        </div>
        <div className="recognition-result-grid">
          <button className="recognition-metric is-review" onClick={() => switchToPanel('needs_review')} disabled={reviewReadyCount === 0}><strong>{lastJobSucceeded}</strong><span>进入待确认</span><i aria-hidden="true">→</i></button>
          <button className="recognition-metric is-error" onClick={() => switchToPanel('failed')} disabled={failedCount === 0}><strong>{lastJobFailed}</strong><span>识别异常</span><i aria-hidden="true">→</i></button>
          <div className="recognition-metric is-approved"><strong>{approvedCount}</strong><span>当前已入库</span></div>
        </div>
        <div className="recognition-result-note"><span aria-hidden="true">ⓘ</span>{lastJobSucceeded > 0 ? '识别成功的图片已进入待确认列表，请及时检查并修正信息。' : lastJobFailed > 0 ? '存在识别异常，请在下方异常列表中检查图片或重新识别。' : '完成识别后，结果会在这里汇总。'}</div>
        {batchResult && <div className={`recognition-toast ${batchResult.success ? 'is-success' : 'is-error'}`}>{batchResult.message}</div>}
      </section>

      {/* ═══════ Section 2: Auto Processing Zone ═══════ */}
      <div hidden aria-hidden="true" style={{
        background: theme.colors.bgCard,
        borderRadius: theme.radius.lg,
        border: `1px solid ${anyBatchRunning ? theme.colors.accentBorder : theme.colors.border}`,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: theme.shadow.card,
        transition: 'border-color 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: theme.typography.size.lg, fontWeight: 600, color: theme.colors.text.primary }}>
            批量补全
          </span>
          <span style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
            一次处理当前缺少的图片信息
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
                正在执行{batchType === 'quality' ? '图片质检' : '智能分类'}...
              </div>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, marginTop: 1 }}>
                已用时 {batchElapsed}s{batchElapsed > 15 ? ' · 大批量任务可能需要较长时间，请耐心等待' : ''}
              </div>
            </div>
          </div>
        )}
        {analysisJob && analysisIsActive && (
          <div className="ocr-progress-card" aria-live="polite">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: theme.typography.size.base, fontWeight: 700, color: theme.colors.text.primary }}>
                  {analysisStageLabel}
                </div>
                <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {analysisJob.currentCaseTitle || '正在建立图片分析序列'}
                </div>
              </div>
              <div style={{ fontFamily: theme.typography.fontMono, fontSize: 24, fontWeight: 700, color: theme.colors.accent, lineHeight: 1 }}>
                {analysisJob.progress}%
              </div>
            </div>

            <div
              className="ocr-progress-track"
              role="progressbar"
              aria-label="Qwen 图片分析进度"
              aria-valuemin={0}
              aria-valuemax={analysisJob.total}
              aria-valuenow={analysisJob.processed}
            >
              <div className="ocr-progress-fill" style={{ width: `${analysisJob.progress}%` }} />
            </div>

            <div className="ocr-progress-stats analysis-progress-stats">
              <div><strong>{analysisJob.processed}</strong><span>已处理 / {analysisJob.total}</span></div>
              <div><strong style={{ color: theme.colors.green }}>{analysisJob.analyzed}</strong><span>分析成功</span></div>
              <div><strong style={{ color: theme.colors.red }}>{analysisJob.failed}</strong><span>分析失败</span></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
                Qwen VL 图片语义理解
                <span style={{ color: theme.colors.text.tertiary }}> · 已用时 {analysisElapsed}s · OCR 文字仅作为辅助上下文</span>
              </div>
              <button
                onClick={cancelCurrentAnalysis}
                disabled={analysisCancelWorking || analysisJob.status === 'cancelling'}
                style={{
                  padding: '6px 10px', borderRadius: theme.radius.md,
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.bgCard, color: theme.colors.text.secondary,
                  fontSize: theme.typography.size.xs, fontWeight: 600,
                  cursor: analysisCancelWorking || analysisJob.status === 'cancelling' ? 'wait' : 'pointer',
                  opacity: analysisCancelWorking || analysisJob.status === 'cancelling' ? 0.6 : 1,
                }}
              >
                {analysisJob.status === 'cancelling' ? '正在停止…' : '完成当前张后停止'}
              </button>
            </div>
            {analysisPollingWarning && (
              <div style={{ marginTop: 10, fontSize: theme.typography.size.xs, color: theme.colors.orange }}>
                {analysisPollingWarning}
              </div>
            )}
          </div>
        )}
        {ocrJob && ocrIsActive && (
          <div className="ocr-progress-card" aria-live="polite">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: theme.typography.size.base, fontWeight: 700, color: theme.colors.text.primary }}>
                  {ocrStageLabel}
                </div>
                <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ocrJob.currentCaseTitle || '正在建立处理序列'}
                </div>
              </div>
              <div style={{ fontFamily: theme.typography.fontMono, fontSize: 24, fontWeight: 700, color: theme.colors.accent, lineHeight: 1 }}>
                {ocrJob.progress}%
              </div>
            </div>

            <div
              className="ocr-progress-track"
              role="progressbar"
              aria-label="OCR 处理进度"
              aria-valuemin={0}
              aria-valuemax={ocrJob.total}
              aria-valuenow={ocrJob.processed}
            >
              <div className="ocr-progress-fill" style={{ width: `${ocrJob.progress}%` }} />
            </div>

            <div className="ocr-progress-stats">
              <div><strong>{ocrJob.processed}</strong><span>已处理 / {ocrJob.total}</span></div>
              <div><strong style={{ color: theme.colors.green }}>{ocrJob.updated}</strong><span>识别成功</span></div>
              <div><strong style={{ color: theme.colors.orange }}>{ocrJob.skipped}</strong><span>无可读文字</span></div>
              <div><strong style={{ color: theme.colors.red }}>{ocrJob.failed}</strong><span>处理失败</span></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
                {ocrJob.stage === 'ocr' ? ocrMethodLabel(ocrJob.currentMethod) : ocrStageLabel}
                <span style={{ color: theme.colors.text.tertiary }}> · 已用时 {ocrElapsed}s · 可离开此页面，任务会继续</span>
              </div>
              <button
                onClick={cancelCurrentOcr}
                disabled={ocrCancelWorking || ocrJob.status === 'cancelling'}
                style={{
                  padding: '6px 10px', borderRadius: theme.radius.md,
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.bgCard, color: theme.colors.text.secondary,
                  fontSize: theme.typography.size.xs, fontWeight: 600,
                  cursor: ocrCancelWorking || ocrJob.status === 'cancelling' ? 'wait' : 'pointer',
                  opacity: ocrCancelWorking || ocrJob.status === 'cancelling' ? 0.6 : 1,
                }}
              >
                {ocrJob.status === 'cancelling' ? '正在停止…' : '完成当前张后停止'}
              </button>
            </div>
            {ocrPollingWarning && (
              <div style={{ marginTop: 10, fontSize: theme.typography.size.xs, color: theme.colors.orange }}>
                {ocrPollingWarning}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {autoActions.map(action => {
            const count = panelCount(action.panelKey);
            const isRunning = batchType === action.type
              || (action.type === 'ocr' && ocrIsActive)
              || (action.type === 'classify' && analysisIsActive);
            const isDisabled = anyBatchRunning;
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
                {action.type === 'ocr' && ocrIsActive && ocrJob
                  ? `OCR 进行中（${ocrJob.processed}/${ocrJob.total}）`
                  : action.type === 'classify' && analysisIsActive && analysisJob
                    ? `Qwen 分析中（${analysisJob.processed}/${analysisJob.total}）`
                  : isRunning ? '处理中...' : `${action.label}（${count}）`}
              </button>
            );
          })}
        </div>
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
        {ocrJob && !ocrIsActive && ocrJob.errors.length > 0 && (
          <details style={{ marginTop: 10, fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: theme.colors.red }}>
              查看最近一次 OCR 的失败详情（{ocrJob.failed}）
            </summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {ocrJob.errors.map((item, index) => (
                <div key={`${item.caseId}:${index}`} style={{ padding: '8px 10px', borderRadius: theme.radius.md, background: theme.colors.redBg, border: `1px solid ${theme.colors.redBorder}` }}>
                  <div style={{ fontWeight: 600, color: theme.colors.text.primary }}>{item.caseTitle || item.caseId}</div>
                  <div style={{ marginTop: 2, color: theme.colors.red }}>{item.message} · {item.code}</div>
                </div>
              ))}
            </div>
          </details>
        )}
        {analysisJob && !analysisIsActive && analysisJob.errors.length > 0 && (
          <details style={{ marginTop: 10, fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, color: theme.colors.red }}>
              查看最近一次 Qwen 分析失败详情（{analysisJob.failed}）
            </summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {analysisJob.errors.map((item, index) => (
                <div key={`${item.caseId}:${index}`} style={{ padding: '8px 10px', borderRadius: theme.radius.md, background: theme.colors.redBg, border: `1px solid ${theme.colors.redBorder}` }}>
                  <div style={{ fontWeight: 600, color: theme.colors.text.primary }}>{item.caseTitle || item.caseId}</div>
                  <div style={{ marginTop: 2, color: theme.colors.red }}>{item.message} · {item.code}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <style>{`
        .recognition-hero,
        .recognition-section {
          border: 1px solid #dfe7f3;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 8px 30px rgba(26, 55, 96, .055);
        }
        .recognition-hero {
          position: relative;
          min-height: 154px;
          margin-bottom: 14px;
          overflow: hidden;
        }
        .recognition-idle {
          position: relative;
          z-index: 1;
          min-height: 154px;
          display: grid;
          grid-template-columns: 112px minmax(220px, 1fr) minmax(260px, 330px);
          align-items: center;
          gap: 24px;
          padding: 18px 30px;
        }
        .recognition-inbox-icon { width: 88px; height: 88px; }
        .recognition-inbox-icon img { width: 100%; height: 100%; display: block; object-fit: contain; }
        .recognition-count { margin-top: 4px; color: #0b1220; font-size: 46px; line-height: 1; font-weight: 760; letter-spacing: -.045em; font-variant-numeric: tabular-nums; }
        .recognition-count span { margin-left: 8px; color: #4d596a; font-size: 15px; font-weight: 500; letter-spacing: 0; }
        .recognition-idle-copy p { margin: 12px 0 0; color: #5e6978; font-size: 13px; }
        .recognition-primary-action { display: grid; justify-items: stretch; gap: 10px; text-align: center; }
        .recognition-primary-action button {
          min-height: 54px;
          padding: 0 24px;
          border: 0;
          border-radius: 9px;
          background: linear-gradient(135deg, #1265f4 0%, #0757e7 100%);
          box-shadow: none;
          color: #fff;
          font-size: 15px;
          font-weight: 730;
          cursor: pointer;
          transition: transform .16s ease, opacity .16s ease;
        }
        .recognition-primary-action button:hover:not(:disabled) { transform: translateY(-1px); }
        .recognition-primary-action button:disabled { background: #afbdd1; box-shadow: none; cursor: not-allowed; opacity: .72; }
        .recognition-primary-action button span { margin-right: 8px; font-size: 12px; }
        .recognition-primary-action > span { color: #7b8594; font-size: 12px; line-height: 1.5; }
        .recognition-live {
          position: relative;
          z-index: 1;
          min-height: 154px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-content: center;
          gap: 14px 24px;
          padding: 22px 30px;
        }
        .recognition-live-kicker { color: #1265f4; font-size: 14px; font-weight: 750; }
        .recognition-live-title { max-width: 720px; margin-top: 5px; overflow: hidden; color: #101828; font-size: 20px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .recognition-live-meta { margin-top: 7px; color: #687487; font-size: 12px; font-variant-numeric: tabular-nums; }
        .recognition-live-value { align-self: center; color: #1265f4; font-size: 36px; line-height: 1; font-weight: 780; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
        .recognition-progress-track { grid-column: 1 / -1; height: 9px; overflow: hidden; border-radius: 999px; background: #e7edf6; }
        .recognition-progress-fill { position: relative; height: 100%; overflow: hidden; border-radius: inherit; background: linear-gradient(90deg, #3a8bff, #0860ec); transition: width .35s ease; }
        .recognition-progress-fill::after { content: ''; position: absolute; inset: 0 auto 0 0; width: 22%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation: ocr-scan 1.8s ease-in-out infinite; }
        .recognition-live-footer { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 16px; color: #657185; font-size: 12px; }
        .recognition-stop { padding: 6px 10px; border: 1px solid #d6deea; border-radius: 7px; background: rgba(255,255,255,.85); color: #556173; font-size: 12px; font-weight: 650; cursor: pointer; }
        .recognition-stop:disabled { cursor: wait; opacity: .55; }
        .recognition-warning { grid-column: 1 / -1; color: #b46400; font-size: 12px; }
        .recognition-section { margin-bottom: 12px; padding: 20px 22px; }
        .recognition-section h2 { margin: 0; color: #1b2535; font-size: 15px; font-weight: 750; letter-spacing: .01em; }
        .recognition-flow { position: relative; margin-bottom: 6px; padding: 6px 64px 16px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
        .recognition-refresh { position: absolute; top: 3px; right: 2px; padding: 5px 11px; border: 1px solid #dce3ed; border-radius: 7px; background: #fff; color: #718096; font-size: 11px; font-weight: 600; cursor: pointer; }
        .recognition-refresh:hover { border-color: #c7d3e2; color: #455267; }
        .recognition-refresh:focus-visible { outline: 3px solid rgba(18, 101, 244, .18); outline-offset: 2px; }
        .recognition-steps { display: grid; width: min(100%, 1040px); grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; margin: 0 auto; }
        .recognition-step { position: relative; display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 9px; min-width: 0; opacity: .72; }
        .recognition-step:not(:last-child)::after { content: ''; position: absolute; top: 15px; left: calc(100% + 5px); width: 18px; border-top: 1px solid #dce2eb; }
        .recognition-step-marker { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid #d5dce7; border-radius: 50%; background: transparent; color: #8a94a4; font-size: 12px; font-weight: 650; }
        .recognition-step strong, .recognition-step span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .recognition-step strong { color: #657083; font-size: 12px; font-weight: 650; }
        .recognition-step span { margin-top: 2px; color: #9aa2af; font-size: 10px; }
        .recognition-step.is-active { opacity: 1; }
        .recognition-step.is-active .recognition-step-marker { border-color: #9bbcf8; background: #edf4ff; box-shadow: none; color: #1265f4; }
        .recognition-step.is-active strong { color: #172033; }
        .recognition-step.is-complete .recognition-step-marker { border-color: #c9dfd4; background: #f2faf6; color: #4a9b73; }
        .recognition-result { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 20px 26px; }
        .recognition-result-head { display: flex; flex-direction: column; justify-content: space-between; gap: 16px; }
        .recognition-result-head > div:first-child > span { display: block; margin-top: 6px; color: #8a94a3; font-size: 11px; }
        .recognition-result-state { display: flex; align-items: center; gap: 9px; color: #445065; font-size: 13px; font-weight: 650; }
        .recognition-result-state > span { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 50%; background: #e9f8f0; color: #17965c; font-size: 16px; }
        .recognition-result-state.has-warning > span { background: #fff3df; color: #e58b0a; }
        .recognition-result-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .recognition-metric { position: relative; min-height: 96px; padding: 18px 20px; border: 1px solid #e0e7f1; border-radius: 11px; background: #fff; text-align: left; }
        button.recognition-metric { cursor: pointer; transition: transform .16s ease, box-shadow .16s ease; }
        button.recognition-metric:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(33, 63, 106, .09); }
        button.recognition-metric:disabled { cursor: default; opacity: .68; }
        .recognition-metric strong, .recognition-metric span { display: block; }
        .recognition-metric strong { font-size: 24px; line-height: 1; font-weight: 760; font-variant-numeric: tabular-nums; }
        .recognition-metric span { margin-top: 9px; color: #667184; font-size: 12px; }
        .recognition-metric i { position: absolute; right: 18px; bottom: 15px; font-style: normal; font-size: 17px; }
        .recognition-metric.is-review { border-color: #d8ecdf; background: linear-gradient(135deg, #fff, #f6fcf8); }
        .recognition-metric.is-review strong, .recognition-metric.is-review i { color: #1c9b60; }
        .recognition-metric.is-error { border-color: #f2e4cc; background: linear-gradient(135deg, #fff, #fffaf2); }
        .recognition-metric.is-error strong, .recognition-metric.is-error i { color: #eb900f; }
        .recognition-metric.is-approved { border-color: #dce8fb; background: linear-gradient(135deg, #fff, #f5f9ff); }
        .recognition-metric.is-approved strong { color: #1463ed; }
        .recognition-result-note { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding-top: 2px; color: #788395; font-size: 12px; }
        .recognition-result-note > span { color: #8d99aa; }
        .recognition-toast { grid-column: 1 / -1; padding: 9px 12px; border-radius: 8px; font-size: 12px; }
        .recognition-toast.is-success { border: 1px solid #cdebdc; background: #f2fbf6; color: #148451; }
        .recognition-toast.is-error { border: 1px solid #f3d1ce; background: #fff5f4; color: #c4473d; }
        .recognition-primary-action button:focus-visible,
        .recognition-stop:focus-visible,
        .recognition-metric:focus-visible { outline: 3px solid rgba(18,101,244,.22); outline-offset: 2px; }
        .review-queue-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin: 28px 2px 12px; }
        .review-queue-heading h2 { margin: 0; color: #172033; font-size: 19px; font-weight: 750; letter-spacing: -.015em; }
        .review-queue-heading p { margin: 4px 0 0; color: #7a8596; font-size: 12px; }
        .review-queue-heading > span { flex: 0 0 auto; color: #667184; font-size: 12px; font-variant-numeric: tabular-nums; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes ocr-scan { from { transform: translateX(-120%); } to { transform: translateX(420%); } }
        .ocr-progress-card {
          padding: 16px;
          margin-bottom: 12px;
          border: 1px solid ${theme.colors.accentBorder};
          border-radius: ${theme.radius.lg}px;
          background: linear-gradient(135deg, ${theme.colors.accentBg} 0%, ${theme.colors.bgCard} 72%);
        }
        .ocr-progress-track {
          position: relative;
          height: 8px;
          margin-top: 14px;
          overflow: hidden;
          border-radius: 999px;
          background: ${theme.colors.border};
        }
        .ocr-progress-fill {
          position: relative;
          height: 100%;
          overflow: hidden;
          border-radius: inherit;
          background: ${theme.colors.accent};
          transition: width .35s ease;
        }
        .ocr-progress-fill::after {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 28%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent);
          animation: ocr-scan 1.8s ease-in-out infinite;
        }
        .ocr-progress-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1px;
          margin-top: 12px;
          overflow: hidden;
          border: 1px solid ${theme.colors.borderLight};
          border-radius: ${theme.radius.md}px;
          background: ${theme.colors.borderLight};
        }
        .ocr-progress-stats.analysis-progress-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .ocr-progress-stats > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          padding: 8px 10px;
          background: rgba(255,255,255,.82);
        }
        .ocr-progress-stats strong { font-family: ${theme.typography.fontMono}; font-size: 15px; color: ${theme.colors.text.primary}; }
        .ocr-progress-stats span { overflow: hidden; color: ${theme.colors.text.tertiary}; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .review-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 14px;
        }
        .review-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid ${theme.colors.borderLight};
          border-radius: 10px;
          background: ${theme.colors.bgCard};
          box-shadow: ${theme.shadow.card};
          transition: transform .15s, border-color .15s, box-shadow .15s;
        }
        .review-card:hover { transform: translateY(-1px); border-color: ${theme.colors.borderFocus}; box-shadow: ${theme.shadow.elevated}; }
        .review-card.is-selected { border-color: ${theme.colors.text.primary}; box-shadow: 0 0 0 2px rgba(30,30,35,.14); }
        .review-card.is-expanded { grid-column: 1 / -1; }
        .review-card.is-manual-editing { grid-column: 1 / -1; cursor: default; }
        .review-card.is-manual-editing:hover { transform: none; }
        .review-card.is-managing { cursor: pointer; }
        .review-card.is-managing.is-manual-editing { cursor: default; }
        .review-card-summary { display: flex; flex-direction: column; }
        .review-card:not(.is-manual-editing) .review-card-summary { height: 100%; }
        .review-select {
          position: absolute; top: 10px; left: 10px; z-index: 2;
          display: flex; align-items: center; gap: 6px;
          padding: 6px 9px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,.8); background: rgba(255,255,255,.94);
          box-shadow: ${theme.shadow.popover}; font-size: 11px; font-weight: 700;
        }
        .review-select input { width: 16px; height: 16px; margin: 0; accent-color: ${theme.colors.text.primary}; }
        .review-manual-edit {
          position: absolute; top: 10px; right: 10px; z-index: 2;
          min-height: 29px; padding: 0 10px; border: 1px solid rgba(255,255,255,.86);
          border-radius: 7px; background: rgba(255,255,255,.95); color: #1e5fc7;
          font-size: 11px; font-weight: 750; cursor: pointer;
        }
        .manual-case-editor { padding: 18px; border-top: 1px solid #e7ebf1; background: #fbfcfe; }
        .manual-case-editor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
        .manual-case-editor-head strong, .manual-case-editor-head span { display: block; }
        .manual-case-editor-head strong { color: #182234; font-size: 15px; }
        .manual-case-editor-head span { margin-top: 3px; color: #7c8797; font-size: 11px; }
        .manual-case-editor-head button { border: 0; background: transparent; color: #768194; font-size: 12px; cursor: pointer; }
        .manual-case-editor label > span { display: block; margin-bottom: 6px; color: #4f5b6d; font-size: 11px; font-weight: 650; }
        .manual-case-editor label b { color: #d35b50; font-size: 9px; font-weight: 700; }
        .manual-case-editor input, .manual-case-editor select {
          width: 100%; min-height: 38px; padding: 0 10px; border: 1px solid #d8e0eb;
          border-radius: 7px; background: #fff; color: #1e293b; font: inherit; font-size: 12px;
          box-sizing: border-box;
        }
        .manual-case-editor input:focus, .manual-case-editor select:focus { outline: 3px solid rgba(18,101,244,.12); border-color: #82aaf3; }
        .manual-source-field { display: block; margin-bottom: 13px; }
        .manual-classification-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
        .manual-case-error { margin-top: 12px; padding: 8px 10px; border-radius: 7px; background: #fff2f1; color: #b94a42; font-size: 11px; }
        .manual-case-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        .manual-case-actions button { min-height: 34px; padding: 0 13px; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer; }
        .manual-case-actions .is-secondary { border: 1px solid #d8e0eb; background: #fff; color: #667184; }
        .manual-case-actions .is-primary { border: 1px solid #1265f4; background: #1265f4; color: #fff; }
        .manual-case-actions button:disabled { cursor: wait; opacity: .58; }
        @media (prefers-reduced-motion: reduce) {
          .ocr-progress-fill { transition: none; }
          .ocr-progress-fill::after { animation: none; }
          .recognition-progress-fill { transition: none; }
          .recognition-progress-fill::after { animation: none; }
        }
        @media (max-width: 900px) {
          .recognition-idle { grid-template-columns: 86px 1fr; padding: 24px; }
          .recognition-primary-action { grid-column: 1 / -1; justify-self: stretch; }
          .recognition-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 20px; }
          .recognition-step:nth-child(2)::after { display: none; }
          .recognition-result { grid-template-columns: 1fr; }
          .recognition-result-head { flex-direction: row; align-items: center; }
          .manual-classification-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 620px) {
          .recognition-hero, .recognition-section { border-radius: 12px; }
          .recognition-idle { grid-template-columns: 64px 1fr; gap: 16px; padding: 20px; }
          .recognition-inbox-icon { width: 62px; height: 62px; }
          .recognition-count { font-size: 38px; }
          .recognition-live { padding: 22px 20px; }
          .recognition-live-title { font-size: 17px; }
          .recognition-live-value { font-size: 28px; }
          .recognition-live-footer { align-items: flex-start; flex-direction: column; }
          .recognition-steps { grid-template-columns: 1fr; }
          .recognition-step:not(:last-child)::after { top: calc(100% + 4px); left: 14px; width: 1px; height: 12px; border-top: 0; border-left: 1px solid #d8dfeb; }
          .recognition-result-grid { grid-template-columns: 1fr; }
          .recognition-metric { min-height: 82px; }
          .review-queue-heading { align-items: flex-start; flex-direction: column; gap: 5px; }
          .manual-classification-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 540px) { .ocr-progress-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 680px) { .review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
        @media (max-width: 430px) { .review-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* ═══════ Section 3: Queue Switcher ═══════ */}
      <div className="review-queue-heading">
        <div>
          <h2>人工审核</h2>
          <p>识别完成的图片会来到这里；确认后才会正式进入案例库。</p>
        </div>
        <span>{reviewReadyCount + failedCount} 张待处理</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {panels.filter(p => ['needs_review', 'low_confidence', 'failed'].includes(p.key)).map(p => {
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: theme.typography.size['2xl'], fontWeight: 600, color: theme.colors.text.primary }}>
                  {queueConfig.label}
                  <span style={{ fontSize: theme.typography.size.base, fontWeight: 400, color: theme.colors.text.secondary, marginLeft: 8 }}>
                    {queueCount}
                  </span>
                </h2>
                <p style={{ fontSize: theme.typography.size.sm, color: theme.colors.text.secondary, marginTop: 2 }}>
                  {queueConfig.description}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {(activePanel === 'needs_review' || activePanel === 'low_confidence') && (
                  <button
                    onClick={handleApproveAll}
                    disabled={approvingAll || queueCount === 0}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8, border: 'none',
                      background: approvingAll || queueCount === 0 ? theme.colors.greenBg : theme.colors.green,
                      color: approvingAll || queueCount === 0 ? theme.colors.green : '#fff',
                      cursor: approvingAll || queueCount === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 800,
                    }}
                  >
                    {approvingAll ? '入库中…' : `一键入库（${queueCount}）`}
                  </button>
                )}
                <button
                  onClick={() => {
                    setManagementMode(current => {
                      if (current) {
                        setSelectedCaseIds(new Set());
                        setEditingCaseId(null);
                        setManualDraft(null);
                        setManualEditError('');
                      }
                      return !current;
                    });
                    setExpandedCase(null);
                  }}
                  style={{
                    height: 34, padding: '0 14px', borderRadius: 8,
                    border: `1px solid ${managementMode ? theme.colors.text.primary : theme.colors.border}`,
                    background: managementMode ? theme.colors.text.primary : theme.colors.bgCard,
                    color: managementMode ? theme.colors.bgCard : theme.colors.text.secondary,
                    cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  }}
                >
                  {managementMode ? '退出管理' : activePanel === 'failed' ? '管理与人工分类' : '管理'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activePanel && managementMode && (
          <div style={{
            position: 'sticky', top: 8, zIndex: 20, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16,
            padding: '10px 12px', borderRadius: 9, border: `1px solid ${theme.colors.border}`,
            background: 'rgba(255,255,255,.96)', boxShadow: theme.shadow.card, backdropFilter: 'blur(10px)',
          }}>
            <strong style={{ fontSize: 13, color: theme.colors.text.primary }}>
              {activePanel === 'failed' ? '可选择删除，或在图片右上角编辑分类与来源' : `已选 ${selectedCount} 项`}
              <span style={{ color: theme.colors.text.tertiary, fontWeight: 400 }}> · 当前显示 {cases.length} 项</span>
            </strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={allLoadedSelected ? () => setSelectedCaseIds(new Set()) : selectAllLoaded} disabled={cases.length === 0}
                style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard, color: theme.colors.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                {allLoadedSelected ? '取消全选' : '全选当前页'}
              </button>
              <button onClick={handleSelectedDelete} disabled={!selectedCount || selectionWorking}
                style={{ height: 32, padding: '0 13px', borderRadius: 8, border: `1px solid ${theme.colors.redBorder}`, background: !selectedCount ? theme.colors.redBg : theme.colors.red, color: !selectedCount ? theme.colors.red : '#fff', cursor: !selectedCount ? 'not-allowed' : 'pointer', opacity: !selectedCount ? .55 : 1, fontSize: 12, fontWeight: 800 }}>
                {selectionWorking ? '处理中…' : '删除所选'}
              </button>
            </div>
          </div>
        )}

        {activePanel && batchResult && !batchType && (
          <div style={{
            marginBottom: 14, padding: '9px 12px', borderRadius: 8,
            border: `1px solid ${batchResult.success ? theme.colors.greenBorder : theme.colors.redBorder}`,
            background: batchResult.success ? theme.colors.greenBg : theme.colors.redBg,
            color: batchResult.success ? theme.colors.green : theme.colors.red,
            fontSize: 13, fontWeight: 600,
          }}>
            {batchResult.message}
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

        <div className="review-grid">
          {cases.map(c => {
            const isExpanded = expandedCase === c.id;
            const actions = queueActions;
            const selected = selectedCaseIds.has(c.id);
            const isManualEditing = editingCaseId === c.id && manualDraft;

            return (
              <div
                key={c.id}
                className={`review-card${isExpanded ? ' is-expanded' : ''}${managementMode ? ' is-managing' : ''}${selected ? ' is-selected' : ''}${isManualEditing ? ' is-manual-editing' : ''}`}
                aria-selected={managementMode ? selected : undefined}
                onClick={managementMode ? () => toggleCaseSelection(c.id) : undefined}
              >
                {/* Task Item Row */}
                <div className="review-card-summary">
                  {/* Left: Thumbnail + Info */}
                  <div style={{
                    width: '100%', height: isExpanded ? 260 : 170, overflow: 'hidden',
                    background: theme.colors.bgSubtle, flexShrink: 0, position: 'relative',
                  }}>
                    {imageCandidates(c).length > 0 ? (
                      <img src={imageCandidates(c)[0]} alt={c.caseTitle || c.pageTitle || c.title || ''} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        onError={handleImageError(c)} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: theme.colors.text.tertiary }}>无图片</div>
                    )}
                    {managementMode && (
                      <label className="review-select" onClick={event => event.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => toggleCaseSelection(c.id)} aria-label={`选择案例：${c.caseTitle || c.pageTitle || c.title || '未命名'}`} />
                        <span>{selected ? '已选' : '选择'}</span>
                      </label>
                    )}
                    {managementMode && activePanel === 'failed' && (
                      <button type="button" className="review-manual-edit" aria-expanded={Boolean(isManualEditing)} onClick={(event) => { event.stopPropagation(); beginManualEdit(c); }}>
                        编辑分类与来源
                      </button>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, padding: '12px 13px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: theme.typography.size.base, fontWeight: 600, color: theme.colors.text.primary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.caseTitle || c.pageTitle || c.title || '未命名'}
                      </span>
                    </div>
                    <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.sourceDomain || '未知来源'}{c.discipline ? ` · ${c.discipline}` : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                      {[c.functionalPurpose, c.distributionMedium, c.technicalMethod].filter(value => value && value !== '不确定').map(value => (
                        <span key={value} style={{ fontSize: 11, color: theme.colors.text.secondary, background: theme.colors.bgSubtle, padding: '2px 6px', borderRadius: 5 }}>
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  {!managementMode && <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', padding: '9px 13px 13px', marginTop: 'auto' }}>
                    {actions.map(act => (
                      <button
                        key={act.action + act.label}
                        onClick={(event) => { event.stopPropagation(); handleAction(c.id, act.action); }}
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
                      onClick={(event) => { event.stopPropagation(); setExpandedCase(isExpanded ? null : c.id); }}
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
                  </div>}
                </div>

                {isManualEditing && (
                  <div id={`manual-editor-${c.id}`} className="manual-case-editor" onClick={event => event.stopPropagation()}>
                    <div className="manual-case-editor-head">
                      <div><strong>人工修正</strong><span>保存后进入“待确认”，不会直接入库</span></div>
                      <button onClick={() => { setEditingCaseId(null); setManualDraft(null); setManualEditError(''); }}>关闭</button>
                    </div>
                    <label className="manual-source-field">
                      <span>来源网址 <b>必填</b></span>
                      <input value={manualDraft.sourceUrl} onChange={event => updateManualDraft('sourceUrl', event.target.value)} placeholder="https://example.edu/article" inputMode="url" />
                    </label>
                    <div className="manual-classification-grid">
                      {[
                        ['functionalPurpose', '功能维度', FUNCTION_OPTIONS, true],
                        ['distributionMedium', '媒介维度', MEDIUM_OPTIONS, true],
                        ['technicalMethod', '技术维度', TECHNICAL_OPTIONS, true],
                        ['contentType', '内容类型', CONTENT_OPTIONS, false],
                        ['discipline', '学科', DISCIPLINE_OPTIONS, false],
                      ].map(([field, label, options, required]) => (
                        <label key={String(field)}>
                          <span>{String(label)} {required && <b>必填</b>}</span>
                          <select value={manualDraft[field as keyof ManualCaseDraft]} onChange={event => updateManualDraft(field as keyof ManualCaseDraft, event.target.value)}>
                            <option value="">请选择</option>
                            {(options as string[]).map(option => <option value={option} key={option}>{option}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                    {manualEditError && <div className="manual-case-error">{manualEditError}</div>}
                    <div className="manual-case-actions">
                      <button className="is-secondary" onClick={() => { setEditingCaseId(null); setManualDraft(null); setManualEditError(''); }}>取消</button>
                      <button className="is-primary" onClick={saveManualClassification} disabled={manualSaveWorking}>{manualSaveWorking ? '保存中…' : '保存并转入待确认'}</button>
                    </div>
                  </div>
                )}

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${theme.colors.borderLight}` }}>
                    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 280, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: theme.typography.size.xs }}>
                          {[
                            ['功能', c.functionalPurpose],
                            ['媒介', c.distributionMedium],
                            ['技术', c.technicalMethod],
                            ['内容类型', normalizeContentTypeLabel(c.contentType)],
                            ['学科', c.discipline],
                            ['构图', c.composition],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <div style={{ color: theme.colors.text.tertiary, fontWeight: 500, marginBottom: 1 }}>{label}</div>
                              <div style={{ color: value ? theme.colors.text.primary : theme.colors.text.tertiary }}>{value || '—'}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.secondary }}>
                          来源：{c.sourceUrl
                            ? <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.accent }}>{c.sourceDomain || '打开原网页'}</a>
                            : <span style={{ color: theme.colors.text.tertiary }}>缺少来源</span>}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
