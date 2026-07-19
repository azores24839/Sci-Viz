import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { withBaseUrl } from '../baseUrl';
import type { VisualCase, ReviewStatus, OcrJob, AnalysisJob, UserApiConfig, Pagination } from '../types';
import { theme } from '../theme';
import { StarRating } from '../components';

interface QueuePanel {
  key: string;
  label: string;
  count: number;
  retryableCount?: number;
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

const PANEL_MAP: Record<string, { status: string; ocrStatus?: 'unprocessed' }> = {
  pending_quality: { status: 'pending_ai_analysis', ocrStatus: 'unprocessed' },
  pending_ocr: { status: 'pending_ocr' },
  needs_review: { status: 'needs_review' },
  low_confidence: { status: 'low_confidence_review' },
  approved: { status: 'approved' },
  failed: { status: 'analysis_failed' },
  source_missing: { status: 'source_missing' },
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
    label: '预审素材',
    description: '先挑出值得处理的图片，再加入图片分析队列',
  },
  pending_ocr: {
    label: '等待图片分析',
    description: '已通过预审；等待生成摘要和三轴分类',
    accent: theme.colors.accent,
    accentBg: theme.colors.accentBg,
    accentBorder: theme.colors.accentBorder,
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
    label: '分析失败',
    description: '全库中模型未能完成图片分析的项目，可重试或人工处理',
    accent: theme.colors.purple,
    accentBg: theme.colors.purpleBg,
    accentBorder: theme.colors.purpleBorder,
  },
  source_missing: {
    label: '缺少来源',
    description: '图片分析已完成，需要补充可追溯的来源网址',
    accent: theme.colors.orange,
    accentBg: theme.colors.orangeBg,
    accentBorder: theme.colors.orangeBorder,
  },
};

const QUEUE_ACTIONS: Record<string, Array<{ label: string; action: 'approve' | 'reject' | 'reanalyze'; primary?: boolean }>> = {
  pending_quality: [],
  pending_ocr: [],
  needs_review: [],
  low_confidence: [
    { label: '重新分析', action: 'reanalyze' },
  ],
  approved: [],
  failed: [
    { label: '重试', action: 'reanalyze', primary: true },
  ],
  source_missing: [],
};

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'cancelling']);

const API_PROVIDER_PRESETS: Record<UserApiConfig['provider'], { label: string; endpoint: string; model: string; note: string }> = {
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'qwen/qwen2.5-vl-72b-instruct',
    note: '一个 Key 可选择 OpenRouter 上的多种视觉模型，适合团队统一使用。',
  },
  dashscope: {
    label: '阿里云百炼（Qwen）',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen3-vl-plus',
    note: '适合直接使用阿里云购买的 Qwen Key；不同地域或工作空间可修改 API 地址。',
  },
  custom: {
    label: '其他 OpenAI 兼容服务',
    endpoint: '',
    model: '',
    note: '只支持兼容 Chat Completions 且能接收图片的视觉模型。',
  },
};

function panelRequestParams(key: string, page: number): Record<string, string> {
  const config = PANEL_MAP[key];
  if (!config) return {};
  const params: Record<string, string> = { limit: '100', page: String(page) };
  params.review_status = config.status;
  if (config.ocrStatus) params.ocr_status = config.ocrStatus;
  return params;
}

export default function ReviewPage() {
  const [workflowTab, setWorkflowTab] = useState<'preflight' | 'processing'>('preflight');
  const [panels, setPanels] = useState<QueuePanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [cases, setCases] = useState<VisualCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesLoadingMore, setCasesLoadingMore] = useState(false);
  const [casePagination, setCasePagination] = useState<Pagination>({ total: 0, page: 1, limit: 100, totalPages: 0 });
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [managementMode, setManagementMode] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [selectionWorking, setSelectionWorking] = useState(false);
  const [caseActionWorkingId, setCaseActionWorkingId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualCaseDraft | null>(null);
  const [manualSaveWorking, setManualSaveWorking] = useState(false);
  const [manualEditError, setManualEditError] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);
  const [approvingCurrentPage, setApprovingCurrentPage] = useState(false);
  const [analysisStartWorking, setAnalysisStartWorking] = useState(false);
  const [ocrStartWorking, setOcrStartWorking] = useState(false);
  const [batchResult, setBatchResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ocrJob, setOcrJob] = useState<OcrJob | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [analysisPollingWarning, setAnalysisPollingWarning] = useState('');
  const [analysisCancelWorking, setAnalysisCancelWorking] = useState(false);
  const [ocrCancelWorking, setOcrCancelWorking] = useState(false);
  const [apiConfig, setApiConfig] = useState<UserApiConfig | null>(null);
  const [apiConfigOpen, setApiConfigOpen] = useState(false);
  const [apiConfigForm, setApiConfigForm] = useState({
    provider: 'openrouter' as UserApiConfig['provider'], endpoint: API_PROVIDER_PRESETS.openrouter.endpoint,
    model: API_PROVIDER_PRESETS.openrouter.model, apiKey: '',
  });
  const [apiConfigWorking, setApiConfigWorking] = useState(false);
  const [apiConfigMessage, setApiConfigMessage] = useState<{ success: boolean; text: string } | null>(null);
  const observedActiveAnalysisRef = useRef(false);
  const handledAnalysisTerminalRef = useRef('');
  const lastAnalysisStatusRefreshRef = useRef(0);
  const taskListRef = useRef<HTMLDivElement>(null);
  const panelRequestRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.getQueueStatus();
      if (!res.success) throw new Error(res.error || '队列状态加载失败');
      setPanels(res.data.panels);
      setStatusError('');
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : '队列状态加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!apiConfigOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setApiConfigOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [apiConfigOpen]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    api.getUserApiConfig().then(res => { if (res.success) setApiConfig(res.data); }).catch(() => {});
  }, []);

  const openApiConfig = () => {
    const provider = apiConfig?.provider || 'openrouter';
    const preset = API_PROVIDER_PRESETS[provider];
    setApiConfigForm({
      provider,
      endpoint: apiConfig?.endpoint || preset.endpoint,
      model: apiConfig?.model || preset.model,
      apiKey: '',
    });
    setApiConfigMessage(null);
    setApiConfigOpen(true);
  };

  const selectApiProvider = (provider: UserApiConfig['provider']) => {
    const preset = API_PROVIDER_PRESETS[provider];
    setApiConfigForm(current => ({ ...current, provider, endpoint: preset.endpoint, model: preset.model }));
    setApiConfigMessage(null);
  };

  const saveApiConfig = async () => {
    setApiConfigWorking(true);
    setApiConfigMessage(null);
    try {
      const saved = await api.saveUserApiConfig(apiConfigForm);
      if (!saved.success) throw new Error(saved.error || '保存失败');
      setApiConfig(saved.data);
      setApiConfigForm(current => ({ ...current, apiKey: '' }));
      setApiConfigMessage({ success: true, text: '已保存。Qwen 图片分析会使用你的 Key。' });
    } catch (error) {
      setApiConfigMessage({ success: false, text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setApiConfigWorking(false);
    }
  };

  const testApiConfig = async () => {
    setApiConfigWorking(true);
    setApiConfigMessage(null);
    try {
      const result = await api.testUserApiConfig();
      if (!result.success) throw new Error(result.error || '连接测试失败');
      setApiConfigMessage({ success: true, text: result.data.message });
    } catch (error) {
      setApiConfigMessage({ success: false, text: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setApiConfigWorking(false);
    }
  };

  const removeApiConfig = async () => {
    setApiConfigWorking(true);
    setApiConfigMessage(null);
    try {
      const result = await api.deleteUserApiConfig();
      if (!result.success) throw new Error(result.error || '删除配置失败');
      setApiConfig(result.data);
      setApiConfigOpen(false);
    } catch (error) {
      setApiConfigMessage({ success: false, text: error instanceof Error ? error.message : '删除配置失败' });
    } finally {
      setApiConfigWorking(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    Promise.all([api.getLatestOcrJob(), api.getLatestAnalysisJob()]).then(([ocrRes, analysisRes]) => {
      if (disposed) return;
      if (ocrRes.success) setOcrJob(ocrRes.data);
      if (analysisRes.success) setAnalysisJob(analysisRes.data);
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);

  const analysisIsActive = Boolean(analysisJob && ACTIVE_JOB_STATUSES.has(analysisJob.status));
  const ocrIsActive = Boolean(ocrJob && ACTIVE_JOB_STATUSES.has(ocrJob.status));

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
          const now = Date.now();
          if (now - lastAnalysisStatusRefreshRef.current >= 3000) {
            lastAnalysisStatusRefreshRef.current = now;
            await fetchStatus();
            if (disposed) return;
          }
        } else {
          consecutiveFailures += 1;
        }
      } catch {
        consecutiveFailures += 1;
      }
      if (!disposed) {
        if (consecutiveFailures >= 3) setAnalysisPollingWarning('进度连接暂时中断，图片分析任务仍会在后台继续');
        timer = setTimeout(poll, consecutiveFailures > 0 ? 2000 : 1000);
      }
    };

    timer = setTimeout(poll, 500);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [analysisJob?.id, analysisIsActive, fetchStatus]);

  const fetchPanelCases = useCallback(async (key: string, preserveMessage = false) => {
    const requestId = ++panelRequestRef.current;
    setCasesLoading(true);
    setCasesLoadingMore(false);
    setActivePanel(key);
    setCases([]);
    setCasePagination({ total: 0, page: 1, limit: 100, totalPages: 0 });
    if (!preserveMessage) setBatchResult(null);
    setSelectedCaseIds(new Set());
    // Preflight is intentionally always actionable: reloads after deleting or
    // queueing must not hide the selection controls.
    setManagementMode(key === 'pending_quality');
    setExpandedCase(null);
    setEditingCaseId(null);
    setManualDraft(null);
    setManualEditError('');
    if (!PANEL_MAP[key]) { setCasesLoading(false); return; }
    try {
      const res = await api.getCases(panelRequestParams(key, 1));
      if (requestId !== panelRequestRef.current) return;
      if (res.success) {
        setCases(res.data);
        if (res.pagination) setCasePagination(res.pagination);
      } else {
        setBatchResult({ success: false, message: res.error || '案例列表加载失败' });
      }
    } catch (error) {
      if (requestId === panelRequestRef.current) {
        setBatchResult({ success: false, message: error instanceof Error ? error.message : '案例列表加载失败' });
      }
    } finally {
      if (requestId === panelRequestRef.current) setCasesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workflowTab === 'preflight' && activePanel === 'pending_quality') setManagementMode(true);
  }, [activePanel, workflowTab]);

  const loadMorePanelCases = useCallback(async () => {
    if (!activePanel || casesLoadingMore || casePagination.page >= casePagination.totalPages) return;
    const requestId = panelRequestRef.current;
    const panelKey = activePanel;
    setCasesLoadingMore(true);
    try {
      const res = await api.getCases(panelRequestParams(panelKey, casePagination.page + 1));
      if (requestId !== panelRequestRef.current || panelKey !== activePanel) return;
      if (res.success) {
        setCases(current => {
          const existing = new Set(current.map(item => item.id));
          return [...current, ...res.data.filter(item => !existing.has(item.id))];
        });
        if (res.pagination) setCasePagination(res.pagination);
      }
    } catch {
      if (requestId === panelRequestRef.current) setBatchResult({ success: false, message: '加载更多案例失败，请重试' });
    } finally {
      if (requestId === panelRequestRef.current) setCasesLoadingMore(false);
    }
  }, [activePanel, casePagination.page, casePagination.totalPages, casesLoadingMore]);

  useEffect(() => {
    if (!ocrJob || !ocrIsActive) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const res = await api.getOcrJob(ocrJob.id);
        if (disposed) return;
        if (res.success) {
          setOcrJob(res.data);
          // OCR writes the review status for each successful image in the same database
          // transaction. Refresh queue totals on every progress update so the “待确认”
          // card advances together with the OCR “已处理” counter.
          await fetchStatus();
          if (disposed) return;
          if (!ACTIVE_JOB_STATUSES.has(res.data.status)) {
            setBatchResult({
              success: res.data.status === 'completed',
              message: res.data.status === 'completed'
                ? `OCR 完成：${res.data.updated} 张提取到文字，${res.data.skipped} 张无文字，${res.data.failed} 张失败`
                : res.data.error || 'OCR 任务未完成',
            });
            if (activePanel) await fetchPanelCases(activePanel, true);
            return;
          }
        }
      } catch { /* 下次轮询重试 */ }
      if (!disposed) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 500);
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [activePanel, fetchPanelCases, fetchStatus, ocrIsActive, ocrJob?.id]);

  useEffect(() => {
    if (!analysisJob || analysisIsActive || !observedActiveAnalysisRef.current) return;
    const terminalKey = `${analysisJob.id}:${analysisJob.status}`;
    if (handledAnalysisTerminalRef.current === terminalKey) return;
    handledAnalysisTerminalRef.current = terminalKey;
    observedActiveAnalysisRef.current = false;

    if (analysisJob.status === 'completed') {
      setBatchResult({ success: analysisJob.failed === 0, message: `图片分析完成：${analysisJob.analyzed} 张成功，${analysisJob.failed} 张失败` });
    } else if (analysisJob.status === 'cancelled') {
      setBatchResult({ success: true, message: `图片分析已停止：已完成 ${analysisJob.processed}/${analysisJob.total} 张` });
    } else {
      setBatchResult({ success: false, message: analysisJob.error || '图片分析任务异常终止' });
    }
    void fetchStatus();
    if (activePanel) void fetchPanelCases(activePanel, true);
  }, [activePanel, analysisIsActive, analysisJob, fetchPanelCases, fetchStatus]);

  useEffect(() => {
    if (loading || activePanel || panels.length === 0) return;
    if (workflowTab === 'preflight') {
      void fetchPanelCases('pending_quality');
      return;
    }
    const firstPanel = panels.find(panel => panel.key === 'pending_ocr' && panel.count > 0)
      ?? panels.find(panel => panel.key === 'needs_review' && panel.count > 0)
      ?? panels.find(panel => panel.key === 'low_confidence' && panel.count > 0)
      ?? panels.find(panel => panel.key === 'failed' && panel.count > 0)
      ?? panels.find(panel => panel.key === 'source_missing' && panel.count > 0);
    if (firstPanel) fetchPanelCases(firstPanel.key);
  }, [activePanel, fetchPanelCases, loading, panels, workflowTab]);

  const startPendingOcr = async () => {
    const count = panelCount('pending_ocr');
    if (ocrStartWorking || ocrIsActive || analysisIsActive || count === 0) return;
    if (count > 20 && !window.confirm(`将对 ${count} 张图片执行图片分析，生成摘要和三轴分类，并可能产生模型费用。确定继续吗？`)) return;
    setOcrStartWorking(true);
    setBatchResult(null);
    try {
      const res = await api.startAnalysisJob(undefined, ['pending_ocr']);
      if (res.success) {
        observedActiveAnalysisRef.current = ACTIVE_JOB_STATUSES.has(res.data.status);
        setAnalysisJob(res.data);
        setBatchResult({ success: true, message: `图片分析已启动，本批 ${res.data.total} 张` });
      } else {
        setBatchResult({ success: false, message: res.error || '图片分析启动失败' });
      }
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '图片分析启动异常' });
    } finally {
      setOcrStartWorking(false);
    }
  };

  const reanalyzeAllFailed = async () => {
    if (analysisStartWorking || analysisIsActive || ocrIsActive || retryableFailedCount === 0) return;
    if (!window.confirm(`将重新分析 ${retryableFailedCount} 张失败图片，并产生模型费用。缺少来源的案例位于独立分组，不会重复分析。确定继续吗？`)) return;
    setAnalysisStartWorking(true);
    setBatchResult(null);
    try {
      const res = await api.startAnalysisJob(undefined, ['analysis_failed']);
      if (res.success) {
        observedActiveAnalysisRef.current = ACTIVE_JOB_STATUSES.has(res.data.status);
        setAnalysisJob(res.data);
        setBatchResult({ success: true, message: `已启动重新分析，共 ${res.data.total} 张` });
      } else {
        setBatchResult({ success: false, message: res.error || '重新分析启动失败' });
      }
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '重新分析启动异常' });
    } finally {
      setAnalysisStartWorking(false);
    }
  };

  const cancelCurrentAnalysis = async () => {
    if (!analysisJob || !analysisIsActive || analysisCancelWorking) return;
    setAnalysisCancelWorking(true);
    try {
      const res = await api.cancelAnalysisJob(analysisJob.id);
      if (res.success) setAnalysisJob(res.data);
      else setBatchResult({ success: false, message: res.error || '无法停止图片分析' });
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '无法停止图片分析' });
    } finally {
      setAnalysisCancelWorking(false);
    }
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

  const handleAction = async (caseId: string, action: 'approve' | 'reject' | 'reanalyze') => {
    if (caseActionWorkingId) return;
    setCaseActionWorkingId(caseId);
    setBatchResult(null);
    try {
      if (action === 'approve' || action === 'reject') {
        const reviewStatus = action === 'approve' ? 'approved' : 'rejected';
        const result = await api.updateCase(caseId, { reviewStatus: reviewStatus as ReviewStatus } as Partial<VisualCase>);
        if (!result.success) throw new Error(result.error || '状态更新失败');
        setCases(prev => prev.filter(c => c.id !== caseId));
        setCasePagination(current => ({ ...current, total: Math.max(0, current.total - 1) }));
      } else {
        if (analysisIsActive || ocrIsActive) throw new Error('已有图片任务正在运行，请稍后重试');
        const result = await api.startAnalysisJob([caseId]);
        if (!result.success) throw new Error(result.error || '重新分析启动失败');
        observedActiveAnalysisRef.current = ACTIVE_JOB_STATUSES.has(result.data.status);
        setAnalysisJob(result.data);
        setBatchResult({ success: true, message: '已加入重新分析任务' });
      }
      await fetchStatus();
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '操作失败' });
    } finally {
      setCaseActionWorkingId(null);
    }
  };

  const handleApproveAll = async () => {
    if (approvingAll || approvingCurrentPage || !activePanel) return;
    const status = activePanel === 'needs_review'
      ? 'needs_review'
      : activePanel === 'low_confidence'
        ? 'low_confidence_review'
        : null;
    if (!status) return;
    if (!window.confirm(`确定将该分组中的 ${queueCount} 个案例全部收入案例库吗？`)) return;

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

  const handleApproveCurrentPage = async () => {
    const ids = cases
      .filter(item => item.reviewStatus === 'needs_review')
      .map(item => item.id);
    if (activePanel !== 'needs_review' || ids.length === 0 || approvingAll || approvingCurrentPage) return;
    if (!window.confirm(`确定将当前已加载的 ${ids.length} 个案例收入案例库吗？未加载的待确认案例不会受影响。`)) return;

    setApprovingCurrentPage(true);
    setBatchResult(null);
    try {
      const res = await api.batchApprove(['needs_review'], ids);
      if (!res.success) throw new Error(res.error || '入库失败');
      setBatchResult({ success: true, message: `已将当前已加载的 ${res.data.approved} 个案例收入案例库` });
      await fetchStatus();
      await fetchPanelCases('needs_review', true);
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '入库失败' });
    } finally {
      setApprovingCurrentPage(false);
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
      const deletedIds = new Set(res.data.deletedIds);
      setCases(current => current.filter(item => !deletedIds.has(item.id)));
      setCasePagination(current => ({ ...current, total: Math.max(0, current.total - res.data.deleted) }));
      setSelectedCaseIds(new Set());
      setBatchResult({ success: true, message: `已删除 ${res.data.deleted} 个案例` });
      await fetchStatus();
      // Keep this preflight batch stable while the user screens it.  Reloading
      // here would pull new records into the first 100 immediately after every
      // deletion; the next refill happens only after the user queues a batch
      // for analysis (handleQueueSelectedForOcr).
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '删除失败' });
    } finally {
      setSelectionWorking(false);
    }
  };

  const handleQueueSelectedForOcr = async () => {
    const ids = [...selectedCaseIds];
    if (activePanel !== 'pending_quality' || ids.length === 0 || selectionWorking) return;
    setSelectionWorking(true);
    setBatchResult(null);
    try {
      const res = await api.queueCasesForOcr(ids);
      if (!res.success) throw new Error(res.error || '加入图片分析队列失败');
      setSelectedCaseIds(new Set());
      setBatchResult({ success: true, message: `已将 ${res.data.queued} 张图片加入图片分析队列；你可以继续预审下一页。` });
      await fetchStatus();
      await fetchPanelCases('pending_quality', true);
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '加入图片分析队列失败' });
    } finally {
      setSelectionWorking(false);
    }
  };

  const handleSelectedApprove = async () => {
    const ids = cases
      .filter(item => selectedCaseIds.has(item.id) && item.reviewStatus === 'needs_review')
      .map(item => item.id);
    if (activePanel !== 'needs_review' || ids.length === 0 || selectionWorking) return;
    if (!window.confirm(`确定将已选的 ${ids.length} 个案例收入案例库吗？`)) return;

    setSelectionWorking(true);
    setBatchResult(null);
    try {
      const res = await api.batchApprove(['needs_review'], ids);
      if (!res.success) throw new Error(res.error || '入库失败');
      setBatchResult({ success: true, message: `已将 ${res.data.approved} 个案例收入案例库` });
      await fetchStatus();
      await fetchPanelCases('needs_review', true);
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '入库失败' });
    } finally {
      setSelectionWorking(false);
    }
  };

  const handleSelectedReanalyze = async () => {
    const ids = cases
      .filter(item => selectedCaseIds.has(item.id) && item.reviewStatus === 'analysis_failed')
      .map(item => item.id);
    if (activePanel !== 'failed' || ids.length === 0 || selectionWorking || analysisIsActive || ocrIsActive) {
      if (activePanel === 'failed' && selectedCaseIds.size > 0 && ids.length === 0) {
        setBatchResult({ success: false, message: '所选案例均为“缺少来源”，请先补充来源信息，无需重复分析' });
      }
      return;
    }
    if (!window.confirm(`将重新分析所选的 ${ids.length} 张图片，并产生模型费用。确定继续吗？`)) return;

    setSelectionWorking(true);
    setBatchResult(null);
    try {
      const result = await api.startAnalysisJob(ids);
      if (!result.success) throw new Error(result.error || '重新分析启动失败');
      observedActiveAnalysisRef.current = ACTIVE_JOB_STATUSES.has(result.data.status);
      setAnalysisJob(result.data);
      setSelectedCaseIds(new Set());
      setManagementMode(false);
      setBatchResult({ success: true, message: `已将 ${result.data.total} 个案例加入重新分析任务` });
    } catch (error) {
      setBatchResult({ success: false, message: error instanceof Error ? error.message : '重新分析失败' });
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

  const openPreflight = async () => {
    setWorkflowTab('preflight');
    await fetchPanelCases('pending_quality');
    setManagementMode(true);
    setTimeout(() => taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const closePreflight = () => {
    setWorkflowTab('processing');
    panelRequestRef.current += 1;
    setActivePanel(null);
    setCases([]);
    setCasesLoading(false);
    setCasesLoadingMore(false);
    setSelectedCaseIds(new Set());
    setManagementMode(false);
    setExpandedCase(null);
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
  const pendingRecognitionCount = panelCount('pending_ocr');
  const pendingQualityCount = panelCount('pending_quality');
  const needsReviewCount = panelCount('needs_review');
  const lowConfidenceCount = panelCount('low_confidence');
  const reviewReadyCount = needsReviewCount + lowConfidenceCount;
  const failedCount = panelCount('failed');
  const sourceMissingCount = panelCount('source_missing');
  const retryableFailedCount = panels.find(panel => panel.key === 'failed')?.retryableCount ?? 0;
  const approvedCount = panelCount('approved');

  const queueConfig = activePanel ? QUEUE_CONFIG[activePanel] : null;
  const queueActions = activePanel ? (QUEUE_ACTIONS[activePanel] ?? []) : [];
  const queueCount = activePanel ? panelCount(activePanel) : 0;
  const selectedCount = selectedCaseIds.size;
  const allLoadedSelected = cases.length > 0 && cases.every(item => selectedCaseIds.has(item.id));
  const anyBatchRunning = analysisIsActive || ocrIsActive || analysisStartWorking || ocrStartWorking;
  const preflightMode = workflowTab === 'preflight';
  const analysisElapsed = analysisJob?.startedAt
    ? Math.max(0, Math.round((Date.now() - new Date(analysisJob.startedAt).getTime()) / 1000))
    : 0;
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80, color: theme.colors.text.tertiary }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      {statusError && (
        <div role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 12px', border: `1px solid ${theme.colors.redBorder}`, borderRadius: 9, background: theme.colors.redBg, color: theme.colors.red, fontSize: 12 }}>
          <span>工作台状态加载失败：{statusError}</span>
          <button type="button" onClick={fetchStatus} style={{ minHeight: 30, padding: '0 10px', border: `1px solid ${theme.colors.redBorder}`, borderRadius: 7, background: '#fff', color: theme.colors.red, cursor: 'pointer', fontWeight: 700 }}>重试</button>
        </div>
      )}
      <section className="recognition-section recognition-flow" aria-label="工作流切换">
        {!preflightMode && <button className={`recognition-api-key ${apiConfig?.configured ? 'is-configured' : ''}`} onClick={openApiConfig} title={apiConfig?.configured ? `已配置 ${apiConfig.keyHint || 'API Key'}` : '配置个人 API Key'}>
          <span aria-hidden="true" />API Key
        </button>}
        <div className="recognition-tabs" role="tablist" aria-label="处理工作区">
          <button role="tab" aria-selected={preflightMode} className={preflightMode ? 'is-active' : ''} onClick={openPreflight}>
            <strong>预审</strong><b>{pendingQualityCount}</b>
          </button>
          <button role="tab" aria-selected={!preflightMode} className={!preflightMode ? 'is-active' : ''} onClick={closePreflight}>
            <strong>图片分析与审核</strong><b>{panelCount('pending_ocr') + reviewReadyCount + failedCount + sourceMissingCount}</b>
          </button>
        </div>
      </section>

      {apiConfigOpen && (
        <div className="api-config-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setApiConfigOpen(false); }}>
          <section className="api-config-dialog" role="dialog" aria-modal="true" aria-labelledby="api-config-title">
            <header>
              <div><span className="api-config-eyebrow">个人费用配置</span><h2 id="api-config-title">使用自己的 API Key</h2></div>
              <button className="api-config-close" aria-label="关闭" onClick={() => setApiConfigOpen(false)}>×</button>
            </header>
            <p className="api-config-intro">保存后，Qwen 图片分析从你的账户计费。Key 会在服务器中加密保存，页面不会再次显示完整内容。</p>
            <div className="api-provider-grid">
              {(Object.keys(API_PROVIDER_PRESETS) as UserApiConfig['provider'][]).map(provider => (
                <button key={provider} className={apiConfigForm.provider === provider ? 'is-selected' : ''} onClick={() => selectApiProvider(provider)}>
                  <strong>{API_PROVIDER_PRESETS[provider].label}</strong><span>{provider === 'openrouter' ? '推荐' : provider === 'dashscope' ? 'Qwen 官方' : '高级'}</span>
                </button>
              ))}
            </div>
            <p className="api-provider-note">{API_PROVIDER_PRESETS[apiConfigForm.provider].note}</p>
            <label className="api-config-field"><span>API Key</span><input type="password" autoComplete="off" value={apiConfigForm.apiKey} onChange={event => setApiConfigForm({ ...apiConfigForm, apiKey: event.target.value })} placeholder={apiConfig?.source === 'personal' ? `已保存 ${apiConfig.keyHint}；留空表示不修改` : '粘贴你的 Key'} /></label>
            <label className="api-config-field"><span>模型名称</span><input value={apiConfigForm.model} onChange={event => setApiConfigForm({ ...apiConfigForm, model: event.target.value })} placeholder="例如 qwen3-vl-plus" /></label>
            <label className="api-config-field"><span>API 地址</span><input value={apiConfigForm.endpoint} onChange={event => setApiConfigForm({ ...apiConfigForm, endpoint: event.target.value })} placeholder="https://…/chat/completions" /></label>
            <div className="api-config-security"><span aria-hidden="true">⌁</span><p><strong>一人一份配置</strong>其他登录用户看不到也不会使用你的 Key；后台任务启动后会锁定到发起人的配置。</p></div>
            {apiConfigMessage && <div className={`api-config-message ${apiConfigMessage.success ? 'is-success' : 'is-error'}`}>{apiConfigMessage.text}</div>}
            <footer>
              <div>{apiConfig?.source === 'personal' && <button className="api-config-remove" disabled={apiConfigWorking} onClick={removeApiConfig}>改用服务器默认配置</button>}</div>
              <div className="api-config-actions"><button disabled={apiConfigWorking || apiConfig?.source !== 'personal'} onClick={testApiConfig}>测试连接</button><button className="is-primary" disabled={apiConfigWorking} onClick={saveApiConfig}>{apiConfigWorking ? '处理中…' : '保存配置'}</button></div>
            </footer>
          </section>
        </div>
      )}

      {!preflightMode && <section className={`recognition-hero ${analysisIsActive || ocrIsActive ? 'is-running' : ''}`} aria-label="图片识别任务">
        {ocrJob && ocrIsActive ? (
          <div className="recognition-live" aria-live="polite">
            <div className="recognition-live-copy">
              <div className="recognition-live-kicker">正在进行 OCR 识别</div>
              <div className="recognition-live-title">{ocrJob.currentCaseTitle || '正在准备识别队列'}</div>
              <div className="recognition-live-meta">本批已处理 {ocrJob.processed}/{ocrJob.total} · 提取文字 {ocrJob.updated} · 无文字 {ocrJob.skipped} · 本批 OCR 失败 {ocrJob.failed}{ocrJob.currentMethod ? ` · ${ocrJob.currentMethod}` : ''}</div>
            </div>
            <div className="recognition-live-value">{ocrJob.progress}%</div>
            <div className="recognition-progress-track" role="progressbar" aria-label="OCR 识别进度" aria-valuemin={0} aria-valuemax={ocrJob.total} aria-valuenow={ocrJob.processed}>
              <div className="recognition-progress-fill" style={{ width: `${ocrJob.progress}%` }} />
            </div>
            <div className="recognition-live-footer">
              <span>OCR 会在后台继续。完成后，图片将自动进入待确认队列。</span>
              <button className="recognition-stop" onClick={cancelCurrentOcr} disabled={ocrCancelWorking || ocrJob.status === 'cancelling'}>
                {ocrJob.status === 'cancelling' ? '正在停止…' : '完成当前张后停止'}
              </button>
            </div>
          </div>
        ) : analysisJob && analysisIsActive ? (
          <div className="recognition-live" aria-live="polite">
            <div className="recognition-live-copy">
              <div className="recognition-live-kicker">{analysisJob.status === 'cancelling' ? '正在停止图片分析' : '正在进行图片分析'}</div>
              <div className="recognition-live-title">{analysisJob.currentCaseTitle || '正在建立图片识别序列'}</div>
              <div className="recognition-live-meta">本批已处理 {analysisJob.processed}/{analysisJob.total} · 本批成功 {analysisJob.analyzed} · 本批分析失败 {analysisJob.failed} · 已用时 {analysisElapsed}s</div>
            </div>
            <div className="recognition-live-value">{analysisJob.progress}%</div>
            <div className="recognition-progress-track" role="progressbar" aria-label="图片识别进度" aria-valuemin={0} aria-valuemax={analysisJob.total} aria-valuenow={analysisJob.processed}>
              <div className="recognition-progress-fill" style={{ width: `${analysisJob.progress}%` }} />
            </div>
            <div className="recognition-live-footer">
              <span>任务可在后台继续。</span>
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
              <div className="recognition-count-row">
                <div className="recognition-count">{pendingRecognitionCount}<span>张</span></div>
              </div>
              <p>{pendingRecognitionCount > 0 ? '这些图片已完成预审，可开始生成摘要和三轴分类。' : '待分析队列为空；请先在“预审”中挑选图片。'}</p>
            </div>
            <div className="recognition-primary-action">
              <button type="button" onClick={startPendingOcr} disabled={pendingRecognitionCount === 0 || anyBatchRunning}>
                <span aria-hidden="true">▶</span>{ocrStartWorking ? '正在启动…' : analysisIsActive ? '图片分析中…' : pendingRecognitionCount > 0 ? '开始图片分析' : '前往预审挑选'}
              </button>
            </div>
          </div>
        )}
      </section>}

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
        .recognition-count-row { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
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
        .recognition-flow { position: relative; margin: 16px 0 20px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
        .recognition-tabs { display: flex; width: min(100%, 380px); min-height: 46px; margin: 0 auto; padding: 3px; border: 1px solid #e0e3e9; border-radius: 14px; background: #f3f4f6; box-shadow: inset 0 1px 2px rgba(28, 35, 48, .05); }
        .recognition-tabs button { flex: 1 1 50%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; padding: 0 10px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: #727b8d; font-family: ${theme.typography.fontFamily}; text-align: center; cursor: pointer; transition: color .16s ease, background .16s ease, box-shadow .16s ease; }
        .recognition-tabs button:hover:not(.is-active) { color: #3b4658; }
        .recognition-tabs button.is-active { border-color: #dfe2e7; background: #fff; box-shadow: 0 2px 7px rgba(29, 38, 54, .12); color: #2265f5; }
        .recognition-tabs strong { color: inherit; font-size: 14px; font-weight: 760; letter-spacing: -.03em; white-space: nowrap; }
        .recognition-tabs b { color: inherit; font-size: 14px; font-weight: 680; letter-spacing: -.015em; font-variant-numeric: tabular-nums; }
        .recognition-api-key { position: absolute; top: 3px; right: 2px; display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px; border: 1px solid #d9e1ec; border-radius: 8px; background: #fff; color: #536174; font-size: 11px; font-weight: 700; cursor: pointer; }
        .recognition-api-key > span { width: 7px; height: 7px; border-radius: 50%; background: #b8c2d0; box-shadow: 0 0 0 3px #f0f3f7; }
        .recognition-api-key.is-configured > span { background: #15a46d; box-shadow: 0 0 0 3px #def5eb; }
        .recognition-api-key:hover { border-color: #abc3e5; color: #1265f4; }
        .recognition-api-key:focus-visible { outline: 3px solid rgba(18, 101, 244, .18); outline-offset: 2px; }
        .api-config-backdrop { position: fixed; z-index: 1200; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(13, 24, 42, .42); backdrop-filter: blur(4px); }
        .api-config-dialog { width: min(100%, 620px); max-height: min(780px, calc(100vh - 40px)); overflow: auto; border: 1px solid #dce4ef; border-radius: 16px; background: #fff; box-shadow: 0 28px 80px rgba(20, 38, 65, .24); }
        .api-config-dialog > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding: 24px 26px 14px; }
        .api-config-dialog h2 { margin: 5px 0 0; color: #142033; font-size: 22px; letter-spacing: -.025em; }
        .api-config-eyebrow { color: #1265f4; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
        .api-config-close { display: grid; width: 32px; height: 32px; place-items: center; border: 0; border-radius: 8px; background: #f2f5f9; color: #657186; font-size: 22px; cursor: pointer; }
        .api-config-intro { margin: 0; padding: 0 26px 18px; color: #657186; font-size: 12px; line-height: 1.7; }
        .api-provider-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 0 26px; }
        .api-provider-grid button { display: grid; min-width: 0; gap: 5px; padding: 12px; border: 1px solid #dde4ee; border-radius: 10px; background: #fff; color: #2d3a4e; text-align: left; cursor: pointer; }
        .api-provider-grid button strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .api-provider-grid button span { width: max-content; padding: 2px 6px; border-radius: 99px; background: #eef2f7; color: #7b8798; font-size: 9px; font-weight: 700; }
        .api-provider-grid button.is-selected { border-color: #1265f4; background: #f3f7ff; box-shadow: 0 0 0 2px rgba(18, 101, 244, .09); }
        .api-provider-grid button.is-selected span { background: #dce9ff; color: #1265f4; }
        .api-provider-note { min-height: 34px; margin: 9px 26px 13px; color: #7a8596; font-size: 11px; line-height: 1.55; }
        .api-config-field { display: grid; gap: 6px; margin: 0 26px 13px; color: #46546a; font-size: 11px; font-weight: 700; }
        .api-config-field input { width: 100%; box-sizing: border-box; height: 40px; padding: 0 12px; border: 1px solid #d8e0eb; border-radius: 8px; background: #fbfcfe; color: #1d2a3d; font: 12px ${theme.typography.fontMono}; outline: none; }
        .api-config-field input:focus { border-color: #1265f4; box-shadow: 0 0 0 3px rgba(18, 101, 244, .1); background: #fff; }
        .api-config-security { display: grid; grid-template-columns: 28px 1fr; gap: 9px; margin: 18px 26px 0; padding: 12px; border: 1px solid #dce9e4; border-radius: 10px; background: #f3faf7; color: #477063; }
        .api-config-security > span { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 50%; background: #dff2ea; color: #16845e; font-size: 17px; }
        .api-config-security p { margin: 0; font-size: 10px; line-height: 1.55; }
        .api-config-security strong { display: block; margin-bottom: 2px; color: #285a49; font-size: 11px; }
        .api-config-message { margin: 12px 26px 0; padding: 9px 11px; border-radius: 8px; font-size: 11px; }
        .api-config-message.is-success { background: #eaf8f2; color: #147854; }
        .api-config-message.is-error { background: #fff0ef; color: #b33e37; }
        .api-config-dialog > footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 20px; padding: 16px 26px 22px; border-top: 1px solid #edf0f4; }
        .api-config-dialog footer button { min-height: 36px; padding: 0 13px; border: 1px solid #d5deea; border-radius: 8px; background: #fff; color: #4e5d72; font-size: 11px; font-weight: 700; cursor: pointer; }
        .api-config-dialog footer button:disabled { cursor: not-allowed; opacity: .45; }
        .api-config-dialog footer .is-primary { border-color: #1265f4; background: #1265f4; color: #fff; }
        .api-config-remove { border-color: transparent !important; color: #a34a43 !important; }
        .api-config-actions { display: flex; gap: 8px; }
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
        @media (max-width: 540px) { .ocr-progress-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .recognition-tabs { flex-direction: column; } }
        @media (max-width: 680px) { .review-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
        @media (max-width: 430px) { .review-grid { grid-template-columns: 1fr; } }
      `}</style>

      {/* ═══════ Section 3: Queue Switcher ═══════ */}
      {!preflightMode && <>
      <div className="review-queue-heading">
        <div>
          <h2>人工审核</h2>
          <p>分析结果、低置信度项目和处理失败项会分别列在这里；人工确认后才会正式入库。</p>
        </div>
        <span>全库累计 {reviewReadyCount + failedCount + sourceMissingCount} 张待处理</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {panels.filter(p => ['needs_review', 'low_confidence', 'failed', 'source_missing'].includes(p.key)).sort((a, b) => {
          const order = ['needs_review', 'low_confidence', 'failed', 'source_missing'];
          return order.indexOf(a.key) - order.indexOf(b.key);
        }).map(p => {
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
      </>}

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
                {activePanel === 'pending_ocr' && (
                  <button
                    onClick={startPendingOcr}
                    disabled={ocrStartWorking || ocrIsActive || analysisIsActive || queueCount === 0}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8, border: 'none',
                      background: ocrStartWorking || ocrIsActive || analysisIsActive || queueCount === 0 ? theme.colors.accentBg : theme.colors.accent,
                      color: ocrStartWorking || ocrIsActive || analysisIsActive || queueCount === 0 ? theme.colors.accent : '#fff',
                      cursor: ocrStartWorking || ocrIsActive || analysisIsActive || queueCount === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 800,
                    }}
                  >
                    {ocrStartWorking ? '正在启动…' : ocrIsActive ? `OCR ${ocrJob?.progress ?? 0}%` : analysisIsActive ? '图片分析进行中' : `开始图片分析（${queueCount}）`}
                  </button>
                )}
                {activePanel === 'needs_review' && (
                  <button
                    onClick={handleApproveCurrentPage}
                    disabled={approvingAll || approvingCurrentPage || cases.length === 0}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8, border: 'none',
                      background: approvingAll || approvingCurrentPage || cases.length === 0 ? theme.colors.greenBg : theme.colors.green,
                      color: approvingAll || approvingCurrentPage || cases.length === 0 ? theme.colors.green : '#fff',
                      cursor: approvingAll || approvingCurrentPage || cases.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 800,
                    }}
                  >
                    {approvingCurrentPage ? '入库中…' : `一键入库当前页（${cases.length}）`}
                  </button>
                )}
                {(activePanel === 'needs_review' || activePanel === 'low_confidence') && (
                  <button
                    onClick={handleApproveAll}
                    disabled={approvingAll || approvingCurrentPage || queueCount === 0}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8,
                      border: `1px solid ${theme.colors.greenBorder}`, background: theme.colors.bgCard, color: theme.colors.green,
                      cursor: approvingAll || approvingCurrentPage || queueCount === 0 ? 'not-allowed' : 'pointer',
                      opacity: approvingAll || approvingCurrentPage || queueCount === 0 ? .55 : 1,
                      fontSize: 13, fontWeight: 800,
                    }}
                  >
                    {approvingAll ? '入库中…' : `一键入库（${queueCount}）`}
                  </button>
                )}
                {activePanel === 'failed' && (
                  <button
                    onClick={reanalyzeAllFailed}
                    disabled={analysisStartWorking || analysisIsActive || ocrIsActive || retryableFailedCount === 0}
                    style={{
                      height: 34, padding: '0 14px', borderRadius: 8,
                      border: 'none', background: analysisStartWorking || analysisIsActive || ocrIsActive || retryableFailedCount === 0 ? theme.colors.accentBg : theme.colors.accent,
                      color: analysisStartWorking || analysisIsActive || ocrIsActive || retryableFailedCount === 0 ? theme.colors.accent : '#fff',
                      cursor: analysisStartWorking || analysisIsActive || ocrIsActive || retryableFailedCount === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 800,
                    }}
                  >
                    {analysisStartWorking ? '正在启动…' : analysisIsActive ? '分析进行中…' : ocrIsActive ? 'OCR 进行中…' : `重新分析失败项（${retryableFailedCount}）`}
                  </button>
                )}
                {activePanel !== 'pending_quality' && <button
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
                  {managementMode ? '退出管理' : (activePanel === 'failed' || activePanel === 'source_missing') ? '管理与人工分类' : activePanel === 'pending_quality' ? '批量筛除' : '管理'}
                </button>}
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
              {activePanel === 'failed'
                ? '可选择重新分析、删除，或在图片右上角编辑分类与来源'
                : activePanel === 'source_missing'
                  ? '可选择删除，或在图片右上角补充来源并确认分类'
                  : `已选 ${selectedCount} 项`}
              <span style={{ color: theme.colors.text.tertiary, fontWeight: 400 }}> · 当前显示 {cases.length} 项</span>
            </strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={allLoadedSelected ? () => setSelectedCaseIds(new Set()) : selectAllLoaded} disabled={cases.length === 0}
                style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard, color: theme.colors.text.secondary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                {allLoadedSelected ? '取消全选' : '全选已加载'}
              </button>
              {activePanel === 'needs_review' && (
                <button onClick={handleSelectedApprove} disabled={!selectedCount || selectionWorking}
                  style={{ height: 32, padding: '0 13px', borderRadius: 8, border: `1px solid ${theme.colors.greenBorder}`, background: !selectedCount ? theme.colors.greenBg : theme.colors.green, color: !selectedCount ? theme.colors.green : '#fff', cursor: !selectedCount ? 'not-allowed' : 'pointer', opacity: !selectedCount ? .55 : 1, fontSize: 12, fontWeight: 800 }}>
                  {selectionWorking ? '处理中…' : '入库所选'}
                </button>
              )}
              {activePanel === 'pending_quality' && (
                <button onClick={handleQueueSelectedForOcr} disabled={!selectedCount || selectionWorking}
                  style={{ height: 32, padding: '0 13px', borderRadius: 8, border: 'none', background: !selectedCount ? theme.colors.accentBg : theme.colors.accent, color: !selectedCount ? theme.colors.accent : '#fff', cursor: !selectedCount ? 'not-allowed' : 'pointer', opacity: !selectedCount ? .55 : 1, fontSize: 12, fontWeight: 800 }}>
                  {selectionWorking ? '加入中…' : `加入图片分析队列（${selectedCount}）`}
                </button>
              )}
              {activePanel === 'failed' && (
                <button onClick={handleSelectedReanalyze} disabled={!selectedCount || selectionWorking || analysisIsActive || ocrIsActive}
                  style={{ height: 32, padding: '0 13px', borderRadius: 8, border: `1px solid ${theme.colors.accentBorder}`, background: !selectedCount ? theme.colors.accentBg : theme.colors.accent, color: !selectedCount ? theme.colors.accent : '#fff', cursor: !selectedCount ? 'not-allowed' : 'pointer', opacity: !selectedCount ? .55 : 1, fontSize: 12, fontWeight: 800 }}>
                  {selectionWorking ? '处理中…' : '重新分析所选'}
                </button>
              )}
              <button onClick={handleSelectedDelete} disabled={!selectedCount || selectionWorking}
                style={{ height: 32, padding: '0 13px', borderRadius: 8, border: `1px solid ${theme.colors.redBorder}`, background: !selectedCount ? theme.colors.redBg : theme.colors.red, color: !selectedCount ? theme.colors.red : '#fff', cursor: !selectedCount ? 'not-allowed' : 'pointer', opacity: !selectedCount ? .55 : 1, fontSize: 12, fontWeight: 800 }}>
                {selectionWorking ? '处理中…' : '删除所选'}
              </button>
            </div>
          </div>
        )}

        {activePanel && batchResult && (
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
            const actions = c.reviewStatus === 'source_missing' ? [] : queueActions;
            const selected = selectedCaseIds.has(c.id);
            const isManualEditing = editingCaseId === c.id && manualDraft;
            const isCaseWorking = caseActionWorkingId === c.id;

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
                      <img src={imageCandidates(c)[0]} alt={c.caseTitle || c.pageTitle || c.title || ''} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
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
                    {managementMode && (activePanel === 'failed' || activePanel === 'source_missing') && (
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
                        disabled={Boolean(caseActionWorkingId) || ((analysisIsActive || ocrIsActive) && act.action === 'reanalyze')}
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
                          cursor: isCaseWorking ? 'wait' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isCaseWorking ? '处理中…' : act.label}
                      </button>
                    ))}
                    {c.reviewStatus === 'source_missing' && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); beginManualEdit(c); }}
                        style={{ padding: '5px 12px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.orangeBorder}`, background: theme.colors.orangeBg, color: theme.colors.orange, fontSize: theme.typography.size.xs, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        补充来源
                      </button>
                    )}
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
        {!casesLoading && activePanel && cases.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '22px 0 8px', color: theme.colors.text.tertiary, fontSize: 12 }}>
            <span>已显示 {cases.length} / {casePagination.total} 张</span>
            {casePagination.page < casePagination.totalPages && (
              <button
                onClick={loadMorePanelCases}
                disabled={casesLoadingMore}
                style={{ minHeight: 34, padding: '0 14px', border: `1px solid ${theme.colors.border}`, borderRadius: 8, background: theme.colors.bgCard, color: theme.colors.text.secondary, cursor: casesLoadingMore ? 'wait' : 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                {casesLoadingMore ? '加载中…' : `加载更多（还剩 ${Math.max(0, casePagination.total - cases.length)} 张）`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
