import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import type { VisualCase, ReviewStatus } from '../types';
import { REVIEW_STATUS_LABELS, MEDIA_TYPES, CONTENT_TYPES, DISCIPLINES, VISUAL_STYLES, RATING_LABELS } from '../types';
import { theme } from '../theme';
import { Card, StatusBadge } from '../components';

function normalizeContentTypeLabel(value: string): string {
  if (value === '科研人员') return '单人肖像';
  return value;
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [c, setCase] = useState<VisualCase | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<VisualCase>>({});
  const [saving, setSaving] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleImgError = () => {
    if (!c) return;
    const img = document.querySelector('.case-detail-img') as HTMLImageElement | null;
    if (!img) return;
    if (c.thumbnailPath && !img.src.endsWith(c.thumbnailPath.replace(/^\//, ''))) {
      img.src = c.thumbnailPath;
    } else if (c.imagePath && !img.src.endsWith(c.imagePath.replace(/^\//, ''))) {
      img.src = c.imagePath;
    } else if (c.imageUrl && img.src !== c.imageUrl) {
      img.src = c.imageUrl;
    } else {
      setImgError(true);
    }
  };

  const fetchCase = async () => {
    if (!id) return;
    const res = await api.getCase(id);
    if (res.success) setCase(res.data);
  };

  useEffect(() => { fetchCase(); }, [id]);

  if (!c) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: theme.colors.text.tertiary }}>
      加载中...
    </div>
  );

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    await api.updateCase(id, form);
    setSaving(false);
    setEditing(false);
    fetchCase();
  };

  const handleDelete = async () => {
    if (!id || !confirm('确定删除此案例？')) return;
    await api.deleteCase(id);
    navigate((location.state as { from?: string } | null)?.from || '/');
  };

  const handleReanalyze = async () => {
    if (!id) return;
    await api.reanalyze(id);
    alert('已重新加入分析队列');
  };

  const field = (label: string, key: keyof VisualCase, options?: readonly string[]) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: 'block',
        fontSize: theme.typography.size.xs,
        color: theme.colors.text.tertiary,
        fontWeight: 500,
        marginBottom: 2,
      }}>
        {label}
      </label>
      {editing && options ? (
        <select
          value={String(form[key] ?? c[key] ?? '')}
          onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={inputStyle}
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : editing ? (
        <input
          value={String(form[key] ?? c[key] ?? '')}
          onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={inputStyle}
        />
      ) : (
        <div style={{ fontSize: theme.typography.size.base, color: theme.colors.text.primary }}>
          {key === 'contentType'
            ? normalizeContentTypeLabel(String(c[key] ?? '-'))
            : String(c[key] ?? '-')}
        </div>
      )}
    </div>
  );

  const parseArray = (val: string) => {
    try { return JSON.parse(val); } catch { return val ? [val] : []; }
  };

  const btnBase: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    background: theme.colors.bgCard,
    color: theme.colors.text.secondary,
    fontSize: theme.typography.size.sm,
    fontWeight: 500,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.border}`,
    fontSize: theme.typography.size.sm,
    color: theme.colors.text.primary,
    background: theme.colors.bgCard,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const goBackToList = () => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) navigate(from);
    else navigate('/');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={goBackToList} style={btnBase}>
          ← 返回列表
        </button>
        <button onClick={() => setEditing(!editing)} style={btnBase}>
          {editing ? '取消编辑' : '编辑'}
        </button>
        {editing && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...btnBase,
              background: theme.colors.text.primary,
              color: theme.colors.bgCard,
              border: 'none',
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        )}
        <button onClick={handleDelete} style={{ ...btnBase, color: theme.colors.red, borderColor: theme.colors.redBorder }}>
          删除
        </button>
        <button onClick={handleReanalyze} style={btnBase}>
          重新分析
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {imgError ? (
              <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 13 }}>
                图片加载失败
              </div>
            ) : c.imagePath || c.thumbnailPath || c.imageUrl ? (
              <img
                className="case-detail-img"
                src={c.imagePath || c.thumbnailPath || c.imageUrl}
                alt={c.title}
                style={{ width: '100%', display: 'block' }}
                onError={handleImgError}
              />
            ) : (
              <div style={{ padding: 60, textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 13 }}>
                无图片
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <h3 style={{ fontSize: theme.typography.size.lg, fontWeight: 600, marginBottom: 12, color: theme.colors.text.primary }}>
              来源信息
            </h3>
            {field('原始标题', 'title')}
            {field('封面/案例标题', 'caseTitle')}
            {field('网页标题', 'pageTitle')}
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 500,
                marginBottom: 2,
              }}>
                来源链接
              </label>
              {c.sourceUrl ? (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: theme.typography.size.base, color: theme.colors.accent }}
                >
                  {c.sourceUrl}
                </a>
              ) : (
                <div style={{ fontSize: theme.typography.size.base, color: theme.colors.text.primary }}>-</div>
              )}
            </div>
            {field('来源域名', 'sourceDomain')}
            {field('采集方式', 'captureType')}
            {field('网页上下文', 'contextText')}
          </Card>

          <Card>
            <h3 style={{ fontSize: theme.typography.size.lg, fontWeight: 600, marginBottom: 12, color: theme.colors.text.primary }}>
              OCR 结果
            </h3>
            <pre style={{
              fontSize: theme.typography.size.xs,
              fontFamily: theme.typography.fontMono,
              whiteSpace: 'pre-wrap',
              background: theme.colors.bgSubtle,
              padding: 10,
              borderRadius: theme.radius.sm,
              border: `1px solid ${theme.colors.borderLight}`,
              color: theme.colors.text.secondary,
              lineHeight: 1.5,
              maxHeight: 200,
              overflow: 'auto',
            }}>
              {c.ocrText || '无 OCR 结果'}
            </pre>
          </Card>

          <Card>
            <h3 style={{ fontSize: theme.typography.size.lg, fontWeight: 600, marginBottom: 12, color: theme.colors.text.primary }}>
              AI 分类结果
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              {field('呈现方式', 'mediaType', MEDIA_TYPES)}
              {field('内容类型', 'contentType', CONTENT_TYPES)}
              {field('学科领域', 'discipline', DISCIPLINES)}
              {field('视觉风格', 'visualStyle', VISUAL_STYLES)}
              {field('构图', 'composition')}
              {field('色调', 'colorTone')}
            </div>
            {field('AI 总结', 'aiSummary')}
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 500,
                marginBottom: 2,
              }}>
                可借鉴点
              </label>
              <ul style={{ margin: 0, fontSize: theme.typography.size.base, paddingLeft: 20, color: theme.colors.text.primary }}>
                {parseArray(c.borrowablePoints).map((p: string, i: number) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 500,
                marginBottom: 2,
              }}>
                风险提示
              </label>
              <ul style={{ margin: 0, fontSize: theme.typography.size.base, paddingLeft: 20, color: theme.colors.red }}>
                {parseArray(c.riskNotes).map((p: string, i: number) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            {field('置信度', 'confidence')}
            {field('用途', 'useCase')}
          </Card>

          <Card>
            <h3 style={{ fontSize: theme.typography.size.lg, fontWeight: 600, marginBottom: 12, color: theme.colors.text.primary }}>
              人工确认
            </h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 500,
                marginBottom: 4,
              }}>
                处理状态
              </label>
              {editing ? (
                <select
                  value={form.reviewStatus ?? c.reviewStatus}
                  onChange={(e) => setForm(f => ({ ...f, reviewStatus: e.target.value as ReviewStatus }))}
                  style={inputStyle}
                >
                  {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              ) : (
                <StatusBadge status={c.reviewStatus as ReviewStatus} />
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: theme.typography.size.xs,
                color: theme.colors.text.tertiary,
                fontWeight: 500,
                marginBottom: 2,
              }}>
                评分
              </label>
              {editing ? (
                <select
                  value={String(form.rating ?? c.rating)}
                  onChange={(e) => setForm(f => ({ ...f, rating: parseInt(e.target.value) }))}
                  style={inputStyle}
                >
                  <option value="0">未评分</option>
                  {[1, 2, 3, 4, 5].map(r => (
                    <option key={r} value={r}>{r} - {RATING_LABELS[r]}</option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: theme.typography.size.base, color: theme.colors.text.primary }}>
                  {c.rating > 0 ? `${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)} ${RATING_LABELS[c.rating]}` : '未评分'}
                </div>
              )}
            </div>
            {field('人工备注', 'manualNotes')}
          </Card>
        </div>
      </div>
    </div>
  );
}
