import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Card } from '../components';
import { theme } from '../theme';
import type { ComparisonData, ComparisonGroup, ComparisonSample, EnterpriseCommercialSignals, Finding } from '../types';

const GROUP_COLORS: Record<string, string> = {
  sjtu: theme.colors.accent,
  domestic: theme.colors.green,
  international: '#4a7da8',
  enterprise: theme.colors.purple,
};

const GROUP_BG: Record<string, string> = {
  sjtu: theme.colors.accentBg,
  domestic: theme.colors.greenBg,
  international: '#e8f0f6',
  enterprise: theme.colors.purpleBg,
};

const COMPARISON_DIMENSIONS: { key: string; label: string }[] = [
  { key: 'mediaType', label: '呈现方式' },
  { key: 'contentType', label: '内容类型' },
  { key: 'visualStyle', label: '视觉风格' },
  { key: 'functionalPurpose', label: '功能用途' },
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

const CASE_FILTER_PARAM_BY_DIMENSION: Record<string, string> = {
  mediaType: 'media_type',
  contentType: 'content_type',
  visualStyle: 'visual_style',
};

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: '0 32px 0 12px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  color: theme.colors.text.primary,
  background: theme.colors.bgCard,
  fontSize: theme.typography.size.sm,
  fontWeight: 500,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236f6f7b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  cursor: 'pointer',
};

function domainToLabel(domain: string): string {
  if (!domain) return '';
  let d = domain.replace(/^https?:\/\//, '').split('/')[0];
  d = d.replace(/^(www|news|newsroom|developer|corporate|pr|images|research|new)\./, '');
  d = d.replace(/\.(com|org|net|edu|gov|io|cn|de|uk|jp|fr)(\.[a-z]{2})?$/, '');
  if (d.endsWith('.edu')) d = d.replace(/\.edu$/, '');
  return d.split(/[.-]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function InsightCards({ findings, dimLabel }: { findings: Finding[]; dimLabel: string }) {
  if (findings.length === 0) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
        <Card padding={14}>
          <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, margin: 0, textAlign: 'center', padding: '12px 0' }}>
            等待对比数据加载
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
      {findings.map((finding) => {
        const color = GROUP_COLORS[finding.groupId] || theme.colors.accent;
        const bg = GROUP_BG[finding.groupId] || theme.colors.accentBg;
        return (
          <div
            key={finding.groupId}
            style={{
              background: theme.colors.bgCard,
              borderRadius: theme.radius.xl,
              border: `1px solid ${theme.colors.border}`,
              boxShadow: theme.shadow.card,
              padding: 14,
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flex: '0 0 auto', marginTop: 3,
            }} />
            <div style={{ minWidth: 0 }}>
              <p style={{
                margin: '0 0 2px',
                color: theme.colors.text.primary,
                fontSize: theme.typography.size.xs,
                fontWeight: 600,
                lineHeight: 1.4,
              }}>
                {finding.groupLabel} 更偏向「{finding.topLabel}」
              </p>
              <p style={{
                margin: 0,
                color: theme.colors.text.secondary,
                fontSize: theme.typography.size.xs,
                lineHeight: 1.45,
              }}>
                {finding.summary}
              </p>
            </div>
          </div>
        );
      })}
      {findings.length < 3 && (
        <Card padding={14}>
          <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, margin: 0, textAlign: 'center', padding: '12px 0' }}>
            数据不足以生成更多发现
          </p>
        </Card>
      )}
    </div>
  );
}

function FilterToolbar({
  selectedSchool, setSelectedSchool,
  selectedDimension, setSelectedDimension,
  loading,
}: {
  selectedSchool: string;
  setSelectedSchool: (v: string) => void;
  selectedDimension: string;
  setSelectedDimension: (v: string) => void;
  loading: boolean;
}) {
  return (
    <div style={{
      background: theme.colors.bgCard,
      borderRadius: theme.radius.lg,
      border: `1px solid ${theme.colors.border}`,
      padding: '8px 14px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 600, whiteSpace: 'nowrap' }}>分析范围</span>
        <select value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} style={{ ...selectStyle, height: 32 }}>
          {SJTU_SCHOOLS.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, fontWeight: 600, whiteSpace: 'nowrap' }}>对比维度</span>
        <select value={selectedDimension} onChange={(e) => setSelectedDimension(e.target.value)} style={{ ...selectStyle, height: 32 }}>
          {COMPARISON_DIMENSIONS.map(d => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
      </label>
      <span style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>仅影响交大样本</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => { setSelectedSchool('all'); setSelectedDimension('mediaType'); }}
        style={{
          height: 28, padding: '0 12px',
          background: 'none', border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radius.md,
          color: theme.colors.text.secondary, fontSize: theme.typography.size.xs,
          fontWeight: 500, cursor: 'pointer',
        }}
      >
        重置
      </button>
      {loading && (
        <span style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>加载中...</span>
      )}
    </div>
  );
}

function SampleGrid({ samples, groupColor }: { samples: ComparisonSample[]; groupColor: string }) {
  const navigate = useNavigate();
  if (samples.length === 0) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
      {samples.slice(0, 4).map(sample => (
        <div key={sample.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a
            href={sample.sourceUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (sample.sourceUrl) {
                e.preventDefault();
                navigate(`/cases/${sample.id}`);
              }
            }}
            title={`${sample.title}\n${sample.sourceUrl}`}
            style={{
              display: 'block',
              height: 88,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              background: theme.colors.bgSubtle,
              border: `1px solid ${theme.colors.borderLight}`,
              position: 'relative',
              transition: 'border-color 0.15s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = groupColor; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.colors.borderLight; }}
          >
            {sample.thumbnail ? (
              <img
                src={sample.thumbnail}
                alt={sample.title}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: '100%',
                color: theme.colors.text.tertiary, fontSize: 10,
              }}>
                {sample.mediaType}
              </div>
            )}
          </a>
          <span
            title={sample.sourceDomain}
            style={{
              color: theme.colors.text.tertiary,
              fontSize: 10,
              fontWeight: 500,
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {domainToLabel(sample.sourceDomain)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ComparisonColumn({ group, color }: { group: ComparisonGroup; color: string }) {
  const navigate = useNavigate();
  const distSlice = group.distribution.slice(0, 5);
  const maxCount = Math.max(1, ...distSlice.map(d => d.count));

  if (group.total === 0) {
    return (
      <Card padding={16} style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
          <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.base, fontWeight: 650 }}>{group.label}</span>
          <span style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>待采集</span>
        </div>
        <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, textAlign: 'center', padding: '30px 0', margin: 0 }}>
          暂无数据
        </p>
      </Card>
    );
  }

  return (
    <Card padding={16} style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: '0 0 auto' }} />
        <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.base, fontWeight: 650 }}>{group.label}</span>
        <span style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>{group.total} 条案例</span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{ color: theme.colors.text.secondary, fontSize: 10, fontWeight: 600 }}>
          分布概览（Top 5）
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {distSlice.map(item => (
          <div
            key={item.label}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              padding: '2px 4px', borderRadius: theme.radius.sm, margin: '0 -4px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.colors.bgSubtle; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => {
              const search = new URLSearchParams();
              search.set('review_status', 'approved');
              if (group.sourceDomains.length > 0) {
                search.set('source_domain', group.sourceDomains.join(','));
              }
              navigate(`/cases?${search.toString()}`);
            }}
          >
            <span style={{
              width: 56, color: theme.colors.text.secondary, fontSize: theme.typography.size.xs,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 0 auto',
            }}>
              {item.label}
            </span>
            <div style={{ flex: 1, height: 6, background: theme.colors.bgSubtle, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.max(3, (item.count / maxCount) * 100)}%`,
                background: color,
                borderRadius: 999,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{
              width: 40, textAlign: 'right', color: theme.colors.text.primary,
              fontSize: theme.typography.size.xs, fontWeight: 600, flex: '0 0 auto',
            }}>
              {item.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
        {group.distribution.length > 5 && (
          <div style={{ color: theme.colors.text.tertiary, fontSize: 10, textAlign: 'center', paddingTop: 1 }}>
            +{group.distribution.length - 5} 个类别
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        <span style={{ color: theme.colors.text.secondary, fontSize: 10, fontWeight: 600 }}>
          代表案例
        </span>
        <SampleGrid samples={group.samples} groupColor={color} />
      </div>
    </Card>
  );
}

function EnterpriseAside({ group, signals }: { group: ComparisonGroup; signals?: EnterpriseCommercialSignals }) {
  const navigate = useNavigate();
  const topSignals = signals?.signals.filter(signal => signal.count > 0).slice(0, 4) || [];
  const sourceBreakdown = signals?.sourceBreakdown?.filter(item => item.count > 0).slice(0, 8) || [];
  const maxSourceCount = Math.max(1, ...sourceBreakdown.map(item => item.count));

  return (
    <aside style={{
      background: theme.colors.bgCard,
      borderRadius: theme.radius.xl,
      border: `1px solid ${theme.colors.border}`,
      boxShadow: theme.shadow.card,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      opacity: 0.92,
    }}>
      <div style={{ marginBottom: 10, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLORS.enterprise, flex: '0 0 auto' }} />
          <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.size.sm, fontWeight: 650 }}>
            商业化视觉参照
          </span>
        </div>
        <p style={{
          margin: '4px 0 0',
          color: theme.colors.text.tertiary,
          fontSize: 10,
          lineHeight: 1.4,
        }}>
          观察企业如何把技术成果转译为客户场景、产品方案和可部署价值。
        </p>
      </div>

      {group.total === 0 ? (
        <p style={{
          color: theme.colors.text.tertiary, fontSize: 10,
          textAlign: 'center', padding: '30px 0', margin: 0,
        }}>
          企业来源数据待采集
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {signals?.summary && (
            <div style={{
              borderRadius: theme.radius.md,
              background: GROUP_BG.enterprise,
              border: `1px solid ${theme.colors.borderLight}`,
              padding: '8px 10px',
            }}>
              <p style={{ margin: 0, color: theme.colors.text.secondary, fontSize: 10, lineHeight: 1.45 }}>
                {signals.summary}
              </p>
            </div>
          )}

          {topSignals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {topSignals.map(signal => (
                <div key={signal.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    color: theme.colors.text.secondary,
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    flex: '0 0 92px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {signal.label}
                  </span>
                  <div style={{ flex: 1, height: 5, background: theme.colors.bgSubtle, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(4, signal.percentage)}%`,
                      background: GROUP_COLORS.enterprise,
                      borderRadius: 999,
                    }} />
                  </div>
                  <span style={{ color: theme.colors.text.primary, fontSize: 10, fontWeight: 600, width: 34, textAlign: 'right' }}>
                    {signal.percentage.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {sourceBreakdown.length > 0 && (
            <div style={{
              borderTop: `1px solid ${theme.colors.borderLight}`,
              paddingTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}>
              <div style={{ color: theme.colors.text.secondary, fontSize: 10, fontWeight: 700 }}>
                企业样本覆盖
              </div>
              {sourceBreakdown.map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    const search = new URLSearchParams({ review_status: 'approved', source_name: item.label });
                    navigate(`/cases?${search.toString()}`);
                  }}
                  style={{
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    display: 'grid',
                    gridTemplateColumns: '98px minmax(0, 1fr) 28px',
                    gap: 6,
                    alignItems: 'center',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: theme.colors.text.secondary, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <span style={{ height: 5, background: theme.colors.bgSubtle, borderRadius: 999, overflow: 'hidden' }}>
                    <span style={{
                      display: 'block',
                      height: '100%',
                      width: `${Math.max(6, (item.count / maxSourceCount) * 100)}%`,
                      background: GROUP_COLORS.enterprise,
                      borderRadius: 999,
                    }} />
                  </span>
                  <span style={{ color: theme.colors.text.primary, fontSize: 10, fontWeight: 650, textAlign: 'right' }}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {group.samples.slice(0, 4).map(sample => (
            <a
              key={sample.id}
              href={sample.sourceUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (sample.sourceUrl) {
                  e.preventDefault();
                  navigate(`/cases/${sample.id}`);
                }
              }}
              style={{
                display: 'flex', flexDirection: 'column',
                borderRadius: theme.radius.md,
                border: `1px solid ${theme.colors.borderLight}`,
                overflow: 'hidden',
                textDecoration: 'none',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = GROUP_COLORS.enterprise; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.colors.borderLight; }}
            >
              <div style={{ height: 72, background: theme.colors.bgSubtle, overflow: 'hidden' }}>
                {sample.thumbnail ? (
                  <img
                    src={sample.thumbnail}
                    alt={sample.title}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: '100%',
                    color: theme.colors.text.tertiary, fontSize: 10,
                  }}>
                    {domainToLabel(sample.sourceDomain)}
                  </div>
                )}
              </div>
              <div style={{ padding: '6px 8px' }}>
                <p style={{
                  margin: 0, color: theme.colors.text.primary, fontSize: 10,
                  fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {sample.title || sample.mediaType}
                </p>
                <p style={{
                  margin: '1px 0 0', color: theme.colors.text.tertiary, fontSize: 9,
                }}>
                  {domainToLabel(sample.sourceDomain)}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </aside>
  );
}

function EnterpriseShowcase({ group, signals }: { group: ComparisonGroup; signals?: EnterpriseCommercialSignals }) {
  const navigate = useNavigate();
  if (group.total === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
              头部企业产品呈现样本
            </h2>
            <p style={{ margin: '4px 0 0', color: theme.colors.text.secondary, fontSize: theme.typography.size.xs, lineHeight: 1.5 }}>
              展开查看企业如何把产品、技术、场景和购买理由转译成视觉叙事。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const search = new URLSearchParams({ review_status: 'approved', source_domain: group.sourceDomains.join(',') });
              navigate(`/cases?${search.toString()}`);
            }}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: theme.radius.md,
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.bgCard,
              color: theme.colors.text.secondary,
              fontSize: theme.typography.size.xs,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            查看全部 {group.total} 条
          </button>
        </div>

        {signals?.sourceBreakdown && signals.sourceBreakdown.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {signals.sourceBreakdown.slice(0, 10).map(item => (
              <span key={item.label} style={{
                border: `1px solid ${theme.colors.borderLight}`,
                background: GROUP_BG.enterprise,
                color: theme.colors.text.secondary,
                borderRadius: 999,
                padding: '4px 9px',
                fontSize: 10,
                fontWeight: 650,
              }}>
                {item.label} · {item.count}
              </span>
            ))}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
        }}>
          {group.samples.slice(0, 8).map(sample => (
            <button
              key={sample.id}
              type="button"
              onClick={() => navigate(`/cases/${sample.id}`)}
              style={{
                border: `1px solid ${theme.colors.borderLight}`,
                borderRadius: theme.radius.lg,
                background: theme.colors.bgCard,
                overflow: 'hidden',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ height: 120, background: theme.colors.bgSubtle, overflow: 'hidden' }}>
                {sample.thumbnail ? (
                  <img
                    src={sample.thumbnail}
                    alt={sample.title}
                    loading="lazy"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.colors.text.tertiary, fontSize: 10 }}>
                    {domainToLabel(sample.sourceDomain)}
                  </div>
                )}
              </div>
              <div style={{ padding: '8px 9px' }}>
                <div style={{
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.size.xs,
                  fontWeight: 650,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {sample.title || sample.mediaType}
                </div>
                <div style={{ color: theme.colors.text.tertiary, fontSize: 10, marginTop: 2 }}>
                  {domainToLabel(sample.sourceDomain)} · {sample.mediaType}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CrossTable({ data }: { data: { rows: string[]; columns: string[]; matrix: { row: string; cells: { col: string; count: number }[] }[] } }) {
  if (data.rows.length === 0) return null;

  const allCounts = data.matrix.flatMap(r => r.cells.map(c => c.count));
  const globalMax = Math.max(1, ...allCounts);

  return (
    <div style={{ marginTop: 14 }}>
      <Card padding={16}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.size.xl, fontWeight: 650 }}>
              技术手段 × 内容对象交叉分析
            </h2>
            <p style={{ margin: '4px 0 0', color: theme.colors.text.secondary, fontSize: theme.typography.size.xs }}>
              观察不同视觉技术更常服务于哪些科研内容对象。颜色越深表示案例数量越多。
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{
            width: '100%', minWidth: 480, borderCollapse: 'separate', borderSpacing: 0,
            fontSize: theme.typography.size.xs,
          }}>
            <thead>
              <tr>
                <th style={{
                  padding: '7px 10px', color: theme.colors.text.secondary, fontSize: 10,
                  fontWeight: 700, borderBottom: `1px solid ${theme.colors.border}`, textAlign: 'left', whiteSpace: 'nowrap',
                }}>
                  技术手段
                </th>
                {data.columns.map(col => (
                  <th key={col} style={{
                    padding: '7px 10px', color: theme.colors.text.secondary, fontSize: 10,
                    fontWeight: 700, borderBottom: `1px solid ${theme.colors.border}`, textAlign: 'center', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.map(row => (
                <tr key={row.row}>
                  <td style={{
                    padding: '7px 10px', borderBottom: `1px solid ${theme.colors.borderLight}`,
                    color: theme.colors.text.primary, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 10,
                  }}>
                    {row.row}
                  </td>
                  {row.cells.map(cell => {
                    const intensity = cell.count > 0 ? Math.min(1, cell.count / globalMax) : 0;
                    return (
                      <td
                        key={cell.col}
                        title={cell.count > 0 ? `${row.row} × ${cell.col}: ${cell.count} 条案例` : undefined}
                        style={{
                          padding: '7px 6px',
                          borderBottom: `1px solid ${theme.colors.borderLight}`,
                          textAlign: 'center',
                          background: intensity > 0 ? `rgba(74, 125, 168, ${0.05 + intensity * 0.35})` : undefined,
                          color: intensity > 0.4 ? '#fff' : (cell.count > 0 ? theme.colors.text.primary : theme.colors.text.tertiary),
                          fontWeight: cell.count > 0 ? 600 : 400,
                          fontSize: 10,
                          transition: 'background 0.15s',
                        }}
                      >
                        {cell.count > 0 ? cell.count : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
          <span style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>少</span>
          <div style={{
            width: 100, height: 8, borderRadius: 999,
            background: `linear-gradient(to right, rgba(74,125,168,0.05), rgba(74,125,168,0.4))`,
          }} />
          <span style={{ color: theme.colors.text.tertiary, fontSize: 10 }}>多</span>
        </div>
      </Card>
    </div>
  );
}

export default function ComparisonPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ComparisonData | null>(null);
  const [selectedSchool, setSelectedSchool] = useState('all');
  const [selectedDimension, setSelectedDimension] = useState('mediaType');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedSchool) return;
    let ignore = false;
    setLoading(true);
    setError('');
    api.getComparison(selectedSchool === 'all' ? undefined : selectedSchool, selectedDimension)
      .then(res => {
        if (ignore) return;
        if (res.success) setData(res.data);
        else setError(res.error || '加载对比数据失败');
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message || '加载对比数据失败');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => { ignore = true; };
  }, [selectedSchool, selectedDimension]);

  const coreGroups = data?.groups.filter(g => g.id !== 'enterprise') || [];
  const enterpriseGroup = data?.groups.find(g => g.id === 'enterprise');

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: '8px 32px 28px' }}>
      {error && (
        <div style={{
          background: theme.colors.redBg, border: `1px solid ${theme.colors.redBorder}`,
          color: theme.colors.red, borderRadius: theme.radius.md, padding: 12, marginBottom: 18,
          fontSize: theme.typography.size.xs,
        }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <h1 style={{
          fontSize: theme.typography.size['5xl'],
          fontWeight: 700,
          color: theme.colors.text.primary,
          letterSpacing: '-0.03em',
          margin: '0 0 4px',
        }}>
          科研视觉案例对比分析
        </h1>
        <p style={{
          margin: 0,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.size.sm,
          lineHeight: 1.5,
          maxWidth: 640,
        }}>
          对比上海交大、国内顶尖高校、国际研究与头部企业在视觉呈现、内容对象与商业化表达上的特征差异。
        </p>
      </div>

      {!loading && data && (
        <InsightCards
          findings={data.findings || []}
          dimLabel={data.dimensionLabel}
        />
      )}

      {loading && !data && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12,
          }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                background: theme.colors.bgCard, borderRadius: theme.radius.xl,
                border: `1px solid ${theme.colors.border}`, padding: 14, minHeight: 70,
              }}>
                <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, textAlign: 'center', padding: '16px 0' }}>
                  加载中...
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilterToolbar
        selectedSchool={selectedSchool}
        setSelectedSchool={setSelectedSchool}
        selectedDimension={selectedDimension}
        setSelectedDimension={setSelectedDimension}
        loading={loading}
      />

      {loading && !data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          {[1, 2, 3].map(i => (
            <Card key={i} padding={16} style={{ minHeight: 240 }}>
              <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.xs, textAlign: 'center', padding: '80px 0' }}>
                加载中...
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && data && coreGroups.length > 0 && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `minmax(0, 1fr) ${enterpriseGroup ? '340px' : ''}`,
            gap: 16,
            alignItems: 'stretch',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
              {coreGroups.map(group => (
                <ComparisonColumn
                  key={group.id}
                  group={group}
                  color={GROUP_COLORS[group.id] || theme.colors.accent}
                />
              ))}
            </div>
            {enterpriseGroup && <EnterpriseAside group={enterpriseGroup} signals={data.enterpriseCommercialSignals} />}
          </div>
          {enterpriseGroup && <EnterpriseShowcase group={enterpriseGroup} signals={data.enterpriseCommercialSignals} />}
        </>
      )}

      {!loading && data && coreGroups.every(g => g.total === 0) && (
        <Card padding={16}>
          <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm, textAlign: 'center', padding: '30px 0', margin: 0 }}>
            该学科暂无数据，请选择其他院系
          </p>
        </Card>
      )}

      {!loading && data?.subtypeCross && (
        <CrossTable data={data.subtypeCross} />
      )}
    </div>
  );
}
