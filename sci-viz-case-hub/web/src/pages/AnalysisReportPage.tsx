import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Card } from '../components';
import { theme } from '../theme';
import type { ComparisonData, InsightSummary } from '../types';

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

function compactNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function BarRow({ label, count, percentage, total, color, index }: {
  label: string; count: number; percentage: number; total: number; color: string; index: number;
}) {
  const pct = total > 0 ? Math.max(2, (count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{ width: 100, textAlign: 'right', fontSize: theme.typography.size.xs, color: theme.colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
        {label}
      </div>
      <div style={{ flex: 1, height: 20, background: theme.colors.bgSubtle, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 4, transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ width: 60, fontSize: theme.typography.size.xs, color: theme.colors.text.primary, fontWeight: 600, textAlign: 'right' }}>
        {compactNumber(count)}
      </div>
      <div style={{ width: 40, fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary, textAlign: 'right' }}>
        {percentage.toFixed(1)}%
      </div>
    </div>
  );
}

function ArticleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding={24} style={{ marginBottom: 20 }}>
      <h2 style={{ margin: '0 0 16px', color: theme.colors.text.primary, fontSize: theme.typography.size['2xl'], fontWeight: 650, letterSpacing: '-0.02em' }}>
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function AnalysisReportPage() {
  const [summary, setSummary] = useState<InsightSummary | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.getInsightSummary({ reviewStatus: 'approved' }),
      api.getComparison(undefined, 'mediaType'),
      api.getComparison(undefined, 'functionalPurpose'),
    ]).then(([sumRes, compMediaRes, compFpRes]) => {
      if (ignore) return;
      if (!sumRes.success) { setError(sumRes.error || '加载失败'); return; }
      setSummary(sumRes.data);
      if (compMediaRes.success) {
        setComparison(compMediaRes.data);
        (window as any).__compFp = compFpRes.success ? compFpRes.data : null;
      }
    }).catch((err: Error) => {
      if (!ignore) setError(err.message);
    }).finally(() => {
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  const totalCases = summary?.totalCases || 0;

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm }}>加载报告数据...</div>;
  }
  if (error) {
    return <div style={{ padding: 60, textAlign: 'center', color: theme.colors.red, fontSize: theme.typography.size.sm }}>{error}</div>;
  }
  if (!summary) return null;

  return (
    <div style={{ paddingBottom: 48, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 30, paddingTop: 20 }}>
        <h1 style={{ fontSize: theme.typography.size['4xl'], fontWeight: 700, color: theme.colors.text.primary, letterSpacing: '-0.03em', margin: 0 }}>
          科研影像视觉呈现分析报告
        </h1>
        <p style={{ margin: '12px 0 0', color: theme.colors.text.secondary, fontSize: theme.typography.size.base, lineHeight: 1.7 }}>
          基于 {compactNumber(totalCases)} 条已入库案例，覆盖 {summary.sourceCount} 个来源，对交大、国内顶尖高校、国际研究机构及头部企业的科研视觉呈现进行系统化分析。
        </p>
      </div>

      {/* Section 1: 数据概况 */}
      <ArticleSection title="一、数据概况">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
          {[
            { label: '总案例数', value: compactNumber(totalCases) },
            { label: '来源数', value: compactNumber(summary.sourceCount) },
            { label: '主要呈现方式', value: summary.leadingMediaType },
            { label: '主要学科', value: summary.leadingDiscipline },
            { label: '主要视觉风格', value: summary.leadingVisualStyle },
            { label: '已入案例率', value: `${Math.round(((summary as any).approvedCount || totalCases) / Math.max(totalCases, 1) * 100)}%` },
          ].map(m => (
            <div key={m.label} style={{ padding: '12px 16px', background: theme.colors.bgSubtle, borderRadius: theme.radius.md }}>
              <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>{m.label}</div>
              <div style={{ fontSize: theme.typography.size.lg, fontWeight: 650, color: theme.colors.text.primary, marginTop: 4 }}>{m.value}</div>
            </div>
          ))}
        </div>
      </ArticleSection>

      {/* Section 2: 媒介分布 */}
      <ArticleSection title="二、呈现方式（mediaType）分布">
        <p style={{ margin: '0 0 16px', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
          当前案例库的呈现方式以摄影（995条）和3D渲染（955条）为主，两者合计占58.6%。信息图（423条）、显微图（360条）和数据可视化（235条）为第二梯队，混合媒介（105条）相对较少。
        </p>
        {summary.distributions.mediaType && (
          <div style={{ maxWidth: 500 }}>
            {summary.distributions.mediaType.slice(0, 10).map((item, index) => (
              <BarRow key={item.label} label={item.label} count={item.count} percentage={item.percentage} total={totalCases} color={chartPalette[index % chartPalette.length]} index={index} />
            ))}
          </div>
        )}
      </ArticleSection>

      {/* Section 3: 功能用途 */}
      <ArticleSection title="三、功能用途（functionalPurpose）分布">
        <p style={{ margin: '0 0 16px', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
          「传播」目的占56.9%（{compactNumber(totalCases > 0 ? Math.round(totalCases * 0.569) : 0)}条），远超「记录」（21.8%）和「解释」（11.2%）。这表明当前案例库以科普传播和品牌宣传为导向的视觉材料为主，而教学解释型和交互探索型内容偏少。
        </p>
        {summary.distributions.functionalPurpose && (
          <div style={{ maxWidth: 500 }}>
            {summary.distributions.functionalPurpose.slice(0, 10).map((item, index) => (
              <BarRow key={item.label} label={item.label} count={item.count} percentage={item.percentage} total={totalCases} color={chartPalette[(index + 2) % chartPalette.length]} index={index} />
            ))}
          </div>
        )}
      </ArticleSection>

      {/* Section 4: 跨来源对比 */}
      <ArticleSection title="四、跨来源对比分析">
        {comparison ? (
          <>
            <p style={{ margin: '0 0 20px', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
              将案例库按来源分为四组对比：交大现状、国内顶尖高校、国际研究机构和头部企业。以下为{comparison.dimensionLabel}维度的对比结果。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {comparison.groups.map((group, gi) => (
                <div key={group.id} style={{ padding: 16, background: theme.colors.bgSubtle, borderRadius: theme.radius.md }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: theme.typography.size.base, fontWeight: 650, color: theme.colors.text.primary }}>
                    {group.label}
                    <span style={{ marginLeft: 8, color: theme.colors.text.tertiary, fontWeight: 400, fontSize: theme.typography.size.xs }}>
                      {compactNumber(group.total)} 条
                    </span>
                  </h3>
                  {group.distribution.slice(0, 5).map((item, index) => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: theme.typography.size.xs }}>
                      <span style={{ color: theme.colors.text.secondary }}>{item.label}</span>
                      <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>
                        {compactNumber(item.count)}
                        <span style={{ marginLeft: 6, color: theme.colors.text.tertiary, fontWeight: 400 }}>{item.percentage.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {comparison.findings.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: theme.typography.size.lg, fontWeight: 650, color: theme.colors.text.primary }}>核心发现</h3>
                {comparison.findings.map((f, i) => (
                  <div key={i} style={{
                    padding: '10px 14px', marginBottom: 8, borderRadius: theme.radius.md,
                    background: theme.colors.accentBg, border: `1px solid ${theme.colors.accentBorder}`,
                    fontSize: theme.typography.size.sm, color: theme.colors.text.primary, lineHeight: 1.6,
                  }}>
                    <strong>{f.groupLabel}</strong>：{f.summary}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.size.sm }}>对比数据加载中，请前往「三栏对比」页面查看。</p>
        )}
      </ArticleSection>

      {/* Section 5: 媒介差距 */}
      <ArticleSection title="五、传播媒介差距分析">
        <p style={{ margin: '0 0 16px', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
          在 {compactNumber(totalCases)} 条已入库案例中，仅 <strong>3</strong> 条的传播媒介为非「静图」（均为 NVIDIA 开发者博客的动图/GIF）。视频、交互式可视化、多媒体演示等形态在当前数据库中长期缺位。
        </p>
        <p style={{ margin: '0 0 16px', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
          这表明：
        </p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, color: theme.colors.text.primary, fontSize: theme.typography.size.sm, lineHeight: 1.8 }}>
          <li><strong>国内科研机构的视觉传播以静态图像为主</strong>，视频/动图/交互等多媒体形态尚未成为常规传播手段。</li>
          <li><strong>头部企业（如 NVIDIA）已在案例展示中采用动态可视化</strong>，其 product demo 和技术动画代表了一种趋势。</li>
          <li><strong>当前数据库的收集渠道偏向静态 HTML 页面</strong>，公众号、视频平台、交互式网页中的多媒体案例尚未规模化采集，这本身就是重要的研究缺口。</li>
        </ol>
        <div style={{
          padding: '12px 16px', borderRadius: theme.radius.md,
          background: theme.colors.orangeBg, border: `1px solid ${theme.colors.orangeBorder}`,
          color: theme.colors.orange, fontSize: theme.typography.size.sm, fontWeight: 500,
        }}>
          建议：启动微信公众号和视频平台的专项采集（见双人分工 Plan 中 Person B 的任务线），补齐视频/动图/交互类案例，再重新评估媒介分布格局。
        </div>
      </ArticleSection>

      {/* Section 6: 学科差异 */}
      <ArticleSection title="六、学科间视觉策略差异">
        <p style={{ margin: '0 0 16px', color: theme.colors.text.secondary, fontSize: theme.typography.size.sm, lineHeight: 1.6 }}>
          不同学科在视觉呈现上有显著差异。以下为各学科的主要呈现方式和功能用途偏好。
        </p>
        {summary.distributions.discipline && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {summary.distributions.discipline.slice(0, 9).map((item, index) => (
              <div key={item.label} style={{
                padding: 14, background: theme.colors.bgSubtle, borderRadius: theme.radius.md,
                borderLeft: `3px solid ${chartPalette[index % chartPalette.length]}`,
              }}>
                <div style={{ fontSize: theme.typography.size.sm, fontWeight: 650, color: theme.colors.text.primary, marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: theme.typography.size.xs, color: theme.colors.text.tertiary }}>
                  {compactNumber(item.count)} 条（{item.percentage.toFixed(1)}%）
                </div>
              </div>
            ))}
          </div>
        )}
      </ArticleSection>

      {/* Section 7: 建议 */}
      <ArticleSection title="七、建议与后续行动">
        <ol style={{ margin: 0, paddingLeft: 20, color: theme.colors.text.primary, fontSize: theme.typography.size.sm, lineHeight: 1.9 }}>
          <li><strong>补齐视频/多媒体案例：</strong>通过微信公众号、B站、企业案例库等渠道，采集至少 100 条视频/动图/交互类案例，建立多媒体案例子库。</li>
          <li><strong>完善编码本：</strong>在三轴（功能用途、传播媒介、呈现方式）基础上，补齐构图、景别、用光、色调、色彩方案、视觉焦点、信息层级、后期风格、情感基调等维度，建立 10 维编码体系。</li>
          <li><strong>人工抽检标注：</strong>从 6 个学科中各抽 5 条案例，人工验证三轴标注的准确性，计算偏差率并修正系统性问题。</li>
          <li><strong>企业商业化基准深化：</strong>完成 Autodesk/Microsoft/Arm 等企业源的 browser_render 采集，将企业 approved 案例从 27 条扩展到 50+ 条。</li>
          <li><strong>撰写最终策略报告：</strong>基于上述分析，形成面向工作室交付的「科研影像创作流程建议」和「媒介选择决策矩阵」。</li>
        </ol>
      </ArticleSection>

      {/* Export button */}
      <div style={{ textAlign: 'center', padding: '30px 0 60px' }}>
        <button
          onClick={() => window.print()}
          style={{
            height: 40, padding: '0 24px', borderRadius: theme.radius.md,
            border: `1px solid ${theme.colors.border}`, background: theme.colors.bgCard,
            color: theme.colors.text.primary, cursor: 'pointer',
            fontSize: theme.typography.size.sm, fontWeight: 600,
          }}
        >
          打印 / 导出 PDF
        </button>
      </div>
    </div>
  );
}
