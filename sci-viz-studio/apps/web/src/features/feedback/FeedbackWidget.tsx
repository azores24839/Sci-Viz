import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

const FEEDBACK_CATEGORIES = [
  { id: 'BUG', label: '遇到问题' },
  { id: 'SUGGESTION', label: '功能建议' },
  { id: 'INACCURATE', label: '结果不准' },
  { id: 'OTHER', label: '其他' },
] as const;

type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]['id'];

interface FeedbackContext {
  page: string;
  projectId?: string;
  nodeId?: string;
  nodeLabel?: string;
}

interface FeedbackWidgetProps {
  context: FeedbackContext;
  triggerLabel?: string;
  triggerClassName?: string;
}

function formatContext(context: FeedbackContext): string {
  const parts = [`页面：${context.page}`];
  if (context.projectId) parts.push(`项目：${context.projectId}`);
  if (context.nodeId) parts.push(`节点：${context.nodeId}`);
  if (context.nodeLabel) parts.push(`节点名称：${context.nodeLabel}`);
  return parts.join('\n');
}

export function FeedbackWidget({ context, triggerLabel, triggerClassName }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  const reset = useCallback(() => {
    setCategory(null);
    setDescription('');
    setError('');
    setSubmitted(false);
  }, []);

  const handleClose = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async () => {
    if (!category || !description.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await apiFetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim(),
          context: formatContext(context),
        }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: { message: string } };
        throw new Error(payload.error?.message ?? '提交失败');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? 'feedback-trigger'}
        onClick={() => { setOpen(true); reset(); }}
        aria-label="打开反馈"
        title="提交反馈"
      >
        {triggerLabel ?? <span aria-hidden="true">?</span>}
      </button>

      {open && (
        <div
          className="feedback-overlay"
          role="dialog"
          aria-label="提交反馈"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="feedback-modal">
            <div className="feedback-modal-head">
              <h2>提交反馈</h2>
              <button type="button" className="feedback-close" onClick={handleClose} aria-label="关闭">&times;</button>
            </div>

            {submitted ? (
              <div className="feedback-success">
                <span className="feedback-success-icon" aria-hidden="true">&#10003;</span>
                <strong>感谢你的反馈</strong>
                <p>我们会尽快查看并改进。</p>
                <button type="button" className="project-btn-secondary" onClick={handleClose}>
                  关闭
                </button>
              </div>
            ) : (
              <form className="feedback-form" onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}>
                <fieldset className="feedback-categories">
                  <legend>反馈类型</legend>
                  <div className="feedback-category-grid">
                    {FEEDBACK_CATEGORIES.map((cat) => (
                      <label
                        key={cat.id}
                        className={`feedback-category-chip${category === cat.id ? ' is-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="feedback-category"
                          value={cat.id}
                          checked={category === cat.id}
                          onChange={() => setCategory(cat.id)}
                          className="sr-only"
                        />
                        {cat.label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="project-field">
                  <span>详细描述</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="请描述你遇到的问题或建议…"
                    rows={4}
                    maxLength={2000}
                  />
                </label>

                {error && <p className="project-form-error" role="alert">{error}</p>}

                <div className="feedback-auto-context">
                  <span>提交时将自动附带以下信息：</span>
                  <pre>{formatContext(context)}</pre>
                </div>

                <div className="project-form-actions">
                  <button type="button" className="project-btn-secondary" onClick={handleClose}>
                    取消
                  </button>
                  <button
                    type="submit"
                    className="project-btn-primary"
                    disabled={!category || !description.trim() || submitting}
                  >
                    {submitting ? '提交中…' : '提交反馈'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
