import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Card } from '../components';
import { CATEGORY_LABELS, REVIEW_STATUS_LABELS, type CrawlSource, type InsightDistributionItem, type InsightFilters, type InsightSummary, type CrossMatrix, type DimensionOption, type ThreeAxisSpectrum, type SpectrumCell } from '../types';
import { theme } from '../theme';

const DEFAULT_FILTERS: InsightFilters = {
  sourceDomain: '',
  sourceName: '',
  mediaType: '',
  contentType: '',
  discipline: '',
  technicalMethod: '',
  composition: '',
  colorTone: '',
  functionalPurpose: '',
  distributionMedium: '',
  reviewStatus: 'approved',
};

const chartPalette = [
  theme.colors.accent,
  theme.colors.green,
  theme.colors.orange,
  theme.colors.purple,
  theme.colors.red,
  '#2f7d8c',
  '#7a6a3a',
  '#4f6f9f',
];

const SOURCE_PRESETS = [
  { label: '高校', categories: ['A', 'H'] },
  { label: '期刊', categories: ['D', 'J'] },
  { label: '企业', categories: ['ENT'] },
];

const RATING_LABELS: Record<string, string> = {
  '0': '未评分',
  '1': '1分',
  '2': '2分',
  '3': '3分',
  '4': '4分',
  '5': '5分',
};

const selectStyle: CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 30px 0 10px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  color: theme.colors.text.primary,
  background: theme.colors.bgCard,
  fontSize: theme.typography.size.sm,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236f6f7b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
};

function compactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function optionLabel(key: keyof InsightFilters, label: string): string {
  if (key === 'reviewStatus') {
    return REVIEW_STATUS_LABELS[label as keyof typeof REVIEW_STATUS_LABELS] || label;
  }
  return label;
}

function makeParams(filters: InsightFilters, extra?: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params[key] = value;
  });
  if (extra) Object.entries(extra).forEach(([key, value]) => { if (value) params[key] = value; });
  return params;
}

function sourceNamesFromValue(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function sourceButtonText(selectedNames: string[]): string {
  if (selectedNames.length === 0) return '全部来源';
  if (selectedNames.length === 1) return selectedNames[0];
  return `已选择 ${selectedNames.length} 个来源`;
}

function updateSelectedNames(current: string[], names: string[], selectAll: boolean): string[] {
  const next = new Set(current);
  names.forEach(name => {
    if (selectAll) next.add(name);
    else next.delete(name);
  });
  return [...next];
}

function FieldSelect({
  label,
  value,
  emptyLabel,
  options,
  filterKey,
  onChange,
}: {
  label: string;
  value: string;
  emptyLabel: string;
  options: InsightDistributionItem[];
  filterKey: keyof InsightFilters;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 600 }}>
        {label}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        <option value="">{emptyLabel}</option>
        {options.map(item => (
          <option key={item.label} value={item.label}>
            {optionLabel(filterKey, item.label)}（{compactNumber(item.count)}）
          </option>
        ))}
      </select>
    </label>
  );
}

function SourceMultiSelect({
  sources,
  selectedNames,
  open,
  onOpenChange,
  onSetSelected,
}: {
  sources: CrawlSource[];
  selectedNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetSelected: (names: string[]) => void;
}) {
  const selected = useMemo(() => new Set(selectedNames), [selectedNames]);
  const sourceGroups = useMemo(() => {
    const groups: Record<string, CrawlSource[]> = {};
    sources.forEach(source => {
      if (!source.name) return;
      if (!groups[source.category]) groups[source.category] = [];
      groups[source.category].push(source);
    });
    Object.values(groups).forEach(group => {
      group.sort((a, b) => (b.existingCases || 0) - (a.existingCases || 0) || a.name.localeCompare(b.name, 'zh-CN'));
    });
    return groups;
  }, [sources]);
  const categoryOrder = Object.keys(sourceGroups).sort();

  const toggleSource = (name: string) => {
    const next = selected.has(name)
      ? selectedNames.filter(item => item !== name)
      : [...selectedNames, name];
    onSetSelected(next);
  };

  const toggleGroup = (names: string[], selectAll: boolean) => {
    onSetSelected(updateSelectedNames(selectedNames, names, selectAll));
  };

  const applyPreset = (categories: string[]) => {
    const names = categories.flatMap(category => sourceGroups[category]?.map(source => source.name).filter(Boolean) || []);
    onSetSelected(updateSelectedNames(selectedNames, names, true));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 600 }}>
          来源
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {SOURCE_PRESETS.map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.categories)}
              style={{
                height: 24, padding: '0 9px', borderRadius: 999,
                border: `1px solid ${theme.colors.border}`, background: theme.colors.bgSubtle,
                color: theme.colors.text.secondary, cursor: 'pointer', fontSize: theme.typography.size.xs, fontWeight: 600,
              }}
            >
              选{preset.label}
            </button>
          ))}
          {selectedNames.length > 0 && (
            <button
              type="button"
              onClick={() => onSetSelected([])}
              style={{
                height: 24, padding: '0 9px', borderRadius: 999,
                border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
                color: theme.colors.text.tertiary, cursor: 'pointer', fontSize: theme.typography.size.xs, fontWeight: 600,
              }}
            >
              清空
            </button>
          )}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          style={{ ...selectStyle, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
          {sourceButtonText(selectedNames)}
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 120,
            width: 'min(420px, 92vw)', maxHeight: 420, overflowY: 'auto',
            background: theme.colors.bgCard, border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.radius.lg, boxShadow: theme.shadow.popover, padding: '8px 0',
          }}>
            {categoryOrder.map(category => {
              const groupSources = sourceGroups[category];
              const groupNames = groupSources.map(source => source.name).filter(Boolean);
              const allSelected = groupNames.length > 0 && groupNames.every(name => selected.has(name));
              const someSelected = groupNames.some(name => selected.has(name));
              const groupCaseCount = groupSources.reduce((sum, source) => sum + (source.existingCases || 0), 0);
              return (
                <div key={category}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', cursor: 'pointer',
                    color: theme.colors.text.primary, fontSize: theme.typography.size.sm, fontWeight: 700,
                  }}>
                    <input type="checkbox" checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                      onChange={() => toggleGroup(groupNames, !allSelected)}
                      style={{ margin: 0, accentColor: theme.colors.text.primary }}
                    />
                    <span>{CATEGORY_LABELS[category] || category}</span>
                    <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, fontWeight: 500 }}>
                      {groupSources.length} 个来源 · {compactNumber(groupCaseCount)} 条
                    </span>
                  </label>
                  {groupSources.map(source => {
                    const checked = selected.has(source.name);
                    return (
                      <label key={source.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                        padding: '4px 14px 4px 34px', cursor: 'pointer', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm,
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleSource(source.name)}
                            style={{ margin: 0, accentColor: theme.colors.text.primary, flex: '0 0 auto' }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.name}</span>
                        </span>
                        <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, flex: '0 0 auto' }}>
                          {compactNumber(source.existingCases || 0)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {selectedNames.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {selectedNames.slice(0, 5).map(name => (
            <span key={name} style={{
              maxWidth: 180, padding: '3px 8px', borderRadius: 999,
              background: theme.colors.accentBg, border: `1px solid ${theme.colors.accentBorder}`,
              color: theme.colors.text.secondary, fontSize: theme.typography.size.xs,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {name}
            </span>
          ))}
          {selectedNames.length > 5 && (
            <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, padding: '3px 0' }}>
              +{selectedNames.length - 5}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding={16} style={{ minHeight: 92 }}>
      <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 600, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ color: theme.colors.text.primary, fontSize: theme.typography.size['4xl'], fontWeight: 700, lineHeight: 1.1 }}>
        {value || '-'}
      </div>
      {hint && (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, marginTop: 8 }}>
          {hint}
        </div>
      )}
    </Card>
  );
}

function DistributionChart({
  title,
  data,
  emptyText,
  onBarClick,
}: {
  title: string;
  data: InsightDistributionItem[];
  emptyText: string;
  onBarClick?: (label: string) => void;
}) {
  const visible = data.slice(0, 8);
  const maxCount = Math.max(1, ...visible.map(item => item.count));

  return (
    <Card padding={18}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
          {title}
        </h2>
        <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs }}>
          Top {visible.length || 0}
        </span>
      </div>
      {visible.length === 0 ? (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, padding: '20px 0' }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((item, index) => (
            <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '92px minmax(120px, 1fr) 74px', gap: 10, alignItems: 'center', cursor: onBarClick ? 'pointer' : 'default' }}
              onClick={() => onBarClick?.(item.label)}
            >
              <div style={{
                color: theme.colors.text.secondary, fontSize: theme.typography.size.sm,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {item.label}
              </div>
              <div style={{ height: 10, background: theme.colors.bgSubtle, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(3, (item.count / maxCount) * 100)}%`,
                  background: chartPalette[index % chartPalette.length],
                  borderRadius: 999,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ textAlign: 'right', color: theme.colors.text.primary, fontSize: theme.typography.size.sm, fontWeight: 600 }}>
                {item.percentage.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CrossMatrixView({ matrix, onCellClick }: { matrix: CrossMatrix; onCellClick?: (rowVal: string, colVal: string) => void }) {
  const visibleRows = matrix.rows.slice(0, 15);

  return (
    <Card padding={18} style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
          {matrix.rowLabel} × {matrix.columnLabel} 交叉矩阵
        </h2>
        <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs }}>
          单元格为该行内部占比
        </span>
      </div>
      {matrix.columns.length === 0 || visibleRows.length === 0 ? (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, padding: '20px 0' }}>
          当前筛选下缺少可用于交叉统计的数据。
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 0, fontSize: theme.typography.size.sm }}>
            <thead>
              <tr>
                <th style={matrixHeaderStyle}>{matrix.rowLabel}</th>
                <th style={matrixHeaderStyle}>样本数</th>
                {matrix.columns.map(column => (
                  <th key={column} style={matrixHeaderStyle}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.rowLabel}>
                  <td style={{ ...matrixCellStyle, color: theme.colors.text.primary, fontWeight: 600 }}>{row.rowLabel}</td>
                  <td style={{ ...matrixCellStyle, color: theme.colors.text.secondary }}>{row.total}</td>
                  {row.cells.map(cell => {
                    const intensity = Math.min(1, cell.percentage / 70);
                    return (
                      <td key={cell.columnLabel} style={{
                        ...matrixCellStyle,
                        background: `rgba(91, 91, 215, ${0.06 + intensity * 0.26})`,
                        color: intensity > 0.55 ? theme.colors.text.primary : theme.colors.text.secondary,
                        fontWeight: cell.count > 0 ? 600 : 400,
                        cursor: cell.count > 0 ? 'pointer' : 'default',
                      }}
                        onClick={() => cell.count > 0 && onCellClick?.(row.rowLabel, cell.columnLabel)}
                      >
                        {cell.count > 0 ? `${cell.percentage.toFixed(1)}%` : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const matrixHeaderStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  color: theme.colors.text.secondary,
  fontSize: theme.typography.size.xs,
  fontWeight: 700,
  borderBottom: `1px solid ${theme.colors.border}`,
  whiteSpace: 'nowrap',
};

const matrixCellStyle: CSSProperties = {
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.colors.borderLight}`,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const DIMENSION_FILTER_MAP: Record<string, keyof InsightFilters> = {
  mediaType: 'mediaType',
  contentType: 'contentType',
  discipline: 'discipline',
  technicalMethod: 'technicalMethod',
  composition: 'composition',
  colorTone: 'colorTone',
  functionalPurpose: 'functionalPurpose',
  distributionMedium: 'distributionMedium',
};

function SpectrumView({
  spectrum,
  loading,
  specX, specY, specZ,
  specSliceZ,
  dimChoices,
  onSpecXChange, onSpecYChange, onSpecZChange, onSpecSliceZChange,
  onNavigate,
}: {
  spectrum: ThreeAxisSpectrum | null;
  loading: boolean;
  specX: string; specY: string; specZ: string; specSliceZ: string;
  dimChoices: { key: string; label: string }[];
  onSpecXChange: (v: string) => void;
  onSpecYChange: (v: string) => void;
  onSpecZChange: (v: string) => void;
  onSpecSliceZChange: (v: string) => void;
  onNavigate: (discipline: string, mediaType: string, fp: string) => void;
}) {
  const dimSelectStyle = { ...selectStyle, width: 130 };

  const filteredCells = useMemo(() => {
    if (!spectrum) return [];
    if (!specSliceZ) return spectrum.cells;
    return spectrum.cells.filter(c => c.z === specSliceZ);
  }, [spectrum, specSliceZ]);

  const xVals = useMemo(() => spectrum?.dimensions[0].values || [], [spectrum]);
  const yVals = useMemo(() => spectrum?.dimensions[1].values || [], [spectrum]);
  const zVals = useMemo(() => spectrum?.dimensions[2].values || [], [spectrum]);

  const xTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filteredCells) m.set(c.x, (m.get(c.x) || 0) + c.count);
    return m;
  }, [filteredCells]);

  const yTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filteredCells) m.set(c.y, (m.get(c.y) || 0) + c.count);
    return m;
  }, [filteredCells]);

  const cellMap = useMemo(() => {
    const m = new Map<string, SpectrumCell>();
    for (const c of filteredCells) m.set(`${c.x}||${c.y}`, c);
    return m;
  }, [filteredCells]);

  const maxCount = useMemo(() => {
    let max = 1;
    for (const c of filteredCells) if (c.count > max) max = c.count;
    return max;
  }, [filteredCells]);

  if (loading) {
    return <Card padding={24}><div style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: 40, fontSize: theme.typography.size.sm }}>加载三轴频谱数据...</div></Card>;
  }

  if (!spectrum) return null;

  const total = spectrum.total;
  const slicedTotal = specSliceZ ? filteredCells.reduce((s, c) => s + c.count, 0) : total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {spectrum.note && (
        <div style={{
          background: theme.colors.orangeBg, border: `1px solid ${theme.colors.orangeBorder}`,
          color: theme.colors.orange, borderRadius: theme.radius.md, padding: 12,
          fontSize: theme.typography.size.sm, fontWeight: 500, lineHeight: 1.6,
        }}>
          {spectrum.note}
        </div>
      )}

      <Card padding={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
            三轴频谱 · 交叉热力图
          </h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.typography.size.sm }}>
              <span style={{ color: theme.colors.text.secondary }}>X</span>
              <select value={specX} onChange={e => onSpecXChange(e.target.value)} style={dimSelectStyle}>
                {dimChoices.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <span style={{ color: theme.colors.text.tertiary }}>×</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.typography.size.sm }}>
              <span style={{ color: theme.colors.text.secondary }}>Y</span>
              <select value={specY} onChange={e => onSpecYChange(e.target.value)} style={dimSelectStyle}>
                {dimChoices.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <span style={{ color: theme.colors.text.tertiary }}>×</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.typography.size.sm }}>
              <span style={{ color: theme.colors.text.secondary }}>Z（切片）</span>
              <select value={specZ} onChange={e => onSpecZChange(e.target.value)} style={dimSelectStyle}>
                {dimChoices.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.sm }}>Z轴切片：</span>
          <button
            onClick={() => onSpecSliceZChange('')}
            style={{
              padding: '4px 12px', borderRadius: 999, fontSize: theme.typography.size.xs, fontWeight: specSliceZ === '' ? 650 : 500,
              border: `1px solid ${specSliceZ === '' ? theme.colors.text.primary : theme.colors.border}`,
              background: specSliceZ === '' ? theme.colors.text.primary : theme.colors.bgCard,
              color: specSliceZ === '' ? '#fff' : theme.colors.text.secondary,
              cursor: 'pointer',
            }}
          >
            全部（{total}）
          </button>
          {zVals.slice(0, 12).map(z => (
            <button
              key={z}
              onClick={() => onSpecSliceZChange(specSliceZ === z ? '' : z)}
              style={{
                padding: '4px 12px', borderRadius: 999, fontSize: theme.typography.size.xs, fontWeight: specSliceZ === z ? 650 : 500,
                border: `1px solid ${specSliceZ === z ? theme.colors.text.primary : theme.colors.border}`,
                background: specSliceZ === z ? theme.colors.text.primary : theme.colors.bgCard,
                color: specSliceZ === z ? '#fff' : theme.colors.text.secondary,
                cursor: 'pointer',
                maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {z}
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: theme.typography.size.xs, width: '100%', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px', borderBottom: `1px solid ${theme.colors.border}`, textAlign: 'left', color: theme.colors.text.secondary, fontWeight: 600 }}>
                  {spectrum.dimensions[0].label} \ {spectrum.dimensions[1].label}
                </th>
                {yVals.map(y => (
                  <th key={y} style={{ padding: '6px 10px', borderBottom: `1px solid ${theme.colors.border}`, textAlign: 'center', color: theme.colors.text.secondary, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {y}
                    <div style={{ fontSize: 10, fontWeight: 400, color: theme.colors.text.tertiary }}>
                      {compactNumber(yTotals.get(y) || 0)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xVals.map(x => (
                <tr key={x}>
                  <td style={{ padding: '6px 10px', borderBottom: `1px solid ${theme.colors.border}`, color: theme.colors.text.secondary, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {x}
                    <div style={{ fontSize: 10, fontWeight: 400, color: theme.colors.text.tertiary }}>
                      {compactNumber(xTotals.get(x) || 0)}
                    </div>
                  </td>
                  {yVals.map(y => {
                    const cell = cellMap.get(`${x}||${y}`);
                    const alpha = cell ? Math.max(0.08, cell.count / maxCount) : 0;
                    return (
                      <td
                        key={y}
                        onClick={() => cell && cell.count > 0 && onNavigate(
                          specZ === 'discipline' ? (specSliceZ || cell.z) : '',
                          specY === 'mediaType' ? y : (specX === 'mediaType' ? x : ''),
                          specZ === 'functionalPurpose' ? (specSliceZ || cell.z) : (specX === 'functionalPurpose' ? x : (specY === 'functionalPurpose' ? y : '')),
                        )}
                        style={{
                          padding: '6px 10px',
                          borderBottom: `1px solid ${theme.colors.border}`,
                          textAlign: 'center',
                          background: cell ? `rgba(0,120,212,${alpha.toFixed(2)})` : 'transparent',
                          color: cell && cell.count > 0 ? (alpha > 0.35 ? '#fff' : theme.colors.text.primary) : theme.colors.text.tertiary,
                          cursor: cell && cell.count > 0 ? 'pointer' : 'default',
                          fontWeight: cell && cell.count > 0 ? 600 : 400,
                          fontSize: theme.typography.size.xs,
                          minWidth: 70,
                          transition: 'background 0.15s',
                        }}
                      >
                        {cell ? (
                          <>
                            <div>{compactNumber(cell.count)}</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>{cell.percentage.toFixed(1)}%</div>
                          </>
                        ) : (
                          <div style={{ color: theme.colors.text.tertiary }}>-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
          <span>点击单元格查看对应案例</span>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'rgba(0,120,212,0.08)' }} />
          <span>少</span>
          <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: 'rgba(0,120,212,0.5)' }} />
          <span>多</span>
        </div>
      </Card>
    </div>
  );
}

export default function InsightsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<InsightFilters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [poolSources, setPoolSources] = useState<CrawlSource[]>([]);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rowDim, setRowDim] = useState('functionalPurpose');
  const [colDim, setColDim] = useState('technicalMethod');
  const [exported, setExported] = useState(false);
  const [viewMode, setViewMode] = useState<'overview' | 'spectrum'>('overview');
  const [spectrum, setSpectrum] = useState<ThreeAxisSpectrum | null>(null);
  const [spectrumLoading, setSpectrumLoading] = useState(false);
  const [specX, setSpecX] = useState('functionalPurpose');
  const [specY, setSpecY] = useState('technicalMethod');
  const [specZ, setSpecZ] = useState('distributionMedium');
  const [specSliceZ, setSpecSliceZ] = useState('');
  const sourceDropdownRef = useRef<HTMLDivElement>(null);

  const params = useMemo(() => {
    const p = makeParams(filters, { rowDimension: rowDim, colDimension: colDim });
    return p;
  }, [filters, rowDim, colDim]);
  const selectedSourceNames = useMemo(() => sourceNamesFromValue(filters.sourceName), [filters.sourceName]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    api.getInsightSummary(params)
      .then(res => {
        if (ignore) return;
        if (res.success) setSummary(res.data);
        else setError(res.error || '加载分析数据失败');
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message || '加载分析数据失败');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [params]);

  useEffect(() => {
    api.getPoolSources().then(res => {
      if (res.success) setPoolSources(res.data || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (viewMode !== 'spectrum') return;
    let ignore = false;
    setSpectrumLoading(true);
    api.getThreeAxisSpectrum(specX, specY, specZ)
      .then(res => {
        if (ignore) return;
        if (res.success) setSpectrum(res.data);
      })
      .finally(() => {
        if (!ignore) setSpectrumLoading(false);
      });
    return () => { ignore = true; };
  }, [viewMode, specX, specY, specZ]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target as Node)) {
        setSourceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setFilter = (key: keyof InsightFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const setSourceNames = (names: string[]) => {
    setFilters(prev => ({
      ...prev,
      sourceDomain: '',
      sourceName: [...new Set(names)].join(','),
    }));
  };

  const copyInsights = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.generatedInsights.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const exportMarkdown = async () => {
    if (!summary) return;
    const lines: string[] = [];
    lines.push(`# 数据分析报告`);
    lines.push('');
    lines.push(`案例总数：${summary.totalCases}`);
    lines.push(`来源数量：${summary.sourceCount}`);
    lines.push('');
    for (const dim of summary.allDimensions) {
      const dist = summary.distributions[dim.key];
      if (dist && dist.length > 0) {
        lines.push(`## ${dim.label}分布`);
        lines.push('');
        lines.push('| 类别 | 数量 | 占比 |');
        lines.push('|------|------|------|');
        for (const item of dist) {
          lines.push(`| ${item.label} | ${item.count} | ${item.percentage.toFixed(1)}% |`);
        }
        lines.push('');
      }
    }
    lines.push(`## ${summary.crossMatrix.rowLabel} × ${summary.crossMatrix.columnLabel} 交叉矩阵`);
    lines.push('');
    const header = `| ${summary.crossMatrix.rowLabel} | 样本数 | ${summary.crossMatrix.columns.join(' | ')} |`;
    lines.push(header);
    lines.push('|' + header.split('|').map(() => '------|').join(''));
    for (const row of summary.crossMatrix.rows) {
      const cells = row.cells.map(c => c.count > 0 ? `${c.percentage.toFixed(1)}%` : '-').join(' | ');
      lines.push(`| ${row.rowLabel} | ${row.total} | ${cells} |`);
    }
    lines.push('');
    lines.push(`## 评分分布`);
    lines.push('');
    for (const r of summary.ratingDistribution) {
      lines.push(`- ${r.label}：${r.count}（${r.percentage.toFixed(1)}%）`);
    }
    lines.push('');
    lines.push(`## 结论`);
    lines.push('');
    for (const insight of summary.generatedInsights) {
      lines.push(`- ${insight}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setExported(true);
      window.setTimeout(() => setExported(false), 1400);
    } catch {}
  };

  const navigateToCases = (filterKey: string, filterValue: string) => {
    const search = new URLSearchParams();
    search.set(filterKey, filterValue);
    search.set('review_status', 'approved');
    navigate(`/cases?${search.toString()}`);
  };

  const navigateToCrossCell = (rowVal: string, colVal: string) => {
    const search = new URLSearchParams();
    search.set('review_status', 'approved');
    const rowFilterKey = DIMENSION_FILTER_MAP[rowDim];
    const colFilterKey = DIMENSION_FILTER_MAP[colDim];
    if (rowFilterKey) search.set(rowFilterKey, rowVal);
    if (colFilterKey) search.set(colFilterKey, colVal);
    navigate(`/cases?${search.toString()}`);
  };

  const filterOptions = summary?.filterOptions;

  const DIM_CHOICES = [
    { key: 'functionalPurpose', label: '功能用途' },
    { key: 'distributionMedium', label: '传播媒介' },
    { key: 'technicalMethod', label: '技术手段' },
    { key: 'discipline', label: '学科' },
    { key: 'mediaType', label: '呈现方式' },
    { key: 'contentType', label: '内容类型' },
  ];

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '8px 18px',
    borderRadius: `${theme.radius.md}px ${theme.radius.md}px 0 0`,
    border: 'none',
    borderBottom: active ? `2px solid ${theme.colors.text.primary}` : '2px solid transparent',
    background: 'transparent',
    color: active ? theme.colors.text.primary : theme.colors.text.secondary,
    fontSize: theme.typography.size.sm,
    fontWeight: active ? 650 : 500,
    cursor: 'pointer',
  });

  return (
    <div style={{ paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 22 }}>
        <div>
          <h1 style={{
            fontSize: theme.typography.size['3xl'],
            fontWeight: 650,
            color: theme.colors.text.primary,
            letterSpacing: '-0.03em',
            margin: 0,
          }}>
            数据分析
          </h1>
          <p style={{ margin: '8px 0 0', color: theme.colors.text.secondary, fontSize: theme.typography.size.base }}>
            {viewMode === 'overview' ? '按来源、学科和视觉标签实时统计案例库，生成可放入 PPT 的趋势结论。' : '三轴交叉分析：探索功能用途 × 呈现方式 × 学科的分布格局。'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: -2 }}>
            <button onClick={() => setViewMode('overview')} style={tabStyle(viewMode === 'overview')}>数据总览</button>
            <button onClick={() => setViewMode('spectrum')} style={tabStyle(viewMode === 'spectrum')}>三轴频谱</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportMarkdown} disabled={!summary}
            style={{
              height: 34, padding: '0 14px', borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
              color: theme.colors.text.secondary, cursor: summary ? 'pointer' : 'not-allowed',
              fontSize: theme.typography.size.sm, fontWeight: 600,
            }}
          >
            {exported ? '已复制报告' : '导出报告'}
          </button>
          <button onClick={() => setFilters(DEFAULT_FILTERS)}
            style={{
              height: 34, padding: '0 14px', borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
              color: theme.colors.text.secondary, cursor: 'pointer',
              fontSize: theme.typography.size.sm, fontWeight: 600,
            }}
          >
            重置筛选
          </button>
        </div>
      </div>
      </div>

      {viewMode === 'overview' && (
      <>
      <Card padding={16} style={{ marginBottom: 18 }}>
        <div ref={sourceDropdownRef} style={{ marginBottom: 14 }}>
          <SourceMultiSelect
            sources={poolSources}
            selectedNames={selectedSourceNames}
            open={sourceDropdownOpen}
            onOpenChange={setSourceDropdownOpen}
            onSetSelected={setSourceNames}
          />
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 14,
          alignItems: 'end',
        }}>
          <FieldSelect label="学科" value={filters.discipline} emptyLabel="全部学科" filterKey="discipline"
            options={filterOptions?.discipline || []} onChange={(value) => setFilter('discipline', value)} />
          <FieldSelect label="功能用途" value={filters.functionalPurpose} emptyLabel="全部功能用途" filterKey="functionalPurpose"
            options={filterOptions?.functionalPurpose || []} onChange={(value) => setFilter('functionalPurpose', value)} />
          <FieldSelect label="传播媒介" value={filters.distributionMedium} emptyLabel="全部传播媒介" filterKey="distributionMedium"
            options={filterOptions?.distributionMedium || []} onChange={(value) => setFilter('distributionMedium', value)} />
          <FieldSelect label="技术手段" value={filters.technicalMethod} emptyLabel="全部技术手段" filterKey="technicalMethod"
            options={filterOptions?.technicalMethod || []} onChange={(value) => setFilter('technicalMethod', value)} />
          <FieldSelect label="内容类型" value={filters.contentType} emptyLabel="全部内容类型" filterKey="contentType"
            options={filterOptions?.contentType || []} onChange={(value) => setFilter('contentType', value)} />
          <FieldSelect label="呈现方式" value={filters.mediaType} emptyLabel="全部呈现方式" filterKey="mediaType"
            options={filterOptions?.mediaType || []} onChange={(value) => setFilter('mediaType', value)} />
          <FieldSelect label="构图" value={filters.composition} emptyLabel="全部构图" filterKey="composition"
            options={filterOptions?.composition || []} onChange={(value) => setFilter('composition', value)} />
          <FieldSelect label="色调" value={filters.colorTone} emptyLabel="全部色调" filterKey="colorTone"
            options={filterOptions?.colorTone || []} onChange={(value) => setFilter('colorTone', value)} />
          <FieldSelect label="复核状态" value={filters.reviewStatus} emptyLabel="全部状态" filterKey="reviewStatus"
            options={filterOptions?.reviewStatus || []} onChange={(value) => setFilter('reviewStatus', value)} />
        </div>
      </Card>

      {error && (
        <div style={{
          background: theme.colors.redBg, border: `1px solid ${theme.colors.redBorder}`,
          color: theme.colors.red, borderRadius: theme.radius.md, padding: 12, marginBottom: 18, fontSize: theme.typography.size.sm,
        }}>
          {error}
        </div>
      )}

      {summary?.totalCases !== undefined && summary.totalCases < 20 && (
        <div style={{
          background: theme.colors.orangeBg, border: `1px solid ${theme.colors.orangeBorder}`,
          color: theme.colors.orange, borderRadius: theme.radius.md, padding: 12, marginBottom: 18,
          fontSize: theme.typography.size.sm, fontWeight: 600,
        }}>
          当前筛选样本较少，结论仅供参考。
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 18 }}>
        <MetricCard label="案例总数" value={loading && !summary ? '...' : compactNumber(summary?.totalCases || 0)} hint="当前筛选结果" />
        <MetricCard label="来源数量" value={compactNumber(summary?.sourceCount || 0)} hint="当前样本覆盖来源" />
        <MetricCard label="主要呈现方式" value={summary?.leadingMediaType || '-'} />
        <MetricCard label="主要学科" value={summary?.leadingDiscipline || '-'} />
        <MetricCard label="主要技术手段" value={summary?.leadingTechnicalMethod || '-'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginBottom: 18 }}>
        {summary?.allDimensions.map(dim => {
          const dist = summary.distributions[dim.key];
          if (!dist || dist.length === 0) return null;
          const filterKey = DIMENSION_FILTER_MAP[dim.key];
          return (
            <DistributionChart
              key={dim.key}
              title={`${dim.label}占比`}
              data={dist}
              emptyText={`暂无${dim.label}数据。`}
              onBarClick={filterKey ? (label) => navigateToCases(filterKey, label) : undefined}
            />
          );
        })}
        {summary && (
          <DistributionChart
            title="评分分布"
            data={summary.ratingDistribution}
            emptyText="暂无评分数据。"
          />
        )}
      </div>

      {summary && (
        <>
          <Card padding={18} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
                交叉矩阵
              </h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.typography.size.sm }}>
                  <span style={{ color: theme.colors.text.secondary }}>行</span>
                  <select value={rowDim} onChange={(e) => setRowDim(e.target.value)} style={{ ...selectStyle, width: 130 }}>
                    {summary.allDimensions.map(dim => (
                      <option key={dim.key} value={dim.key}>{dim.label}</option>
                    ))}
                  </select>
                </label>
                <span style={{ color: theme.colors.text.tertiary }}>×</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.typography.size.sm }}>
                  <span style={{ color: theme.colors.text.secondary }}>列</span>
                  <select value={colDim} onChange={(e) => setColDim(e.target.value)} style={{ ...selectStyle, width: 130 }}>
                    {summary.allDimensions.map(dim => (
                      <option key={dim.key} value={dim.key}>{dim.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <CrossMatrixView matrix={summary.crossMatrix} onCellClick={navigateToCrossCell} />
          </Card>
        </>
      )}

      <Card padding={18}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
          <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
            PPT 初步结论
          </h2>
          <button
            onClick={copyInsights}
            disabled={!summary || summary.generatedInsights.length === 0}
            style={{
              height: 30, padding: '0 12px', borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
              color: theme.colors.text.secondary, cursor: summary ? 'pointer' : 'not-allowed',
              fontSize: theme.typography.size.xs, fontWeight: 600,
            }}
          >
            {copied ? '已复制' : '复制结论'}
          </button>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, color: theme.colors.text.primary, fontSize: theme.typography.size.base, lineHeight: 1.8 }}>
          {(summary?.generatedInsights || []).map(item => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        {!summary?.generatedInsights.length && (
          <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm }}>
            选择筛选条件后会自动生成 3-5 条基于当前样本库的结论。
          </div>
        )}
      </Card>
      </>
      )}

      {viewMode === 'spectrum' && (
        <SpectrumView
          spectrum={spectrum}
          loading={spectrumLoading}
          specX={specX}
          specY={specY}
          specZ={specZ}
          specSliceZ={specSliceZ}
          dimChoices={DIM_CHOICES}
          onSpecXChange={setSpecX}
          onSpecYChange={setSpecY}
          onSpecZChange={(v) => { setSpecZ(v); setSpecSliceZ(''); }}
          onSpecSliceZChange={setSpecSliceZ}
          onNavigate={(discipline, mediaType, fp) => {
            const search = new URLSearchParams();
            search.set('review_status', 'approved');
            if (discipline) search.set('discipline', discipline);
            if (mediaType) search.set('media_type', mediaType);
            if (fp) search.set('functional_purpose', fp);
            navigate(`/cases?${search.toString()}`);
          }}
        />
      )}
    </div>
  );
}
