import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Card } from '../components';
import type { ComparisonData, ComparisonDistributionItem, ComparisonGroup, ComparisonGroupId, ComparisonSample } from '../types';
import { theme } from '../theme';

type AxisKey = 'functionalPurpose' | 'technicalMethod' | 'distributionMedium';
type DrilldownKey = 'contentSubType' | 'mediaSubType' | 'contentType';
type DrilldownView = 'structure' | 'difference' | 'detail';
type PurposeKey = 'all' | 'academic' | 'public' | 'industry';
type AnalysisMode = 'live' | 'balanced';

const AXES: Array<{ key: AxisKey; label: string; question: string }> = [
  { key: 'functionalPurpose', label: '功能维度', question: '图像主要用来做什么？' },
  { key: 'technicalMethod', label: '技术维度', question: '图像主要如何生产？' },
  { key: 'distributionMedium', label: '媒介维度', question: '图像以什么形式呈现？' },
];

const PURPOSES: Array<{ key: PurposeKey; label: string; helper: string; categories: string[] }> = [
  { key: 'all', label: '全部目的', helper: '查看完整功能、媒介、技术结构', categories: [] },
  { key: 'academic', label: '学术交流', helper: '重证据：解释机制、呈现数据', categories: ['解释', '数据'] },
  { key: 'public', label: '公众传播', helper: '重理解：降低理解门槛', categories: ['传播'] },
  { key: 'industry', label: '产业转化', helper: '重应用：展示成果与场景价值', categories: ['展示'] },
];

const GROUP_COLORS: Record<string, string> = {
  ime: '#0891b2',
  sjtu: '#4f7cac',
  domestic: '#53a653',
  overseasUniversity: '#7c5ccf',
  international: '#6b7280',
  enterprise: '#f28c28',
};

const AXIS_DESCRIPTIONS: Record<AxisKey, Record<string, string>> = {
  functionalPurpose: {
    记录: '保存对象、现场、人物或实验过程',
    解释: '说明结构、流程、机制和原理',
    数据: '呈现结果、模型、趋势和分析',
    展示: '呈现成果、产品、空间或项目形象',
    传播: '面向公众、品牌、科普或宣传',
    交互: '支持操作、浏览、筛选和决策',
  },
  technicalMethod: {
    拍摄: '相机、摄像机、无人机等现实采集',
    成像: '显微、医学、遥感、热成像等专业成像',
    绘设: '插画、图标、信息设计和排版',
    数据: '图表、地图、网络和数据可视化',
    渲染: '3D、仿真、建模和工程可视化',
    生成: 'AI、算法增强和风格迁移',
  },
  distributionMedium: {
    静图: '单张静态图像',
    图组: '多图、组图、长图和步骤图',
    视频: '连续影像、动画和讲解视频',
    动图: 'GIF、循环动效和短动画',
    交互: '地图、仪表盘、可缩放可视化',
    实体: '印刷、海报、展板和包装',
  },
};

const DRILLDOWN_CONFIG: Record<AxisKey, { dimension: DrilldownKey; label: string; note: string }> = {
  functionalPurpose: {
    dimension: 'contentSubType',
    label: '功能细分',
    note: '用于解释同一功能主类内部的任务差异；空值会回退到首页的内容主题。',
  },
  technicalMethod: {
    dimension: 'mediaSubType',
    label: '技术细分',
    note: '用于解释同一技术主类内部的生产方式差异；旧图像大类不会直接作为细分展示，无法可靠判断时标为“未细分”。',
  },
  distributionMedium: {
    dimension: 'contentType',
    label: '内容主题',
    note: '媒介本身已经是呈现形式，因此下钻后查看该媒介承载了哪些画面内容。',
  },
};

function compactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function byCount(a: ComparisonDistributionItem, b: ComparisonDistributionItem): number {
  return b.count - a.count || a.label.localeCompare(b.label, 'zh-CN');
}

function groupById(data: ComparisonData | null, groupId: string): ComparisonGroup | undefined {
  return data?.groups.find(group => group.id === groupId);
}

function topLabel(group: ComparisonGroup | undefined): string {
  return group?.distribution.filter(item => item.label !== '未标注' && item.label !== '不确定')[0]?.label || '-';
}

function distributionMap(group: ComparisonGroup | undefined): Map<string, ComparisonDistributionItem> {
  return new Map((group?.distribution || []).map(item => [item.label, item]));
}

function categoryValue(group: ComparisonGroup | undefined, label: string): ComparisonDistributionItem {
  return distributionMap(group).get(label) || { label, count: 0, percentage: 0 };
}

function getAllLabels(a: ComparisonGroup | undefined, b: ComparisonGroup | undefined): string[] {
  const labels = new Set<string>();
  a?.distribution.forEach(item => labels.add(item.label));
  b?.distribution.forEach(item => labels.add(item.label));
  return [...labels].filter(label => label !== '未标注').sort((x, y) => {
    const maxX = Math.max(categoryValue(a, x).percentage, categoryValue(b, x).percentage);
    const maxY = Math.max(categoryValue(a, y).percentage, categoryValue(b, y).percentage);
    return maxY - maxX || x.localeCompare(y, 'zh-CN');
  });
}

function aggregateDistribution(data: ComparisonData | null): ComparisonDistributionItem[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const group of data?.groups || []) {
    for (const item of group.distribution) {
      if (item.label === '未标注' || item.label === '不确定') continue;
      counts.set(item.label, (counts.get(item.label) || 0) + item.count);
      total += item.count;
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
    .sort(byCount);
}

function makeInsight(a: ComparisonGroup | undefined, b: ComparisonGroup | undefined, dataByAxis: Record<AxisKey, ComparisonData | null>): string[] {
  if (!a || !b) return [];
  const lines: string[] = [];
  const aFunction = groupById(dataByAxis.functionalPurpose, a.id);
  const bFunction = groupById(dataByAxis.functionalPurpose, b.id);
  const aTech = groupById(dataByAxis.technicalMethod, a.id);
  const bTech = groupById(dataByAxis.technicalMethod, b.id);

  const aTopFn = topLabel(aFunction);
  const bTopFn = topLabel(bFunction);
  if (aTopFn !== '-' && bTopFn !== '-') {
    lines.push(`${a.label}的功能主轴是「${aTopFn}」，${b.label}的功能主轴是「${bTopFn}」，说明两者的影像任务并不相同。`);
  }

  const aTopTech = topLabel(aTech);
  const bTopTech = topLabel(bTech);
  if (aTopTech !== '-' && bTopTech !== '-') {
    lines.push(`${a.label}技术上以「${aTopTech}」为主，${b.label}以「${bTopTech}」为主，可用于判断影像生产能力的差异。`);
  }

  const diffs = buildDiffRows(a.id, b.id, dataByAxis).slice(0, 2);
  if (diffs.length > 0) {
    lines.push(`差异最大的指标是「${diffs[0].label}」，${a.label}相对${b.label}${diffs[0].diff >= 0 ? '高' : '低'} ${Math.abs(diffs[0].diff).toFixed(1)} 个百分点。`);
  }
  return lines;
}

function buildDiffRows(aId: string, bId: string, dataByAxis: Record<AxisKey, ComparisonData | null>) {
  const rows: Array<{ axis: AxisKey; axisLabel: string; label: string; aPct: number; bPct: number; diff: number }> = [];
  for (const axis of AXES) {
    const aGroup = groupById(dataByAxis[axis.key], aId);
    const bGroup = groupById(dataByAxis[axis.key], bId);
    const labels = getAllLabels(aGroup, bGroup);
    for (const label of labels) {
      const aPct = categoryValue(aGroup, label).percentage;
      const bPct = categoryValue(bGroup, label).percentage;
      rows.push({ axis: axis.key, axisLabel: axis.label, label, aPct, bPct, diff: Math.round((aPct - bPct) * 10) / 10 });
    }
  }
  return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

function SegmentedButton<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, borderRadius: 8, background: theme.colors.bgSubtle, border: `1px solid ${theme.colors.border}` }}>
      {items.map(item => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.key)}
            style={{
              height: 30,
              padding: '0 12px',
              border: 'none',
              borderRadius: 6,
              background: active ? theme.colors.bgCard : 'transparent',
              color: item.disabled ? theme.colors.text.tertiary : active ? theme.colors.text.primary : theme.colors.text.secondary,
              boxShadow: active ? theme.shadow.card : 'none',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.size.sm,
              fontWeight: active ? 700 : 600,
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
      <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 700 }}>{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        style={{
          height: 38,
          borderRadius: 8,
          border: `1px solid ${theme.colors.border}`,
          background: theme.colors.bgCard,
          color: theme.colors.text.primary,
          padding: '0 10px',
          fontSize: theme.typography.size.sm,
        }}
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function StepBadge({ children }: { children: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 24,
      padding: '0 9px',
      borderRadius: 999,
      background: theme.colors.text.primary,
      color: theme.colors.bgCard,
      fontSize: theme.typography.size.xs,
      fontWeight: 750,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function UsageGuide({ aLabel, bLabel }: { aLabel: string; bLabel: string }) {
  const steps = [
    { title: '先选对比对象', body: `当前比较 ${aLabel || 'A'} 和 ${bLabel || 'B'}，看两类来源的结构差异。` },
    { title: '再看三轴分布', body: '功能看用途，技术看生产方式，媒介看呈现形式。' },
    { title: '点击一级分类', body: '点“记录”“拍摄”“静图”等条目，下方会显示它内部的细分组成。' },
  ];
  return (
    <Card padding={16} style={{ marginBottom: 18, background: theme.colors.bgSubtle }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {steps.map((step, index) => (
          <div key={step.title} style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'start' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 999,
              background: theme.colors.bgCard,
              border: `1px solid ${theme.colors.border}`,
              color: theme.colors.text.primary,
              fontSize: theme.typography.size.sm,
              fontWeight: 800,
            }}>
              {index + 1}
            </span>
            <span>
              <strong style={{ display: 'block', color: theme.colors.text.primary, fontSize: theme.typography.size.sm }}>{step.title}</strong>
              <span style={{ display: 'block', marginTop: 3, color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.5 }}>{step.body}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SourceOverview({ dataByAxis }: { dataByAxis: Record<AxisKey, ComparisonData | null> }) {
  const groups = dataByAxis.functionalPurpose?.groups || [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
      {groups.map(group => {
        const tech = groupById(dataByAxis.technicalMethod, group.id);
        const medium = groupById(dataByAxis.distributionMedium, group.id);
        return (
          <Card key={group.id} padding={16} style={{ borderTop: `4px solid ${GROUP_COLORS[group.id] || theme.colors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <h3 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.lg, fontWeight: 750 }}>{group.label}</h3>
              <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs }}>{compactNumber(group.total)} 条</span>
            </div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8, color: theme.colors.text.secondary, fontSize: theme.typography.size.sm }}>
              <span>功能主轴：<strong style={{ color: theme.colors.text.primary }}>{topLabel(group)}</strong></span>
              <span>技术主轴：<strong style={{ color: theme.colors.text.primary }}>{topLabel(tech)}</strong></span>
              <span>媒介主轴：<strong style={{ color: theme.colors.text.primary }}>{topLabel(medium)}</strong></span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function OverallDistribution({
  axis,
  data,
  selectedLabel,
  onSelect,
}: {
  axis: AxisKey;
  data: ComparisonData | null;
  selectedLabel?: string;
  onSelect?: (axis: AxisKey, label: string) => void;
}) {
  const rows = aggregateDistribution(data);
  const max = Math.max(1, ...rows.map(row => row.count));
  return (
    <Card padding={18}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StepBadge>第 1 步</StepBadge>
          <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 750 }}>
            看整体结构 · {AXES.find(item => item.key === axis)?.label}
          </h2>
        </div>
        <p style={{ margin: '8px 0 0', color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
          这里是所有来源组汇总后的真实分布。点击任一条目，比如“记录”或“拍摄”，下方会展开内部细分。
        </p>
      </div>
      <div style={{ display: 'grid', gap: 11 }}>
        {rows.map((row, index) => {
          const selected = selectedLabel === row.label;
          return (
          <button
            key={row.label}
            onClick={() => onSelect?.(axis, row.label)}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px minmax(220px, 1fr) 86px minmax(160px, 260px)',
              alignItems: 'center',
              gap: 12,
              border: selected ? `1px solid ${theme.colors.accent}` : '1px solid transparent',
              borderRadius: 8,
              background: selected ? theme.colors.accentBg : 'transparent',
              padding: 4,
              cursor: onSelect ? 'pointer' : 'default',
              textAlign: 'left',
              boxShadow: selected ? `0 0 0 1px ${theme.colors.accentBorder}` : 'none',
            }}
          >
            <div style={{ color: theme.colors.text.primary, fontWeight: 650, textAlign: 'right' }}>{row.label}</div>
            <div style={{ height: 30, borderRadius: 6, background: theme.colors.bgSubtle, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.max(2, row.count / max * 100)}%`,
                background: chartColor(index),
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: 8,
                color: '#fff',
                fontWeight: 700,
                fontSize: theme.typography.size.sm,
              }}>
                {compactNumber(row.count)}
              </div>
            </div>
            <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.sm }}>
              {row.percentage.toFixed(1)}%
            </div>
            <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, lineHeight: 1.4 }}>
              {AXIS_DESCRIPTIONS[axis][row.label] || ''}
              <span style={{ display: 'block', marginTop: 2, color: selected ? theme.colors.accent : theme.colors.text.tertiary, fontWeight: selected ? 700 : 500 }}>
                {selected ? '正在查看细分' : '点击看细分'}
              </span>
            </div>
          </button>
        );})}
      </div>
    </Card>
  );
}

function AxisComparisonChart({
  axis,
  a,
  b,
  selectedLabel,
  onSelect,
}: {
  axis: AxisKey;
  a: ComparisonGroup | undefined;
  b: ComparisonGroup | undefined;
  selectedLabel?: string;
  onSelect?: (axis: AxisKey, label: string) => void;
}) {
  const labels = getAllLabels(a, b).slice(0, 8);
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <StepBadge>第 2 步</StepBadge>
        <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 750 }}>
          {AXES.find(item => item.key === axis)?.label}对比
        </h2>
      </div>
      <p style={{ margin: '0 0 14px', color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
        {AXES.find(item => item.key === axis)?.question} 点击某个一级分类后，下方会显示该分类内部由什么组成。
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {labels.map(label => {
          const av = categoryValue(a, label);
          const bv = categoryValue(b, label);
          const selected = selectedLabel === label;
          return (
            <button
              key={label}
              onClick={() => onSelect?.(axis, label)}
              style={{
                display: 'grid',
                gridTemplateColumns: '74px 1fr 1fr',
                gap: 10,
                alignItems: 'center',
                border: selected ? `1px solid ${theme.colors.accent}` : '1px solid transparent',
                borderRadius: 8,
                background: selected ? theme.colors.accentBg : 'transparent',
                padding: 4,
                cursor: onSelect ? 'pointer' : 'default',
                textAlign: 'left',
                boxShadow: selected ? `0 0 0 1px ${theme.colors.accentBorder}` : 'none',
              }}
            >
              <div>
                <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, fontWeight: 650 }}>{label}</div>
                <div style={{ color: selected ? theme.colors.accent : theme.colors.text.tertiary, fontSize: 11, marginTop: 2, fontWeight: selected ? 700 : 500 }}>
                  {selected ? '已下钻' : '可点击'}
                </div>
              </div>
              <MiniBar value={av.percentage} color={GROUP_COLORS[a?.id || ''] || theme.colors.accent} label={`${av.percentage.toFixed(1)}%`} />
              <MiniBar value={bv.percentage} color={GROUP_COLORS[b?.id || ''] || theme.colors.orange} label={`${bv.percentage.toFixed(1)}%`} />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
        <Legend color={GROUP_COLORS[a?.id || ''] || theme.colors.accent} label={a?.label || '-'} />
        <Legend color={GROUP_COLORS[b?.id || ''] || theme.colors.orange} label={b?.label || '-'} />
      </div>
    </Card>
  );
}

function MiniBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 54px', gap: 8, alignItems: 'center' }}>
      <div style={{ height: 10, background: theme.colors.bgSubtle, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(1, value)}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.xs, fontWeight: 700, textAlign: 'right' }}>{label}</span>
    </div>
  );
}

function DrilldownStackBar({
  group,
  labels,
  colorByLabel,
  size = 'compact',
}: {
  group: ComparisonGroup | undefined;
  labels: string[];
  colorByLabel: Map<string, string>;
  size?: 'compact' | 'large';
}) {
  const large = size === 'large';
  const visibleLabels = labels.slice(0, 7);
  const visibleTotal = visibleLabels.reduce((sum, label) => sum + categoryValue(group, label).percentage, 0);
  const otherPct = Math.max(0, Math.round((100 - visibleTotal) * 10) / 10);
  const segments = [
    ...visibleLabels.map(label => ({ label, percentage: categoryValue(group, label).percentage, color: colorByLabel.get(label) || theme.colors.text.tertiary })),
    ...(otherPct >= 1 ? [{ label: '其他', percentage: otherPct, color: '#d8dae2' }] : []),
  ].filter(segment => segment.percentage > 0);

  return (
    <div style={{ display: 'grid', gap: large ? 10 : 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ color: theme.colors.text.primary, fontSize: large ? theme.typography.size.base : theme.typography.size.sm }}>{group?.label || '-'}</strong>
        <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs }}>{compactNumber(group?.total || 0)} 条</span>
      </div>
      <div style={{ display: 'flex', height: large ? 52 : 34, width: '100%', overflow: 'hidden', borderRadius: 8, background: theme.colors.bgSubtle, border: `1px solid ${theme.colors.borderLight}` }}>
        {segments.map(segment => (
          <div
            key={segment.label}
            title={`${segment.label} ${segment.percentage.toFixed(1)}%`}
            style={{
              flex: `${Math.max(0.6, segment.percentage)} 0 0`,
              minWidth: segment.percentage >= 3 ? 18 : 3,
              background: segment.color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 5px',
              fontSize: large ? 12 : 11,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              borderRight: '1px solid rgba(255,255,255,0.65)',
            }}
          >
            {segment.percentage >= (large ? 6 : 9) ? `${segment.label} ${segment.percentage.toFixed(large ? 1 : 0)}%` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function DrilldownLegend({ labels, colorByLabel }: { labels: string[]; colorByLabel: Map<string, string> }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      {labels.slice(0, 7).map(label => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: theme.colors.text.secondary, fontSize: 11 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: colorByLabel.get(label) || theme.colors.text.tertiary }} />
          {label}
        </span>
      ))}
      {labels.length > 7 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: theme.colors.text.secondary, fontSize: 11 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: '#d8dae2' }} />
          其他
        </span>
      )}
    </div>
  );
}

function DrilldownDifferenceRows({
  a,
  b,
  labels,
}: {
  a: ComparisonGroup | undefined;
  b: ComparisonGroup | undefined;
  labels: string[];
}) {
  const rows = labels
    .map(label => {
      const av = categoryValue(a, label);
      const bv = categoryValue(b, label);
      const diff = Math.round((av.percentage - bv.percentage) * 10) / 10;
      return { label, av, bv, diff };
    })
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
    .slice(0, 6);
  const max = Math.max(1, ...rows.map(row => Math.abs(row.diff)));

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {rows.map(row => {
        const positive = row.diff >= 0;
        const stronger = positive ? a?.label || 'A' : b?.label || 'B';
        return (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '82px 1fr 72px', gap: 8, alignItems: 'center' }}>
            <div>
              <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.xs, fontWeight: 800 }}>{row.label}</div>
              <div style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>{stronger}更高</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ height: 11, display: 'flex', justifyContent: 'flex-end', background: theme.colors.bgSubtle, borderRadius: '999px 0 0 999px', overflow: 'hidden' }}>
                {!positive && <div style={{ width: `${Math.abs(row.diff) / max * 100}%`, background: GROUP_COLORS[b?.id || ''] || theme.colors.orange }} />}
              </div>
              <div style={{ height: 11, background: theme.colors.bgSubtle, borderRadius: '0 999px 999px 0', overflow: 'hidden' }}>
                {positive && <div style={{ width: `${Math.abs(row.diff) / max * 100}%`, height: '100%', background: GROUP_COLORS[a?.id || ''] || theme.colors.accent }} />}
              </div>
            </div>
            <div style={{ color: positive ? GROUP_COLORS[a?.id || ''] || theme.colors.accent : GROUP_COLORS[b?.id || ''] || theme.colors.orange, fontSize: theme.typography.size.xs, fontWeight: 900, textAlign: 'right' }}>
              {positive ? '+' : ''}{row.diff.toFixed(1)}pp
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DrilldownDetailRows({
  a,
  b,
  labels,
}: {
  a: ComparisonGroup | undefined;
  b: ComparisonGroup | undefined;
  labels: string[];
}) {
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {labels.slice(0, 7).map(label => {
        const av = categoryValue(a, label);
        const bv = categoryValue(b, label);
        return (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 700 }}>{label}</div>
            <MiniBar value={av.percentage} color={GROUP_COLORS[a?.id || ''] || theme.colors.accent} label={`${av.percentage.toFixed(1)}%`} />
            <MiniBar value={bv.percentage} color={GROUP_COLORS[b?.id || ''] || theme.colors.orange} label={`${bv.percentage.toFixed(1)}%`} />
          </div>
        );
      })}
    </div>
  );
}

function DrilldownTakeaway({ a, b, labels }: { a: ComparisonGroup | undefined; b: ComparisonGroup | undefined; labels: string[] }) {
  const aTop = labels.map(label => categoryValue(a, label)).sort((x, y) => y.percentage - x.percentage)[0];
  const bTop = labels.map(label => categoryValue(b, label)).sort((x, y) => y.percentage - x.percentage)[0];
  if (!aTop || !bTop) return null;
  const sameTop = aTop.label === bTop.label;
  const aColor = GROUP_COLORS[a?.id || ''] || theme.colors.accent;
  const bColor = GROUP_COLORS[b?.id || ''] || theme.colors.orange;
  const highlightStyle = (color: string) => ({
    color,
    fontWeight: 900,
  });
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: theme.colors.bgSubtle, color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.7 }}>
      {sameTop ? (
        <>
          <div>
            {a?.label || 'A'}和{b?.label || 'B'}都以
            <strong style={highlightStyle(aColor)}>「{aTop.label}」</strong>
            为主。
          </div>
          <div>
            集中程度分别为
            <strong style={highlightStyle(aColor)}> {aTop.percentage.toFixed(1)}%</strong>
            和
            <strong style={highlightStyle(bColor)}> {bTop.percentage.toFixed(1)}%</strong>
            。
          </div>
        </>
      ) : (
        <>
          <div>
            {a?.label || 'A'}最集中在
            <strong style={highlightStyle(aColor)}>「{aTop.label}」</strong>
            。
          </div>
          <div>
            {b?.label || 'B'}最集中在
            <strong style={highlightStyle(bColor)}>「{bTop.label}」</strong>
            。
          </div>
          <div style={{ marginTop: 2, color: theme.colors.text.tertiary }}>
            说明两组在这个一级类别内部的表达重心不同。
          </div>
        </>
      )}
    </div>
  );
}

function DrilldownFocusCard({
  selection,
  data,
  loading,
  aId,
  bId,
}: {
  selection: { axis: AxisKey; label: string };
  data: ComparisonData | null;
  loading: boolean;
  aId: string;
  bId: string;
}) {
  const [view, setView] = useState<DrilldownView>('structure');
  const config = DRILLDOWN_CONFIG[selection.axis];
  const a = groupById(data, aId);
  const b = groupById(data, bId);
  const labels = getAllLabels(a, b);
  const colorByLabel = new Map(labels.map((label, index) => [label, subtypeColor(index)]));

  return (
    <Card padding={20} style={{ gridColumn: '1 / -1', borderColor: theme.colors.accentBorder, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <StepBadge>细分展开</StepBadge>
            <h3 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 850 }}>
              {selection.label}内部细分
            </h3>
          </div>
          <p style={{ margin: 0, color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
            当前路径：{AXES.find(item => item.key === selection.axis)?.label} &gt; {selection.label} &gt; {config.label}
          </p>
          <p style={{ margin: '4px 0 0', color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, lineHeight: 1.6 }}>
            {config.note}
          </p>
        </div>
        <SegmentedButton
          value={view}
          onChange={setView}
          items={[
            { key: 'structure', label: '结构' },
            { key: 'difference', label: '差异' },
            { key: 'detail', label: '明细' },
          ]}
        />
      </div>

      {loading ? (
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, padding: 18, background: theme.colors.bgSubtle, borderRadius: 8 }}>
          加载细分数据...
        </div>
      ) : labels.length === 0 ? (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, padding: 18, background: theme.colors.bgSubtle, borderRadius: 8 }}>
          暂无足够细分标签。
        </div>
      ) : view === 'structure' ? (
        <div>
          <div style={{ display: 'grid', gap: 18 }}>
            <DrilldownStackBar group={a} labels={labels} colorByLabel={colorByLabel} size="large" />
            <DrilldownStackBar group={b} labels={labels} colorByLabel={colorByLabel} size="large" />
          </div>
          <DrilldownLegend labels={labels} colorByLabel={colorByLabel} />
          <DrilldownTakeaway a={a} b={b} labels={labels} />
        </div>
      ) : view === 'difference' ? (
        <DrilldownDifferenceRows a={a} b={b} labels={labels} />
      ) : (
        <DrilldownDetailRows a={a} b={b} labels={labels} />
      )}
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function DifferenceChart({ rows, aLabel, bLabel }: { rows: ReturnType<typeof buildDiffRows>; aLabel: string; bLabel: string }) {
  const visible = rows.slice(0, 8);
  const max = Math.max(1, ...visible.map(row => Math.abs(row.diff)));
  return (
    <Card padding={18}>
      <h2 style={{ margin: '0 0 4px', color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 750 }}>
        关键差异
      </h2>
      <p style={{ margin: '0 0 16px', color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm }}>
        正值表示 {aLabel} 更高，负值表示 {bLabel} 更高。
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {visible.map(row => {
          const isPositive = row.diff >= 0;
          return (
            <div key={`${row.axis}-${row.label}`} style={{ display: 'grid', gridTemplateColumns: '126px 1fr 66px', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.sm, fontWeight: 700 }}>{row.label}</div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: 11 }}>{row.axisLabel}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, alignItems: 'center' }}>
                <div style={{ height: 12, display: 'flex', justifyContent: 'flex-end', background: theme.colors.bgSubtle, borderRadius: '999px 0 0 999px', overflow: 'hidden' }}>
                  {!isPositive && <div style={{ width: `${Math.abs(row.diff) / max * 100}%`, background: theme.colors.orange, borderRadius: '999px 0 0 999px' }} />}
                </div>
                <div style={{ height: 12, background: theme.colors.bgSubtle, borderRadius: '0 999px 999px 0', overflow: 'hidden' }}>
                  {isPositive && <div style={{ width: `${Math.abs(row.diff) / max * 100}%`, height: '100%', background: theme.colors.accent, borderRadius: '0 999px 999px 0' }} />}
                </div>
              </div>
              <div style={{ textAlign: 'right', color: isPositive ? theme.colors.accent : theme.colors.orange, fontWeight: 800, fontSize: theme.typography.size.sm }}>
                {isPositive ? '+' : ''}{row.diff.toFixed(1)}pp
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function InsightPanel({ insights }: { insights: string[] }) {
  return (
    <Card padding={18}>
      <h2 style={{ margin: '0 0 12px', color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 750 }}>
        自动解释
      </h2>
      <ol style={{ margin: 0, paddingLeft: 20, color: theme.colors.text.primary, fontSize: theme.typography.size.sm, lineHeight: 1.8 }}>
        {insights.map(item => <li key={item}>{item}</li>)}
      </ol>
    </Card>
  );
}

function SampleLinks({ a, b, axisData }: { a: ComparisonGroup | undefined; b: ComparisonGroup | undefined; axisData: ComparisonData | null }) {
  const navigate = useNavigate();
  const samples = useMemo(() => {
    const aSamples = groupById(axisData, a?.id || '')?.samples || [];
    const bSamples = groupById(axisData, b?.id || '')?.samples || [];
    return [
      ...aSamples.slice(0, 3).map(sample => ({ ...sample, groupLabel: a?.label || '' })),
      ...bSamples.slice(0, 3).map(sample => ({ ...sample, groupLabel: b?.label || '' })),
    ];
  }, [a, b, axisData]);

  return (
    <Card padding={18}>
      <h2 style={{ margin: '0 0 12px', color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 750 }}>
        代表案例入口
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {samples.map(sample => (
          <button
            key={sample.id}
            onClick={() => navigate(`/cases/${sample.id}`)}
            style={{
              display: 'grid',
              gridTemplateColumns: '54px 1fr',
              gap: 10,
              alignItems: 'center',
              minHeight: 70,
              padding: 8,
              textAlign: 'left',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
              background: theme.colors.bgCard,
              cursor: 'pointer',
            }}
          >
            <CaseThumb sample={sample} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: theme.colors.text.primary, fontSize: theme.typography.size.sm, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sample.title || '未命名案例'}</span>
              <span style={{ display: 'block', color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, marginTop: 4 }}>{sample.groupLabel} · {sample.functionalPurpose || '-'} · {sample.technicalMethod || '-'}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function CaseThumb({ sample }: { sample: ComparisonSample }) {
  if (!sample.thumbnail) {
    return <span style={{ width: 54, height: 54, borderRadius: 6, background: theme.colors.bgSubtle }} />;
  }
  return <img src={sample.thumbnail} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, background: theme.colors.bgSubtle }} />;
}

function chartColor(index: number): string {
  const colors = ['#4f7cac', '#f28c28', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#9c755f'];
  return colors[index % colors.length];
}

function subtypeColor(index: number): string {
  const colors = ['#4f7cac', '#f28c28', '#59a14f', '#b07aa1', '#76b7b2', '#edc948', '#e15759', '#9c755f'];
  return colors[index % colors.length];
}

export default function InsightsPage() {
  const [dataByAxis, setDataByAxis] = useState<Record<AxisKey, ComparisonData | null>>({
    functionalPurpose: null,
    technicalMethod: null,
    distributionMedium: null,
  });
  const [comparisonDataByAxis, setComparisonDataByAxis] = useState<Record<AxisKey, ComparisonData | null>>({
    functionalPurpose: null,
    technicalMethod: null,
    distributionMedium: null,
  });
  const [drilldownSelection, setDrilldownSelection] = useState<{ axis: AxisKey; label: string }>({ axis: 'functionalPurpose', label: '记录' });
  const [drilldownData, setDrilldownData] = useState<ComparisonData | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState('');
  const [axis, setAxis] = useState<AxisKey>('functionalPurpose');
  const [sourceA, setSourceA] = useState('sjtu');
  const [sourceB, setSourceB] = useState('enterprise');
  const [purpose, setPurpose] = useState<PurposeKey>('all');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('live');

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.getComparison(undefined, 'functionalPurpose'),
      api.getComparison(undefined, 'technicalMethod'),
      api.getComparison(undefined, 'distributionMedium'),
    ])
      .then(([functional, technical, medium]) => {
        if (ignore) return;
        if (!functional.success || !technical.success || !medium.success) {
          setError(functional.error || technical.error || medium.error || '加载对比数据失败');
          return;
        }
        setDataByAxis({
          functionalPurpose: functional.data,
          technicalMethod: technical.data,
          distributionMedium: medium.data,
        });
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message || '加载对比数据失败');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    let ignore = false;
    setComparisonLoading(true);
    const focusGroups = [sourceA, sourceB].filter(Boolean);
    Promise.all([
      api.getComparison(undefined, 'functionalPurpose', analysisMode, focusGroups),
      api.getComparison(undefined, 'technicalMethod', analysisMode, focusGroups),
      api.getComparison(undefined, 'distributionMedium', analysisMode, focusGroups),
    ])
      .then(([functional, technical, medium]) => {
        if (ignore) return;
        if (!functional.success || !technical.success || !medium.success) {
          setError(functional.error || technical.error || medium.error || '加载对比数据失败');
          return;
        }
        setComparisonDataByAxis({
          functionalPurpose: functional.data,
          technicalMethod: technical.data,
          distributionMedium: medium.data,
        });
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message || '加载对比数据失败');
      })
      .finally(() => {
        if (!ignore) setComparisonLoading(false);
      });
    return () => { ignore = true; };
  }, [analysisMode, sourceA, sourceB]);

  useEffect(() => {
    let ignore = false;
    const config = DRILLDOWN_CONFIG[drilldownSelection.axis];
    const focusGroups = [sourceA, sourceB].filter(Boolean);
    setDrilldownLoading(true);
    api.getComparisonDrilldown(config.dimension, drilldownSelection.axis, drilldownSelection.label, undefined, analysisMode, focusGroups)
      .then(result => {
        if (ignore) return;
        if (result.success) setDrilldownData(result.data);
      })
      .catch(() => {
        if (!ignore) setDrilldownData(null);
      })
      .finally(() => {
        if (!ignore) setDrilldownLoading(false);
      });
    return () => { ignore = true; };
  }, [drilldownSelection, analysisMode, sourceA, sourceB]);

  const groups = dataByAxis.functionalPurpose?.groups || [];
  const groupOptions = groups.map(group => ({ value: group.id, label: group.label }));
  const aFunctionGroup = groupById(comparisonDataByAxis.functionalPurpose, sourceA) || groupById(dataByAxis.functionalPurpose, sourceA);
  const bFunctionGroup = groupById(comparisonDataByAxis.functionalPurpose, sourceB) || groupById(dataByAxis.functionalPurpose, sourceB);
  const aCurrent = groupById(comparisonDataByAxis[axis], sourceA) || groupById(dataByAxis[axis], sourceA);
  const bCurrent = groupById(comparisonDataByAxis[axis], sourceB) || groupById(dataByAxis[axis], sourceB);
  const diffRows = useMemo(() => buildDiffRows(sourceA, sourceB, comparisonDataByAxis), [sourceA, sourceB, comparisonDataByAxis]);
  const insights = useMemo(() => makeInsight(aFunctionGroup, bFunctionGroup, comparisonDataByAxis), [aFunctionGroup, bFunctionGroup, comparisonDataByAxis]);
  const selectedPurpose = PURPOSES.find(item => item.key === purpose) || PURPOSES[0];
  const comparisonMeta = comparisonDataByAxis.functionalPurpose;
  const modeHelper = analysisMode === 'balanced'
    ? `均衡样本：当前 A/B 两组自动抽取相同数量案例进行比较，每组 ${compactNumber(comparisonMeta?.balancedSampleSize || aFunctionGroup?.total || 0)} 条。`
    : '全库现状：按当前真实数量比较，适合看案例库目前收集结构。';

  const selectDrilldown = (nextAxis: AxisKey, label: string) => {
    setAxis(nextAxis);
    setDrilldownSelection({ axis: nextAxis, label });
  };

  useEffect(() => {
    if (sourceA === sourceB) {
      const fallback = groups.find(group => group.id !== sourceA);
      if (fallback) setSourceB(fallback.id);
    }
  }, [sourceA, sourceB, groups]);

  return (
    <div style={{ paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 22, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size['3xl'], fontWeight: 750, letterSpacing: 0 }}>
            案例库现状与对比
          </h1>
          <p style={{ margin: '8px 0 0', color: theme.colors.text.secondary, fontSize: theme.typography.size.base, lineHeight: 1.6 }}>
            用较少筛选看清当前案例库结构，并动态比较两个来源组在功能、媒介和技术维度上的差异。
          </p>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 18, padding: 12, borderRadius: 8, border: `1px solid ${theme.colors.redBorder}`, background: theme.colors.redBg, color: theme.colors.red }}>
          {error}
        </div>
      )}

      {loading ? (
        <Card padding={24}><div style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: 40 }}>加载案例库对比数据...</div></Card>
      ) : (
        <>
          <section style={{ marginBottom: 18 }}>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size['2xl'], fontWeight: 750 }}>
                全库来源组概览
              </h2>
              <p style={{ margin: '6px 0 0', color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm }}>
                这里先回答“目前案例库里收集了哪些来源组，以及每组主要是什么结构”。
              </p>
            </div>
            <SourceOverview dataByAxis={dataByAxis} />
          </section>

          <section style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size['2xl'], fontWeight: 750 }}>全库整体分布</h2>
                <p style={{ margin: '6px 0 0', color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm }}>
                  这不是 A/B 对比，而是把当前所有来源组汇总后看三轴结构。
                </p>
              </div>
              <SegmentedButton
                value={axis}
                onChange={setAxis}
                items={AXES.map(item => ({ key: item.key, label: item.label }))}
              />
            </div>
            <OverallDistribution
              axis={axis}
              data={dataByAxis[axis]}
              selectedLabel={drilldownSelection.axis === axis ? drilldownSelection.label : undefined}
              onSelect={selectDrilldown}
            />
          </section>

          <section style={{ marginBottom: 18 }}>
            <Card padding={16} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size['2xl'], fontWeight: 800 }}>
                    <span style={{ color: GROUP_COLORS[sourceA] || theme.colors.accent }}>{aFunctionGroup?.label || '-'}</span>
                    <span style={{ color: theme.colors.text.tertiary, fontWeight: 650 }}> vs </span>
                    <span style={{ color: GROUP_COLORS[sourceB] || theme.colors.orange }}>{bFunctionGroup?.label || '-'}</span>
                  </h2>
                  <p style={{ margin: '6px 0 0', color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
                    这里是两组对比工作区。选择对象、查看三轴差异、点击一级分类看细分，都在这一段完成。
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 700 }}>汇报目的视角</span>
                  <SegmentedButton
                    value={purpose}
                    onChange={setPurpose}
                    items={PURPOSES.map(item => ({ key: item.key, label: item.label }))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) auto', gap: 14, alignItems: 'end' }}>
                <SelectField label="对比对象 A" value={sourceA} options={groupOptions} onChange={setSourceA} />
                <SelectField label="对比对象 B" value={sourceB} options={groupOptions.filter(option => option.value !== sourceA)} onChange={setSourceB} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 700 }}>分析口径</span>
                  <SegmentedButton
                    value={analysisMode}
                    onChange={setAnalysisMode}
                    items={[
                      { key: 'live', label: '全库现状' },
                      { key: 'balanced', label: '均衡样本' },
                    ]}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10, color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
                <strong style={{ color: theme.colors.text.primary }}>当前口径：</strong>
                {comparisonLoading ? '正在更新对比数据...' : modeHelper}
                {analysisMode === 'balanced' && (
                  <span style={{ display: 'block', color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, marginTop: 2 }}>
                    N 由当前各来源组可用样本的最小值自动计算，不是固定数；顶部“全库”模块仍显示真实库存。
                  </span>
                )}
              </div>

              {purpose !== 'all' && (
                <div style={{ marginTop: 10, color: theme.colors.text.secondary, fontSize: theme.typography.size.sm }}>
                  当前解释视角：{selectedPurpose.helper}。这里不改变样本范围，只帮助你用对应目的阅读结果。
                </div>
              )}
            </Card>

            <UsageGuide aLabel={aFunctionGroup?.label || 'A'} bLabel={bFunctionGroup?.label || 'B'} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
              <AxisComparisonChart
                axis="functionalPurpose"
                a={groupById(comparisonDataByAxis.functionalPurpose, sourceA)}
                b={groupById(comparisonDataByAxis.functionalPurpose, sourceB)}
                selectedLabel={drilldownSelection.axis === 'functionalPurpose' ? drilldownSelection.label : undefined}
                onSelect={selectDrilldown}
              />
              <AxisComparisonChart
                axis="technicalMethod"
                a={groupById(comparisonDataByAxis.technicalMethod, sourceA)}
                b={groupById(comparisonDataByAxis.technicalMethod, sourceB)}
                selectedLabel={drilldownSelection.axis === 'technicalMethod' ? drilldownSelection.label : undefined}
                onSelect={selectDrilldown}
              />
              <AxisComparisonChart
                axis="distributionMedium"
                a={groupById(comparisonDataByAxis.distributionMedium, sourceA)}
                b={groupById(comparisonDataByAxis.distributionMedium, sourceB)}
                selectedLabel={drilldownSelection.axis === 'distributionMedium' ? drilldownSelection.label : undefined}
                onSelect={selectDrilldown}
              />
              <DrilldownFocusCard
                selection={drilldownSelection}
                data={drilldownData}
                loading={drilldownLoading}
                aId={sourceA}
                bId={sourceB}
              />
              <DifferenceChart rows={diffRows} aLabel={aFunctionGroup?.label || 'A'} bLabel={bFunctionGroup?.label || 'B'} />
            </div>
          </section>

          <section style={{ marginBottom: 18, display: 'grid', gridTemplateColumns: 'minmax(320px, 0.8fr) minmax(360px, 1.2fr)', gap: 18 }}>
            <InsightPanel insights={insights} />
            <SampleLinks a={aCurrent} b={bCurrent} axisData={comparisonDataByAxis[axis]} />
          </section>
        </>
      )}
    </div>
  );
}
