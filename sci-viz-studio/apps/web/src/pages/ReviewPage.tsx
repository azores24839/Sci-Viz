import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicReviewSnapshot } from '@studio/contracts';
import { apiFetch } from '../api/client';

type PageState = 'loading' | 'invalid' | 'expired' | 'revoked' | 'submitted' | 'not_ready' | 'ready' | 'error';

export function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [snapshot, setSnapshot] = useState<PublicReviewSnapshot | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [overallDecision, setOverallDecision] = useState<'CONFIRMED' | 'CHANGES_REQUESTED' | null>(null);
  const [generalComment, setGeneralComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => { mountedRef.current = false; };
  }, [token]);

  const load = useCallback(async () => {
    if (!token) { setPageState('invalid'); return; }
    setPageState('loading');
    try {
      const response = await apiFetch(`/review/${token}`);
      if (!mountedRef.current) return;

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { code: string } };
        const code = payload?.error?.code;
        if (response.status === 404 || code === 'REVIEW_LINK_INVALID') {
          setPageState('invalid');
          return;
        }
        if (response.status === 410) {
          if (code === 'REVIEW_LINK_EXPIRED') { setPageState('expired'); return; }
          if (code === 'REVIEW_LINK_REVOKED') { setPageState('revoked'); return; }
        }
        setPageState('error');
        return;
      }
      const payload = await response.json() as { success: boolean; data: PublicReviewSnapshot };
      if (!payload.success || !payload.data) { setPageState('error'); return; }
      const snap = payload.data;
      setSnapshot(snap);

      if (snap.submitted) { setPageState('submitted'); return; }
      if (!snap.readiness.executable) { setPageState('not_ready'); return; }
      setPageState('ready');
    } catch {
      if (mountedRef.current) setPageState('error');
    }
  }, [token]);

  const handleSubmit = async () => {
    if (!reviewerName.trim() || !overallDecision) return;
    if (overallDecision === 'CHANGES_REQUESTED' && !generalComment.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await apiFetch(`/review/${token}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerName: reviewerName.trim(),
          ...(reviewerEmail.trim() ? { reviewerEmail: reviewerEmail.trim() } : {}),
          overallDecision,
          items: [],
          generalComment: generalComment.trim(),
        }),
      });
      if (!mountedRef.current) return;
      if (response.status === 409) {
        setPageState('submitted');
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { code: string; message: string } };
        const code = payload?.error?.code;
        if (response.status === 410) {
          if (code === 'REVIEW_LINK_EXPIRED') { setPageState('expired'); return; }
          if (code === 'REVIEW_LINK_REVOKED') { setPageState('revoked'); return; }
        }
        if (response.status === 404 || code === 'REVIEW_LINK_INVALID') {
          setPageState('invalid');
          return;
        }
        setSubmitError(payload.error?.message ?? '提交失败，请稍后重试。');
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      if (mountedRef.current) {
        setSubmitError('网络请求失败，请重试。');
        setSubmitting(false);
      }
    }
  };

  if (pageState === 'loading') {
    return <ReviewShell><div className="review-message"><div className="review-spinner" /><p>正在加载方案…</p></div></ReviewShell>;
  }

  if (pageState === 'invalid') {
    return <ReviewShell><div className="review-message review-message-error"><strong>链接无效</strong><p>审核链接不正确或已被删除。</p></div></ReviewShell>;
  }

  if (pageState === 'expired') {
    return <ReviewShell><div className="review-message review-message-error"><strong>链接已过期</strong><p>该审核链接已超过有效期限，请联系项目负责人获取新链接。</p></div></ReviewShell>;
  }

  if (pageState === 'revoked') {
    return <ReviewShell><div className="review-message review-message-error"><strong>链接已撤销</strong><p>该审核链接已被项目负责人撤销。</p></div></ReviewShell>;
  }

  if (pageState === 'submitted' || submitted) {
    return <ReviewShell><div className="review-message review-message-success"><strong>审核已提交</strong><p>感谢你的审核意见，项目负责人会查看你的反馈。</p></div></ReviewShell>;
  }

  if (pageState === 'error') {
    return <ReviewShell>
      <div className="review-message review-message-error">
        <strong>加载失败</strong>
        <p>无法加载方案内容，请检查网络后重试。</p>
        <button type="button" className="project-btn-secondary" onClick={() => void load()}>重试</button>
      </div>
    </ReviewShell>;
  }

  if (!snapshot) return <ReviewShell><div className="review-message"><p>数据加载中…</p></div></ReviewShell>;

  const plan = snapshot.plan;
  const proj = snapshot.project;
  const needsChanges = overallDecision === 'CHANGES_REQUESTED' && !generalComment.trim();

  return (
    <ReviewShell>
      <div className="review-page">
        <header className="review-header">
          <h1>{proj.name}</h1>
          <div className="review-header-meta">
            {proj.teamType && <span>{proj.teamType}</span>}
            {proj.researchDirection && <span>{proj.researchDirection}</span>}
            {proj.primaryAudience && <span>受众：{proj.primaryAudience}</span>}
          </div>
        </header>

        {pageState === 'not_ready' && (
          <div className="review-not-ready">
            <strong>方案尚未满足可执行条件</strong>
            {snapshot.readiness.reasons.length > 0 && (
              <ul>
                {snapshot.readiness.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            <p>你仍然可以预览以下内容。</p>
          </div>
        )}

        <section className="review-section">
          <h2>方案摘要</h2>
          <p className="review-text">{plan.executiveSummary || '暂无'}</p>
        </section>

        <section className="review-section">
          <h2>拍摄目标</h2>
          <p className="review-text">{plan.goals || '暂无'}</p>
        </section>

        <section className="review-section">
          <h2>视觉诊断</h2>
          <p className="review-text">{plan.visualDiagnosis || '暂无'}</p>
        </section>

        <section className="review-section">
          <h2>对标总结</h2>
          <p className="review-text">{plan.benchmarkSummary || '暂无'}</p>
        </section>

        <section className="review-section">
          <h2>策展策略</h2>
          <p className="review-text">{plan.curationStrategy || '暂无'}</p>
        </section>

        <section className="review-section">
          <h2>拍摄方法</h2>
          <p className="review-text">{plan.shootingApproach || '暂无'}</p>
        </section>

        {snapshot.risks.length > 0 && (
          <section className="review-section">
            <h2>风险信息</h2>
            <div className="review-risks">
              {snapshot.risks.map((risk, i) => (
                <div key={i} className={`review-risk-item risk-${risk.severity.toLowerCase()}`}>
                  <span className="review-risk-severity">{risk.severity === 'BLOCKER' ? '阻断' : risk.severity === 'WARNING' ? '警告' : '提示'}</span>
                  <span>{risk.description}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {snapshot.shotCards.length > 0 && (
          <section className="review-section">
            <h2>画面卡（{snapshot.shotCards.length} 张）</h2>
            <div className="review-shot-cards">
              {snapshot.shotCards.map((card) => (
                <div key={card.id} className="review-shot-card">
                  <div className="review-shot-card-head">
                    <span className={`review-shot-priority priority-${card.priority}`}>
                      {card.priority === 'MUST' ? '必拍' : card.priority === 'SHOULD' ? '建议' : '可选'}
                    </span>
                    <strong>{card.title}</strong>
                  </div>
                  <div className="review-shot-card-meta">
                    <span>{card.shotSize}</span>
                    <span>{card.cameraAngle}</span>
                    <span>{card.scene}</span>
                  </div>
                  <p className="review-shot-card-purpose">{card.purpose}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="review-section">
          <h2>可执行条件</h2>
          <div className={`review-readiness ${snapshot.readiness.executable ? 'is-ok' : 'is-not'}`}>
            <strong>{snapshot.readiness.executable ? '方案可以执行' : '尚未满足执行条件'}</strong>
            <span>必拍画面卡 {snapshot.readiness.mustShotCount} 张，待解决阻断项 {snapshot.readiness.unresolvedBlockerCount} 个</span>
          </div>
        </section>

        <div className="review-divider" />

        <section className="review-section">
          <h2>审核意见</h2>
          <label className="review-field">
            <span>审核人姓名 <em>*</em></span>
            <input type="text" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="请填写你的姓名" maxLength={120} />
          </label>
          <label className="review-field">
            <span>邮箱（选填）</span>
            <input type="email" value={reviewerEmail} onChange={(e) => setReviewerEmail(e.target.value)} placeholder="your@email.com" maxLength={320} />
          </label>
          <div className="review-decision">
            <span>整体意见</span>
            <div className="review-decision-options">
              <label className={`review-decision-option${overallDecision === 'CONFIRMED' ? ' is-selected-confirm' : ''}`}>
                <input type="radio" name="decision" value="CONFIRMED" checked={overallDecision === 'CONFIRMED'} onChange={() => setOverallDecision('CONFIRMED')} />
                <span>方案可以执行</span>
              </label>
              <label className={`review-decision-option${overallDecision === 'CHANGES_REQUESTED' ? ' is-selected-changes' : ''}`}>
                <input type="radio" name="decision" value="CHANGES_REQUESTED" checked={overallDecision === 'CHANGES_REQUESTED'} onChange={() => setOverallDecision('CHANGES_REQUESTED')} />
                <span>方案需要修改</span>
              </label>
            </div>
          </div>
          <label className="review-field">
            <span>建议说明{overallDecision === 'CHANGES_REQUESTED' ? ' *' : '（选填）'}</span>
            <textarea
              value={generalComment}
              onChange={(e) => setGeneralComment(e.target.value)}
              placeholder="请描述你的建议或修改意见…"
              rows={4}
              maxLength={5000}
            />
          </label>
          {needsChanges && <p className="review-field-hint">选择「需要修改」时，建议说明为必填。</p>}
          {submitError && <p className="review-submit-error" role="alert">{submitError}</p>}
          <button
            type="button"
            className="review-submit-btn"
            onClick={() => void handleSubmit()}
            disabled={submitting || !reviewerName.trim() || !overallDecision || (overallDecision === 'CHANGES_REQUESTED' && !generalComment.trim())}
          >
            {submitting ? '提交中…' : '提交审核意见'}
          </button>
          {overallDecision && (
            <p className="review-confirm-text">
              你将提交审核意见：「{overallDecision === 'CONFIRMED' ? '方案可以执行' : '方案需要修改'}」
            </p>
          )}
        </section>

        <div className="review-footer">
          <p className="review-expiry">链接有效期至 {new Date(snapshot.expiresAt).toLocaleString('zh-CN')}</p>
        </div>
      </div>
    </ReviewShell>
  );
}

function ReviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="review-shell">
      <main className="review-container">{children}</main>
    </div>
  );
}
