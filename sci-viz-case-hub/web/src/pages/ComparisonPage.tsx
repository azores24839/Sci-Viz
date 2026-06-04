import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { theme } from '../theme';
import type { ComparisonData, ComparisonGroup, ComparisonSample, EnterpriseCommercialSignals } from '../types';

const BLUE = '#2563eb';
const GREEN = '#5aa35b';
const PURPLE = '#7c5ccf';
const ORANGE = '#f28c28';

const GROUP_COLORS: Record<string, string> = {
  sjtu: BLUE,
  domestic: GREEN,
  international: PURPLE,
  enterprise: ORANGE,
};

const GROUP_TINTS: Record<string, { bg: string; border: string; text: string }> = {
  sjtu: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  domestic: { bg: '#edf7ef', border: '#cbe7d1', text: '#247042' },
  international: { bg: '#f4f0ff', border: '#ded2ff', text: '#6d45c4' },
  enterprise: { bg: '#fff7ed', border: '#fed7aa', text: '#c96612' },
};

const GROUP_LABELS: Record<string, string> = {
  sjtu: '交大现状',
  domestic: '国内顶尖高校',
  international: '国际研究',
  enterprise: '企业参考',
};

const COMPARISON_DIMENSIONS: { key: string; label: string }[] = [
  { key: 'functionalPurpose', label: '表达功能' },
  { key: 'mediaType', label: '呈现方式' },
  { key: 'contentType', label: '内容类型' },
  { key: 'visualStyle', label: '视觉风格' },
  { key: 'distributionMedium', label: '传播媒介' },
];

const SJTU_SCHOOLS = [
  { id: 'all', label: '全部院系', discipline: '' },
  { id: 'oce', label: '船舶海洋与建筑工程学院', discipline: '工程' },
  { id: 'me', label: '机械与动力工程学院', discipline: '工程' },
  { id: 'seiee', label: '电子信息与电气工程学院', discipline: '信息科学' },
  { id: 'cs', label: '计算机学院', discipline: '信息科学' },
  { id: 'smse', label: '材料科学与工程学院', discipline: '材料' },
  { id: 'sese', label: '环境科学与工程学院', discipline: '环境科学' },
  { id: 'bme', label: '生物医学工程学院', discipline: '医学' },
  { id: 'aero', label: '航空航天学院', discipline: '工程' },
];

type ExpressionKey = 'record' | 'explain' | 'prove' | 'communicate' | 'translate';

const EXPRESSION_LABELS: Record<ExpressionKey, string> = {
  record: '记录',
  explain: '解释',
  prove: '证明',
  communicate: '传播',
  translate: '转译',
};

const EXPRESSION_ORDER: ExpressionKey[] = ['record', 'explain', 'prove', 'communicate', 'translate'];

const cardStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  boxShadow: '0 16px 36px rgba(15, 23, 42, 0.04)',
};

const selectStyle: CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 34px 0 12px',
  borderRadius: 6,
  border: '1px solid #d8dee8',
  color: '#0f172a',
  background: '#ffffff',
  fontSize: 13,
  fontWeight: 500,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23475569' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  cursor: 'pointer',
};

function normalizeFunctionalPurpose(label: string): ExpressionKey | null {
  const t = label.trim();
  if (/转译|应用|场景|产品|方案|客户|商业|价值|行业|解决/i.test(t)) return 'translate';
  if (/解释|机制|结构|流程|原理|说明|图解|示意|模型|建模/i.test(t)) return 'explain';
  if (/证明|数据|结果|统计|对比|验证|图表|曲线|趋势|分布/i.test(t)) return 'prove';
  if (/记录|现场|样本|设备|过程|摄影|实验|观测|采集|检测/i.test(t)) return 'record';
  if (/传播|科普|成果|封面|展示|品牌|公众|宣传|推广|展览|新闻/i.test(t)) return 'communicate';
  return null;
}

function mediaTypeToExpression(mediaType: string): ExpressionKey | null {
  const t = mediaType.trim();
  if (/摄影|照片|图片|图像|显微|电镜|SEM|TEM/i.test(t)) return 'record';
  if (/3D|渲染|三维|建模|模型|信息图|插图|图解|示意/i.test(t)) return 'explain';
  if (/数据|图表|统计|曲线|柱状|折线/i.test(t)) return 'prove';
  if (/视频|动画|动图|GIF|交互|多媒体/i.test(t)) return 'communicate';
  return null;
}

function sampleText(sample: ComparisonSample) {
  return [sample.title, sample.mediaType, sample.contentType, sample.visualStyle].filter(Boolean).join(' ');
}

function findSampleForExpression(samples: ComparisonSample[], expression: ExpressionKey): ComparisonSample | null {
  const patterns: Record<ExpressionKey, RegExp> = {
    record: /摄影|照片|图片|记录|现场|样本|设备|观测|显微|电镜/i,
    explain: /3D|渲染|三维|机制|结构|流程|原理|图解|示意|模型/i,
    prove: /数据|图表|统计|曲线|对比|验证|证明|结果/i,
    communicate: /视频|动画|动图|传播|科普|新闻|封面|展示/i,
    translate: /信息图|应用|场景|产品|方案|商业|客户|价值|解决|行业/i,
  };
  const scored = samples.map(sample => {
    let score = patterns[expression].test(sampleText(sample)) ? 20 : 0;
    if (expression === 'record' && /摄影|显微/i.test(sample.mediaType || '')) score += 8;
    if (expression === 'explain' && /3D|渲染|信息图/i.test(sample.mediaType || '')) score += 8;
    if (expression === 'prove' && /数据|图表/i.test(sample.mediaType || '')) score += 8;
    if (expression === 'translate' && /信息图|方案/i.test(sample.mediaType || '')) score += 8;
    return { sample, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].sample : samples[0] || null;
}

function truncate(text: string, max = 32) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function tagStyle(groupId: string): CSSProperties {
  const tint = GROUP_TINTS[groupId] || GROUP_TINTS.sjtu;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: 26,
    padding: '0 10px',
    borderRadius: 6,
    border: `1px solid ${tint.border}`,
    background: tint.bg,
    color: tint.text,
    fontSize: 12,
    fontWeight: 650,
    whiteSpace: 'nowrap',
  };
}

interface AnalysisSidebarProps {
  selectedSchool: string;
  setSelectedSchool: (value: string) => void;
  selectedDimension: string;
  setSelectedDimension: (value: string) => void;
  loading: boolean;
}

function AnalysisSidebar({
  selectedSchool,
  setSelectedSchool,
  selectedDimension,
  setSelectedDimension,
  loading,
}: AnalysisSidebarProps) {
  const navigate = useNavigate();
  return (
    <aside className="comparison-sidebar" style={{ ...cardStyle, padding: 20 }}>
      <h1 style={{ margin: '0 0 10px', color: '#0f172a', fontSize: 23, lineHeight: 1.2, fontWeight: 760 }}>
        科研视觉表达策略分析
      </h1>
      <p style={{ margin: '0 0 24px', color: '#536174', fontSize: 14, lineHeight: 1.75 }}>
        从来源差异、表达功能与视觉形式适配关系中，识别科研视觉案例的设计策略。
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gridTemplateColumns: '68px minmax(0, 1fr)', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#111827', fontSize: 13, fontWeight: 700 }}>分析范围</span>
          <select value={selectedSchool} onChange={(event) => setSelectedSchool(event.target.value)} style={selectStyle}>
            {SJTU_SCHOOLS.map(school => (
              <option key={school.id} value={school.id}>{school.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gridTemplateColumns: '68px minmax(0, 1fr)', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#111827', fontSize: 13, fontWeight: 700 }}>对比对象</span>
          <select value="all-groups" disabled style={{ ...selectStyle, color: '#334155', backgroundColor: '#f8fafc' }}>
            <option>交大 / 国内顶尖高校 / 国际研究 / 企业参考</option>
          </select>
        </label>

        <label style={{ display: 'grid', gridTemplateColumns: '68px minmax(0, 1fr)', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#111827', fontSize: 13, fontWeight: 700 }}>分析维度</span>
          <select value={selectedDimension} onChange={(event) => setSelectedDimension(event.target.value)} style={selectStyle}>
            {COMPARISON_DIMENSIONS.map(dimension => (
              <option key={dimension.key} value={dimension.key}>{dimension.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <p style={{ margin: '14px 0 0 78px', color: '#64748b', fontSize: 12 }}>正在刷新数据...</p>
      )}

      <section style={{
        marginTop: 22,
        padding: 18,
        borderRadius: 8,
        border: '1px solid #dbeafe',
        background: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            border: '1px solid #bfdbfe',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: BLUE,
            fontWeight: 800,
          }}>
            i
          </span>
          <strong style={{ color: '#0b5bd3', fontSize: 15 }}>核心发现</strong>
        </div>
        <p style={{ margin: '0 0 16px', color: '#0b5bd3', fontSize: 14, lineHeight: 1.75, fontWeight: 650 }}>
          交大案例更偏向记录型视觉，国际研究更偏向解释型与证明型视觉，企业案例更偏向转译型视觉。
        </p>
        <div style={{ display: 'grid', gap: 0 }}>
          {[
            '记录型视觉强调现场、样本与实验真实性',
            '解释型视觉强调机制、结构与过程可理解性',
            '转译型视觉强调应用场景、客户价值与成果落地',
          ].map(item => (
            <div key={item} style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: '11px 0',
              borderTop: '1px dashed #c7ddff',
              color: '#334155',
              fontSize: 12,
              lineHeight: 1.4,
            }}>
              <span style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                border: `1px solid ${BLUE}`,
                color: BLUE,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 800,
                flex: '0 0 auto',
              }}>✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => navigate('/report')}
        style={{
          width: '100%',
          height: 44,
          marginTop: 34,
          borderRadius: 7,
          border: `1px solid ${BLUE}`,
          background: '#ffffff',
          color: BLUE,
          fontSize: 14,
          fontWeight: 720,
          cursor: 'pointer',
          boxShadow: '0 8px 18px rgba(37, 99, 235, 0.08)',
        }}
      >
        生成分析报告
      </button>
    </aside>
  );
}

function ExpressionBarChart({ groups, dimension }: { groups: ComparisonGroup[]; dimension: string }) {
  const displayGroups = useMemo(() => {
    const order = ['sjtu', 'domestic', 'international', 'enterprise'];
    return order
      .map(id => groups.find(group => group.id === id))
      .filter(Boolean) as ComparisonGroup[];
  }, [groups]);

  const rows = useMemo(() => {
    const entries: Record<ExpressionKey, Record<string, number>> = {
      record: {},
      explain: {},
      prove: {},
      communicate: {},
      translate: {},
    };

    for (const group of displayGroups) {
      for (const item of group.distribution) {
        const expr = dimension === 'functionalPurpose'
          ? normalizeFunctionalPurpose(item.label)
          : mediaTypeToExpression(item.label);
        if (expr) entries[expr][group.id] = (entries[expr][group.id] || 0) + item.count;
      }
    }

    return EXPRESSION_ORDER.map(expr => {
      const values = displayGroups.map(group => {
        const count = entries[expr][group.id] || 0;
        const pct = group.total > 0 ? Math.round((count / group.total) * 100) : 0;
        return { groupId: group.id, count, pct };
      });
      return { expr, label: EXPRESSION_LABELS[expr], values };
    });
  }, [dimension, displayGroups]);

  const highlightLabel = (values: { groupId: string; pct: number }[]) => {
    const sorted = [...values].sort((a, b) => b.pct - a.pct);
    if (!sorted[0] || !sorted[1]) return null;
    if (sorted[0].pct < 8 || sorted[0].pct - sorted[1].pct < 8) return null;
    return sorted[0];
  };

  return (
    <section className="comparison-chart-card" style={{ ...cardStyle, padding: '20px 22px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <header className="comparison-chart-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: 20, lineHeight: 1.25, fontWeight: 760 }}>
            不同来源的视觉表达功能对比
            <span title="条形长度表示该功能在对应来源组中的占比" style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 17,
              height: 17,
              marginLeft: 8,
              borderRadius: 9,
              border: '1px solid #cbd5e1',
              color: '#64748b',
              fontSize: 12,
              verticalAlign: '2px',
            }}>i</span>
          </h2>
        </div>
        <div className="comparison-legend" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          {displayGroups.map(group => (
            <span key={group.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#475569', fontSize: 12, fontWeight: 560 }}>
              <i style={{ width: 12, height: 12, borderRadius: 2, background: GROUP_COLORS[group.id], display: 'inline-block' }} />
              {GROUP_LABELS[group.id] || group.label}
            </span>
          ))}
        </div>
      </header>

      <div style={{ display: 'grid', gap: 0 }}>
        {rows.map((row, rowIndex) => {
          const highlighted = highlightLabel(row.values);
          return (
            <div key={row.expr} style={{
              display: 'grid',
              gridTemplateColumns: '52px minmax(0, 1fr) 84px',
              gap: 14,
              alignItems: 'center',
              minHeight: 82,
              borderTop: rowIndex === 0 ? 'none' : '1px dashed #dbe3ef',
              padding: rowIndex === 0 ? '0 0 12px' : '12px 0',
            }} className="expression-row">
              <span style={{ color: '#0f172a', fontSize: 14, fontWeight: 720 }}>{row.label}</span>
              <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                {row.values.map(value => (
                  <div key={`${row.expr}-${value.groupId}`} style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 40px',
                    gap: 10,
                    alignItems: 'center',
                    minWidth: 0,
                  }}>
                    <div style={{ height: 12, background: '#f1f5f9', borderRadius: 0, overflow: 'visible', minWidth: 0 }}>
                      <div style={{
                        width: `${Math.max(value.pct, value.pct > 0 ? 5 : 0)}%`,
                        height: '100%',
                        background: GROUP_COLORS[value.groupId],
                        borderRadius: 0,
                        boxShadow: value.pct > 0 ? `0 0 0 1px ${GROUP_COLORS[value.groupId]}22` : 'none',
                      }} />
                    </div>
                    <span style={{ color: '#111827', fontSize: 13, fontWeight: 650 }}>{value.pct}%</span>
                  </div>
                ))}
              </div>
              {highlighted ? (
                <span className="expression-highlight" style={{
                  justifySelf: 'end',
                  ...tagStyle(highlighted.groupId),
                  height: 26,
                  padding: '0 9px',
                  fontSize: 12,
                }}>
                  {(GROUP_LABELS[highlighted.groupId] || '').replace('高校', '')}突出
                </span>
              ) : <span className="expression-highlight" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StrategyExplanation() {
  const chips = [
    { groupId: 'sjtu', label: '记录型', desc: '增强科研过程可信度' },
    { groupId: 'international', label: '解释型', desc: '降低复杂机制理解门槛' },
    { groupId: 'enterprise', label: '转译型', desc: '连接科研成果与应用场景' },
  ];
  return (
    <section style={{ ...cardStyle, padding: 18 }}>
      <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 15, fontWeight: 760 }}>策略解释区</h3>
      <div className="strategy-chip-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {chips.map(chip => (
          <div key={chip.label} style={{
            ...tagStyle(chip.groupId),
            height: 'auto',
            justifyContent: 'flex-start',
            gap: 8,
            padding: '10px 12px',
          }}>
            <span style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              border: `1px solid ${GROUP_TINTS[chip.groupId].border}`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: '0 0 auto',
            }}>
              {chip.label.slice(0, 1)}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {chip.label}：{chip.desc}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function sampleForGroup(groups: ComparisonGroup[], groupId: string, expression: ExpressionKey, fallback: ComparisonSample[]) {
  const groupSamples = groups.find(group => group.id === groupId)?.samples || [];
  return findSampleForExpression(groupSamples.length > 0 ? groupSamples : fallback, expression);
}

function StrategyCaseItem({
  title,
  tags,
  insight,
  sample,
  groupId,
}: {
  title: string;
  tags: string[];
  insight: string;
  sample?: ComparisonSample | null;
  groupId: string;
}) {
  const navigate = useNavigate();
  const displayTitle = sample?.title || title;
  return (
    <button
      type="button"
      onClick={sample ? () => navigate(`/cases/${sample.id}`) : undefined}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '112px minmax(0, 1fr)',
        gap: 14,
        padding: 12,
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        cursor: sample ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      <div style={{
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: 6,
        border: '1px solid #e5e7eb',
        background: '#f8fafc',
        overflow: 'hidden',
      }}>
        {sample?.thumbnail ? (
          <img
            src={sample.thumbnail}
            alt={displayTitle}
            loading="lazy"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: '#94a3b8', fontSize: 12 }}>
            暂无图像
          </div>
        )}
      </div>
      <div style={{ minWidth: 0, paddingTop: 3 }}>
        <h3 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 15, lineHeight: 1.35, fontWeight: 760 }}>
          {truncate(title, 18)}：{truncate(displayTitle, 18)}
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {tags.map(tag => (
            <span key={tag} style={{ ...tagStyle(groupId), height: 26 }}>{tag}</span>
          ))}
        </div>
        <p style={{ margin: 0, color: '#475569', fontSize: 13, lineHeight: 1.65 }}>
          可借鉴点：{insight}
        </p>
      </div>
    </button>
  );
}

function StrategyCasesRail({ groups }: { groups: ComparisonGroup[] }) {
  const allSamples = useMemo(() => groups.flatMap(group => group.samples), [groups]);
  const items = [
    {
      title: '记录型案例',
      tags: ['摄影', '记录'],
      insight: '真实场景增强可信度',
      groupId: 'sjtu',
      sample: sampleForGroup(groups, 'sjtu', 'record', allSamples),
    },
    {
      title: '解释型案例',
      tags: ['3D 渲染', '解释'],
      insight: '抽象结构空间化',
      groupId: 'international',
      sample: sampleForGroup(groups, 'international', 'explain', allSamples),
    },
    {
      title: '证明型案例',
      tags: ['数据图表', '证明'],
      insight: '用数据强化研究说服力',
      groupId: 'domestic',
      sample: findSampleForExpression([
        ...(groups.find(group => group.id === 'international')?.samples || []),
        ...(groups.find(group => group.id === 'domestic')?.samples || []),
        ...allSamples,
      ], 'prove'),
    },
    {
      title: '转译型案例',
      tags: ['信息图', '转译'],
      insight: '把技术能力转化为应用价值',
      groupId: 'enterprise',
      sample: sampleForGroup(groups, 'enterprise', 'translate', allSamples),
    },
  ];

  return (
    <aside className="comparison-cases-rail" style={{ ...cardStyle, padding: 18 }}>
      <h2 style={{ margin: '0 0 16px', color: '#0f172a', fontSize: 20, fontWeight: 760 }}>典型策略案例</h2>
      <div style={{ display: 'grid', gap: 14 }}>
        {items.map(item => (
          <StrategyCaseItem key={item.title} {...item} />
        ))}
      </div>
    </aside>
  );
}

const MEDIA_FORMS = ['摄影', '显微图', '信息图', '3D渲染', '数据图表', '视频动画'];

const STATIC_MATRIX: Record<string, Record<ExpressionKey, 'strong' | 'medium' | 'weak'>> = {
  '摄影': { record: 'strong', explain: 'medium', prove: 'medium', communicate: 'weak', translate: 'medium' },
  '显微图': { record: 'strong', explain: 'strong', prove: 'medium', communicate: 'weak', translate: 'medium' },
  '信息图': { record: 'weak', explain: 'strong', prove: 'medium', communicate: 'strong', translate: 'strong' },
  '3D渲染': { record: 'weak', explain: 'strong', prove: 'medium', communicate: 'strong', translate: 'strong' },
  '数据图表': { record: 'weak', explain: 'medium', prove: 'strong', communicate: 'medium', translate: 'medium' },
  '视频动画': { record: 'medium', explain: 'strong', prove: 'medium', communicate: 'strong', translate: 'strong' },
};

const STRENGTH_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  strong: { bg: '#2563eb', text: '#ffffff', label: '强' },
  medium: { bg: '#bfdbfe', text: '#0f3a6f', label: '中' },
  weak: { bg: '#eef4fb', text: '#1e3a5f', label: '弱' },
};

function ExpressionMatrix() {
  return (
    <section style={{ ...cardStyle, padding: '18px 22px' }}>
      <h2 style={{ margin: '0 0 12px', color: '#0f172a', fontSize: 20, fontWeight: 760 }}>
        视觉形式 × 表达功能适配矩阵
        <span title="基于当前编码本总结的策略启发矩阵" style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 17,
          height: 17,
          marginLeft: 8,
          borderRadius: 9,
          border: '1px solid #cbd5e1',
          color: '#64748b',
          fontSize: 12,
          verticalAlign: '2px',
        }}>i</span>
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: 120, padding: '9px 12px', border: '1px solid #e2e8f0', color: '#475569', fontSize: 13, textAlign: 'left' }} />
              {EXPRESSION_ORDER.map(expr => (
                <th key={expr} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, fontWeight: 720, textAlign: 'center' }}>
                  {EXPRESSION_LABELS[expr]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEDIA_FORMS.map(form => (
              <tr key={form}>
                <td style={{ padding: '12px 16px', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, fontWeight: 720 }}>
                  {form}
                </td>
                {EXPRESSION_ORDER.map(expr => {
                  const strength = STATIC_MATRIX[form]?.[expr] || 'weak';
                  const color = STRENGTH_COLORS[strength];
                  return (
                    <td key={`${form}-${expr}`} style={{
                      height: 46,
                      padding: 0,
                      border: '1px solid #e2e8f0',
                      background: color.bg,
                      color: color.text,
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 760,
                    }}>
                      {color.label}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EnterpriseSignals({ signals }: { signals?: EnterpriseCommercialSignals }) {
  const navigate = useNavigate();
  const topSignals = signals?.signals.filter(signal => signal.count > 0).slice(0, 3) || [];
  if (topSignals.length === 0) return null;

  return (
    <section style={{ ...cardStyle, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: 15, fontWeight: 760 }}>企业商业化信号</h3>
        <button
          type="button"
          onClick={() => {
            const search = new URLSearchParams({ review_status: 'approved', source_name: 'enterprise' });
            navigate(`/cases?${search.toString()}`);
          }}
          style={{
            height: 28,
            padding: '0 10px',
            borderRadius: 6,
            border: `1px solid ${GROUP_TINTS.enterprise.border}`,
            background: GROUP_TINTS.enterprise.bg,
            color: GROUP_TINTS.enterprise.text,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          查看企业样本
        </button>
      </div>
      <div className="enterprise-signal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        {topSignals.map(signal => (
          <div key={signal.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
              <strong style={{ color: ORANGE, fontSize: 20 }}>{signal.percentage.toFixed(0)}%</strong>
              <span style={{ color: '#475569', fontSize: 12, fontWeight: 650 }}>{signal.label}</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: '#ffedd5', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(6, signal.percentage)}%`, height: '100%', background: ORANGE, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ComparisonPage() {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [selectedDimension, setSelectedDimension] = useState('functionalPurpose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');

    api.getComparison(selectedSchool === 'all' ? undefined : selectedSchool, selectedDimension)
      .then(response => {
        if (ignore) return;
        if (response.success) setData(response.data);
        else setError(response.error || '加载对比数据失败');
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message || '加载对比数据失败');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => { ignore = true; };
  }, [selectedSchool, selectedDimension]);

  const allGroups = data?.groups || [];
  const hasData = allGroups.some(group => group.total > 0);

  return (
    <>
      <style>{`
        .comparison-shell {
          display: grid;
          grid-template-columns: minmax(300px, 396px) minmax(520px, 1fr) minmax(330px, 430px);
          gap: 20px;
          align-items: start;
          min-width: 0;
        }
        .comparison-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
          min-width: 0;
        }
        .comparison-chart-card {
          min-width: 0;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }
        .comparison-main > * {
          max-width: 100%;
          box-sizing: border-box;
        }
        .comparison-cases-rail,
        .comparison-sidebar {
          position: sticky;
          top: 72px;
        }
        .comparison-sidebar select:disabled {
          opacity: 1;
          cursor: default;
        }
        .comparison-cases-rail button:hover {
          border-color: #bfdbfe !important;
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.08);
          transform: translateY(-1px);
        }
        @media (max-width: 1320px) {
          .comparison-shell {
            grid-template-columns: 330px minmax(0, 1fr);
          }
          .comparison-cases-rail {
            position: static;
            grid-column: 1 / -1;
          }
          .comparison-cases-rail > div {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 960px) {
          .comparison-shell {
            grid-template-columns: minmax(0, 1fr);
          }
          .comparison-sidebar {
            position: static;
          }
          .comparison-legend,
          .strategy-chip-grid,
          .enterprise-signal-grid,
          .comparison-cases-rail > div {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          body header > div {
            max-width: none !important;
            width: 100% !important;
            box-sizing: border-box;
            padding: 0 12px !important;
            gap: 14px !important;
            overflow: hidden;
          }
          body header nav {
            min-width: 0;
            max-width: 100%;
            overflow-x: auto;
            flex: 1 1 auto !important;
          }
          body header nav a {
            flex: 0 0 auto;
          }
          body main {
            width: calc(100% - 24px) !important;
            padding: 8px 12px 0 !important;
          }
          .comparison-page {
            padding: 12px 0 28px !important;
          }
          .comparison-cases-rail button {
            grid-template-columns: 86px minmax(0, 1fr) !important;
          }
          .comparison-chart-card {
            overflow: hidden;
          }
          .comparison-chart-header {
            display: grid !important;
            gap: 12px !important;
          }
          .comparison-legend {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px 12px !important;
            width: 100% !important;
            overflow: hidden;
          }
          .expression-row {
            grid-template-columns: 40px minmax(0, 1fr) !important;
            gap: 10px !important;
          }
          .expression-highlight {
            grid-column: 2;
            justify-self: start !important;
          }
        }
      `}</style>

      <div className="comparison-page" style={{ padding: '12px 0 40px', minHeight: 'calc(100vh - 70px)' }}>
        {error && (
          <div style={{
            background: theme.colors.redBg,
            border: `1px solid ${theme.colors.redBorder}`,
            color: theme.colors.red,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div className="comparison-shell">
          <AnalysisSidebar
            selectedSchool={selectedSchool}
            setSelectedSchool={setSelectedSchool}
            selectedDimension={selectedDimension}
            setSelectedDimension={setSelectedDimension}
            loading={loading}
          />

          <main className="comparison-main">
            {loading && !data ? (
              <section style={{ ...cardStyle, padding: 36, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                正在加载分析数据...
              </section>
            ) : data && hasData ? (
              <>
                <ExpressionBarChart groups={allGroups} dimension={selectedDimension} />
                <StrategyExplanation />
                <ExpressionMatrix />
                <EnterpriseSignals signals={data.enterpriseCommercialSignals} />
              </>
            ) : data ? (
              <section style={{ ...cardStyle, padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                该范围暂无数据，请选择其他院系或维度。
              </section>
            ) : null}
          </main>

          {data && hasData && <StrategyCasesRail groups={allGroups} />}
        </div>
      </div>
    </>
  );
}
