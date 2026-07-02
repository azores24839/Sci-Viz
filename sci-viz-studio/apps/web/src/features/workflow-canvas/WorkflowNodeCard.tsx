import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ProjectGoal } from '@studio/contracts';
import type { StudioFlowNode } from './adapter';
import { getNodePreviewTone, summarizeNodeContent } from './nodePreview';
import { parseMdToCards, type MdCard } from './parseMarkdownToCards';

const statusLabel = {
  LOCKED: '等待上一步',
  READY: '待处理',
  QUEUED: '排队中',
  RUNNING: '处理中',
  AWAITING_HUMAN: '待人工确认',
  COMPLETED: '已完成',
  FAILED: '处理失败',
} as const;

const glyph: Record<string, string> = {
  INPUT: '↥',
  AGENT: '⌁',
  HUMAN_GATE: '✓',
  EXECUTION: '◎',
  OUTPUT: '▤',
};

const avatarByOwner: Record<string, string> = {
  资料管理员: '/agents/research-analyst.png',
  资料分析师: '/agents/research-analyst.png',
  项目负责人: '/agents/science-reviewer.png',
  科研策展人: '/agents/science-reviewer.png',
  摄影策划师: '/agents/photography-director.png',
};

const avatarByNode: Record<string, string> = {
  'photo-plan': '/agents/visual-planner.png',
  'ai-reference': '/agents/visual-planner.png',
};

const nodeEvidence: Record<string, Array<{ src: string; label: string; note: string }>> = {
  'curation-strategy': [
    { src: '/case-refs/changxing-01.jpg', label: '现状', note: '记录型' },
    { src: '/case-refs/changxing-04.jpg', label: '方向', note: '工程能力可见' },
  ],
};

const insightCharts: Record<string, {
  title: string;
  source: string;
  rows: Array<{ label: string; value: number; note: string }>;
}> = {
  'case-benchmark': {
    title: '我方结构 vs 对标组',
    source: '引用 Sci-Viz Case Hub：高校/企业/机构 approved 样本',
    rows: [
      { label: '我方记录', value: 72, note: '设备/空间记录偏高' },
      { label: '对标过程', value: 41, note: '操作与团队协作更完整' },
      { label: '对标展示', value: 34, note: '应用语境更清楚' },
    ],
  },
};

const diagnosisChartGroups = [
  {
    title: '功能维度占比',
    source: 'Sci-Viz Case Hub mock：静图案例功能分类',
    rows: [
      { label: '记录', value: 72, note: '设备/空间留档为主' },
      { label: '解释', value: 12, note: '过程说明不足' },
      { label: '展示', value: 9, note: '成果/应用较少' },
      { label: '传播', value: 5, note: '面向公众较弱' },
      { label: '数据', value: 2, note: '屏幕/图表少量出现' },
    ],
  },
  {
    title: '技术维度占比',
    source: 'Sci-Viz Case Hub 技术维度：整体结构样本',
    rows: [
      { label: '拍摄', value: 50, note: '2799 条，真实采集主导' },
      { label: '绘设', value: 19.6, note: '图标/信息设计' },
      { label: '渲染', value: 16.1, note: '3D/工程可视化' },
      { label: '成像', value: 9.7, note: '显微/医学/遥感等' },
      { label: '数据', value: 3.9, note: '图表/地图/网络' },
      { label: '生成', value: 0.7, note: 'AI 或风格迁移' },
    ],
  },
  {
    title: '内容对象占比',
    source: 'Sci-Viz Case Hub mock：高校/实验室照片内容',
    rows: [
      { label: '实验设备', value: 31.5, note: '头部样本更重设备' },
      { label: '实验过程', value: 24.1, note: '过程画面决定解释力' },
      { label: '群体团队', value: 21.8, note: '交大现状样本较高' },
      { label: '单人肖像', value: 18.8, note: '人物识别与可信度' },
      { label: '团队场景', value: 13.9, note: '协作关系线索' },
    ],
  },
  {
    title: '可用性与风险',
    source: '基于上传资料 + Case Hub mock 规则',
    rows: [
      { label: '可公开', value: 64, note: '可直接进入诊断' },
      { label: '需脱敏', value: 21, note: '屏幕/铭牌/合作单位' },
      { label: '低可用', value: 15, note: '模糊、光线差、主体弱' },
    ],
  },
];

const benchmarkCases = [
  { src: '/case-refs/changxing-01.jpg', title: '高校平台实验室', meta: '设备尺度 / 空间秩序', fit: '补足“设备能力可见”' },
  { src: '/case-refs/changxing-02.jpg', title: '团队协作场景', meta: '人物关系 / 过程线索', fit: '补足“谁在做、如何做”' },
  { src: '/case-refs/changxing-03.jpg', title: '工程装备细节', meta: '局部结构 / 技术可信度', fit: '补足“专业细节证据”' },
  { src: '/case-refs/changxing-04.jpg', title: '产业工程参照', meta: '应用语境 / 可靠性', fit: '补足“对外合作语境”' },
];

const diagnosisObjects = [
  { src: '/case-refs/changxing-05.jpg', title: '实验设备', meta: '31.5% · 设备/平台记录', finding: '最能支撑“硬件能力”，但需要补拍人物尺度与运行状态。' },
  { src: '/case-refs/changxing-04.jpg', title: '实验过程', meta: '24.1% · 会议/协作过程', finding: '能证明组织与协同，但还缺少真实操作和实验动作。' },
  { src: '/case-refs/changxing-06.jpg', title: '人物肖像', meta: '18.8% · 单人/专家形象', finding: '有可信度入口，但偏正式肖像，科研现场关系不足。' },
  { src: '/case-refs/changxing-02.jpg', title: '人物资料', meta: '14.9% · 人员识别素材', finding: '可用于团队识别，但传播画面价值低，需要转化为场景化拍摄。' },
];

interface SourceItem {
  id: string;
  name: string;
  meta: string;
  checked: boolean;
}

const defaultSourceItems: SourceItem[] = [
  { id: 'hub-technical-distribution', name: 'Sci-Viz Case Hub · 技术维度整体分布', meta: 'Mock 资料库 · 已选', checked: true },
  { id: 'hub-lab-photo-structure', name: 'Sci-Viz Case Hub · 高校实验室内容对象样本', meta: 'Mock 资料库 · 已选', checked: true },
  { id: 'hub-benchmark-thumbnails', name: 'Sci-Viz Case Hub · 对标案例缩略图', meta: 'Mock 资料库 · 已选', checked: true },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function NodeEvidenceStrip({ items }: { items: Array<{ src: string; label: string; note: string }> }) {
  return <div className="node-evidence-strip" aria-label="视觉证据">
    {items.map((item) => <figure key={`${item.src}-${item.label}`}>
      <img src={item.src} alt="" />
      <figcaption>
        <strong>{item.label}</strong>
        <span>{item.note}</span>
      </figcaption>
    </figure>)}
  </div>;
}

function NodeInsightChart({ chart }: { chart: NonNullable<(typeof insightCharts)[string]> }) {
  return <div className="node-insight-chart" aria-label={chart.title}>
    <div className="node-insight-header">
      <strong>{chart.title}</strong>
      <span>{chart.source}</span>
    </div>
    <div className="node-chart-rows">
      {chart.rows.map((row) => <div className="node-chart-row" key={row.label}>
        <div className="node-chart-label">
          <span>{row.label}</span>
          <em>{row.value}%</em>
        </div>
        <div className="node-chart-track"><span style={{ width: `${row.value}%` }} /></div>
        <small>{row.note}</small>
      </div>)}
    </div>
  </div>;
}

function DiagnosisDashboard() {
  return <div className="diagnosis-dashboard" aria-label="视觉现状数据看板">
    <div className="diagnosis-metric-row">
      <div><strong>126</strong><span>Case Hub mock 样本</span></div>
      <div><strong>82%</strong><span>静图可分析</span></div>
      <div><strong>21%</strong><span>需脱敏/确认</span></div>
    </div>
    <div className="diagnosis-chart-grid">
      {diagnosisChartGroups.map((chart) => <NodeInsightChart chart={chart} key={chart.title} />)}
    </div>
  </div>;
}

function DiagnosisObjectGallery() {
  return <section className="diagnosis-object-gallery" aria-label="分析对象缩略图">
    <div className="diagnosis-object-header">
      <strong>分析对象代表样本</strong>
      <span>按内容对象占比与诊断价值选取</span>
    </div>
    <div className="diagnosis-object-grid">
      {diagnosisObjects.map((item) => <article className="diagnosis-object-card" key={item.title}>
        <img src={item.src} alt="" />
        <div>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
          <p>{item.finding}</p>
        </div>
      </article>)}
    </div>
  </section>;
}

function CaseBenchmarkGallery() {
  return <section className="benchmark-gallery" aria-label="对标案例缩略图">
    <div className="benchmark-gallery-header">
      <strong>对标案例候选</strong>
      <span>先展示缩略图；后续可扩展为点击生成案例节点</span>
    </div>
    <div className="benchmark-case-grid">
      {benchmarkCases.map((item) => <article className="benchmark-case-card" key={item.title}>
        <img src={item.src} alt="" />
        <div>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
          <p>{item.fit}</p>
        </div>
      </article>)}
    </div>
  </section>;
}

function splitDiagnosisCards(cards: MdCard[]) {
  const contentCards = cards.filter((card) => card.content);
  const structure = contentCards.filter((card) => (
    ['素材总览', '功能维度结构', '技术维度结构', '内容对象结构', '媒介维度结构'].includes(card.label)
  ));
  const quality = contentCards.filter((card) => (
    ['画面质量诊断', '风险标记', '待确认事实与现场条件'].includes(card.label)
  ));
  const used = new Set([...structure, ...quality]);
  const remaining = contentCards.filter((card) => !used.has(card));

  return {
    structure: structure.length > 0 ? structure : contentCards.slice(0, 4),
    quality: quality.length > 0 ? quality : remaining.slice(0, 2),
  };
}

function DiagnosisSection({ title, cards }: { title: string; cards: MdCard[] }) {
  if (cards.length === 0) return null;

  return <section className="node-analysis-section" aria-label={title}>
    <h3>{title}</h3>
    <div className="node-analysis-cards">
      {cards.map((card, index) => <article className="md-card" key={`${title}-${card.label}-${index}`}>
        {card.label ? <div className="md-card-titlebar">
          <span className="md-card-label">{card.label}</span>
          <button type="button" className="md-card-edit" aria-label={`编辑${card.label}`} title="编辑" />
        </div> : null}
        <div className="md-card-main">
          <p className="md-card-content">{card.content}</p>
        </div>
      </article>)}
    </div>
  </section>;
}

function VisualDiagnosisArtifact({ md }: { md: string }) {
  const groups = splitDiagnosisCards(parseMdToCards(md));

  return <div className="node-analysis-body">
    <DiagnosisDashboard />
    <DiagnosisObjectGallery />
    <DiagnosisSection title="结构诊断" cards={groups.structure} />
    <DiagnosisSection title="质量与风险" cards={groups.quality} />
  </div>;
}

function GoalOutputSelectionPanel({
  primaryPurposeId,
  secondaryPurposeId,
  purposeOptions,
  onSetPrimaryPurpose,
  onSetSecondaryPurpose,
}: {
  primaryPurposeId: ProjectGoal;
  secondaryPurposeId: ProjectGoal | '';
  purposeOptions: Array<{ id: ProjectGoal; label: string; description: string }>;
  onSetPrimaryPurpose: (purposeId: ProjectGoal) => void;
  onSetSecondaryPurpose: (purposeId: ProjectGoal | '') => void;
}) {
  const [rankOrder, setRankOrder] = useState<ProjectGoal[]>(() => {
    const order: ProjectGoal[] = [];
    if (primaryPurposeId) order.push(primaryPurposeId);
    if (secondaryPurposeId && secondaryPurposeId !== primaryPurposeId) order.push(secondaryPurposeId);
    return order;
  });

  const syncToParent = (order: ProjectGoal[]) => {
    onSetPrimaryPurpose(order[0] ?? purposeOptions[0]!.id);
    onSetSecondaryPurpose(order[1] ?? '');
  };

  const handleClick = (purposeId: ProjectGoal) => {
    setRankOrder((prev) => {
      const idx = prev.indexOf(purposeId);
      if (idx >= 0) {
        if (prev.length <= 1) return prev;
        const next = prev.filter((id) => id !== purposeId);
        syncToParent(next);
        return next;
      }
      const next = [...prev, purposeId];
      syncToParent(next);
      return next;
    });
  };

  const getRank = (purposeId: ProjectGoal): number | null => {
    const idx = rankOrder.indexOf(purposeId);
    return idx >= 0 ? idx + 1 : null;
  };

  return <div className="node-analysis-body">
    <section className="node-analysis-section" aria-label="传播目标">
      <h3>传播目标</h3>
      <p className="node-section-hint">点击卡片按优先级排序，自动标记 1–4（1 为主目标）。再次点击取消选择。至少保留一项。</p>
      <div className="goal-rank-grid nowheel nodrag">
        {purposeOptions.map((option) => {
          const rank = getRank(option.id);
          const isPrimary = rank === 1;
          return <article
            className={`goal-rank-card${rank ? ' is-selected' : ''}${isPrimary ? ' is-primary' : ''}`}
            key={option.id}
            onClick={(event) => {
              event.stopPropagation();
              handleClick(option.id);
            }}
            role="button"
            tabIndex={0}
            aria-pressed={!!rank}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleClick(option.id);
              }
            }}
          >
            {rank && <span className={`goal-rank-badge${isPrimary ? ' is-primary' : ''}`} aria-label={`优先级 ${rank}`}>{rank}</span>}
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </article>;
        })}
      </div>
    </section>
    <section className="node-analysis-section" aria-label="产物类型">
      <h3>产物类型</h3>
      <div className="goal-rank-grid">
        <article className="goal-rank-card is-selected is-primary">
          <span className="goal-rank-badge is-primary" aria-label="已选择">1</span>
          <strong>拍摄静图</strong>
          <span>当前 MVP 主流程，支持科研平台、实验室、团队和装备的静图拍摄策划。</span>
        </article>
        <article className="goal-rank-card is-disabled">
          <strong>录影/影片</strong>
          <span>暂未开放。后续版本将支持动态媒体策划。</span>
        </article>
      </div>
    </section>
  </div>;
}

export function WorkflowNodeCard({ data, selected }: NodeProps<StudioFlowNode>) {
  const { definition, state } = data;
  const compact = definition.kind === 'INPUT' || definition.kind === 'OUTPUT';
  const waiting = state.status === 'LOCKED';
  const hasArtifact = Boolean(state.artifactBody);
  const previewTone = getNodePreviewTone(state.status);
  const preview = state.status === 'RUNNING'
    ? `${definition.owner}正在生成${definition.outputLabel}，完成后会停在确认点。`
    : summarizeNodeContent(state.artifactBody, state.summary || definition.description);
  const evidence = nodeEvidence[definition.id] ?? [];
  const chart = insightCharts[definition.id];
  const isTerminal = definition.kind === 'OUTPUT';
  const isSourceIntake = definition.id === 'source-intake';
  const isVisualDiagnosis = definition.id === 'visual-diagnosis';
  const isGoalOutputSelection = definition.id === 'goal-output-selection';
  const showAgentActions = definition.kind === 'AGENT' && state.status === 'AWAITING_HUMAN' && hasArtifact;
  const showHumanGateActions = definition.kind === 'HUMAN_GATE' && state.status === 'AWAITING_HUMAN';
  const avatar = isSourceIntake ? undefined : avatarByNode[definition.id] ?? avatarByOwner[definition.owner];

  return (
    <article
      className={`workflow-node${selected ? ' is-selected' : ''}${state.status === 'LOCKED' ? ' is-locked' : ''}${state.status === 'RUNNING' ? ' is-running' : ''}${compact ? ' compact' : ''}`}
      aria-label={`${definition.label}，${statusLabel[state.status]}`}
      onPointerDownCapture={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const nearResizeHandle = rect.right - event.clientX < 20 && rect.bottom - event.clientY < 20;
        if (nearResizeHandle) event.stopPropagation();
      }}
    >
      {definition.order > 1 && <Handle className="node-handle" type="target" position={Position.Left} isConnectable={false} />}
      <div className="node-drag-handle" aria-label="拖动卡片" title="拖动卡片">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </div>
      <div className="node-card-top">
        <div className="node-heading">
          <span className="node-number">{String(definition.order).padStart(2, '0')}</span>
          <div>
            <h2 className="node-title">{definition.label}</h2>
            {!isSourceIntake && <div className="node-owner">{definition.owner}</div>}
          </div>
        </div>
        {!isSourceIntake && avatar
          ? <span className="node-agent-avatar-frame" aria-hidden="true"><img className="node-agent-avatar" src={avatar} alt="" /></span>
          : !isSourceIntake ? <div className="node-visual" aria-hidden="true"><span className="node-glyph">{glyph[definition.kind]}</span></div> : null}
      </div>
      {chart ? <NodeInsightChart chart={chart} /> : evidence.length > 0 ? <NodeEvidenceStrip items={evidence} /> : null}
      {definition.id === 'case-benchmark' ? <CaseBenchmarkGallery /> : null}
      {isSourceIntake ? <section className="source-node-summary"><strong>{state.summary}</strong><span>在右侧资料台账中上传、解析并选择本轮资料。</span></section> : null}
      {waiting
        ? <div className="node-waiting">
            <span className="status-dot locked" />
            <p>{state.summary || '等待上一步确认'}</p>
          </div>
        : <>
          {isGoalOutputSelection && data.purposeOptions && data.purposeOptions.length > 0 && data.onSetPrimaryPurpose ? (
            <GoalOutputSelectionPanel
              primaryPurposeId={data.primaryPurposeId ?? data.purposeOptions[0]!.id}
              secondaryPurposeId={data.secondaryPurposeId ?? ''}
              purposeOptions={data.purposeOptions}
              onSetPrimaryPurpose={data.onSetPrimaryPurpose}
              onSetSecondaryPurpose={data.onSetSecondaryPurpose ?? (() => {})}
            />
          ) : isVisualDiagnosis && state.artifactBody ? (
            <VisualDiagnosisArtifact md={state.artifactBody} />
          ) : !isSourceIntake && state.artifactBody ? (
            <div className="node-analysis-body">
              <DiagnosisSection title={state.artifactLabel ?? definition.outputLabel} cards={parseMdToCards(state.artifactBody).filter((card) => card.content)} />
            </div>
          ) : !isSourceIntake && (
            <div className={`node-preview ${previewTone}`}>
              <div className="node-preview-kicker">
                <span>{state.artifactLabel ?? definition.outputLabel}</span>
                <span className="node-preview-mark" aria-hidden="true" />
              </div>
              <div className="node-preview-body nowheel nodrag" onWheel={(event) => event.stopPropagation()}>
                <p>{preview}</p>
              </div>
            </div>
          )}
          {showAgentActions && hasArtifact && <div className="node-action-stack nowheel nodrag" aria-label={`${definition.label}操作`}>
            <button
              type="button"
              className="node-primary-action"
              onClick={(event) => {
                event.stopPropagation();
                data.onConfirm?.();
              }}
            >
              确定，进入下一步
            </button>
            <button
              type="button"
              className="node-secondary-action"
              onClick={(event) => {
                event.stopPropagation();
                data.onRevise?.();
              }}
            >
              重新分析
            </button>
          </div>}
        </>}
      {waiting && <div className="node-section node-status waiting-status">
        <span>{statusLabel[state.status]}</span>
      </div>}
      {!isTerminal && <Handle className="node-handle" type="source" position={Position.Right} isConnectable={false} />}
    </article>
  );
}
