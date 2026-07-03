import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { ReviewLink, ReviewResponse } from '@studio/contracts';

interface StoredReviewLink extends ReviewLink {
  token?: string;
  reviewUrl?: string;
}

interface ReviewAuditEntry {
  id: string; reviewLinkId: string; projectId: string;
  action: 'CREATED' | 'ACCESSED' | 'SUBMITTED' | 'REVOKED';
  createdAt: string;
}

interface ReviewLinkManagerProps {
  projectId: string;
}

export function ReviewLinkManager({ projectId }: ReviewLinkManagerProps) {
  const [links, setLinks] = useState<StoredReviewLink[]>([]);
  const [responses, setResponses] = useState<ReviewResponse[]>([]);
  const [audit, setAudit] = useState<ReviewAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState(72);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [showResponses, setShowResponses] = useState(false);

  const load = useCallback(async () => {
    try {
      const [linksRes, respRes] = await Promise.all([
        apiFetch(`/projects/${projectId}/review-links`),
        apiFetch(`/projects/${projectId}/review-responses`),
      ]);
      const linksPayload = await linksRes.json() as { success: boolean; data: StoredReviewLink[] };
      const respPayload = await respRes.json() as { success: boolean; data: { responses: ReviewResponse[]; audit: ReviewAuditEntry[] } };
      if (linksPayload.success) setLinks(linksPayload.data);
      if (respPayload.success) { setResponses(respPayload.data.responses); setAudit(respPayload.data.audit); }
    } catch {
      setError('加载审核信息失败。');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const createLink = async () => {
    setCreating(true);
    setError('');
    try {
      const response = await apiFetch(`/projects/${projectId}/review-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), expiresInHours: hours }),
      });
      const payload = await response.json() as { success: boolean; data: StoredReviewLink; error?: { message: string } };
      if (payload.success && payload.data) {
        setLinks((prev) => [payload.data, ...prev]);
        setLabel('');
      } else {
        setError(payload.error?.message ?? '创建失败');
      }
    } catch {
      setError('创建审核链接失败。');
    } finally {
      setCreating(false);
    }
  };

  const revokeLink = async (linkId: string) => {
    if (!window.confirm('确定撤销此审核链接吗？专家将无法再访问。')) return;
    try {
      const response = await apiFetch(`/projects/${projectId}/review-links/${linkId}`, { method: 'DELETE' });
      if (response.ok) {
        await load();
      }
    } catch {
      setError('撤销失败。');
    }
  };

  const copyLink = (url: string, linkId: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(linkId);
    setTimeout(() => setCopied(''), 2000);
  };

  const linkStatus = (link: StoredReviewLink): string => {
    if (link.revokedAt) return '已撤销';
    if (isExpired(link.expiresAt)) return '已过期';
    const submitted = responses.some((r) => r.reviewLinkId === link.id);
    if (submitted) return '已提交';
    return '有效';
  };

  const responsesForLink = (linkId: string) => responses.filter((r) => r.reviewLinkId === linkId);

  if (loading) {
    return <div className="benchmark-loading"><div className="review-spinner" /><p>加载审核信息…</p></div>;
  }

  return (
    <div className="review-manager">
      <div className="review-manager-create">
        <h3>创建审核链接</h3>
        <div className="review-create-form">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="审核人标签（如：张教授）"
            maxLength={120}
            className="review-create-input"
          />
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="review-create-select">
            <option value={24}>24 小时</option>
            <option value={72}>3 天</option>
            <option value={168}>7 天</option>
            <option value={720}>30 天</option>
          </select>
          <button type="button" className="project-btn-primary" onClick={() => void createLink()} disabled={creating}>
            {creating ? '创建中…' : '创建'}
          </button>
        </div>
        {error && <p className="review-manager-error">{error}</p>}
      </div>

      {links.length === 0 ? (
        <div className="benchmark-error"><p>还没有审核链接。</p></div>
      ) : (
        <div className="review-links-list">
          {links.map((link) => {
            const status = linkStatus(link);
            const linkResponses = responsesForLink(link.id);

            return (
              <div key={link.id} className={`review-link-card${link.revokedAt ? ' is-revoked' : ''}${isExpired(link.expiresAt) ? ' is-expired' : ''}`}>
                <div className="review-link-head">
                  <strong>{link.label || '未命名'}</strong>
                  <span className={`review-link-status status-${status === '有效' ? 'active' : status === '已提交' ? 'submitted' : 'inactive'}`}>
                    {status}
                  </span>
                </div>
                <div className="review-link-meta">
                  <span>创建：{formatTime(link.createdAt)}</span>
                  <span>过期：{formatTime(link.expiresAt)}</span>
                  {link.lastAccessedAt && <span>最近访问：{formatTime(link.lastAccessedAt)}</span>}
                </div>
                {link.reviewUrl && (
                  <div className="review-link-url">
                    <code>{link.reviewUrl}</code>
                    <button type="button" className="review-copy-btn" onClick={() => copyLink(link.reviewUrl!, link.id)}>
                      {copied === link.id ? '已复制' : '复制'}
                    </button>
                  </div>
                )}
                {!link.revokedAt && !isExpired(link.expiresAt) && (
                  <div className="review-link-actions">
                    <button type="button" className="review-action-danger" onClick={() => void revokeLink(link.id)}>撤销链接</button>
                    {linkResponses.length > 0 && (
                      <button type="button" className="review-action-btn" onClick={() => setShowResponses(!showResponses)}>
                        {showResponses ? '隐藏' : '查看'}审核意见 ({linkResponses.length})
                      </button>
                    )}
                  </div>
                )}
                {showResponses && linkResponses.map((resp) => (
                  <div key={resp.id} className="review-response-card">
                    <div className="review-response-head">
                      <strong>{resp.reviewerName}</strong>
                      {resp.reviewerEmail && <span>{resp.reviewerEmail}</span>}
                      <span className={`review-response-decision ${resp.overallDecision === 'CONFIRMED' ? 'decision-confirmed' : 'decision-changes'}`}>
                        {resp.overallDecision === 'CONFIRMED' ? '方案可以执行' : '方案需要修改'}
                      </span>
                    </div>
                    {resp.generalComment && <p className="review-response-comment">{resp.generalComment}</p>}
                    <time>{formatTime(resp.submittedAt)}</time>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}
