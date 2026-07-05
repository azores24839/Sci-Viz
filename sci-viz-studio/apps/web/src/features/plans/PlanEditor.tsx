import { useEffect, useMemo, useState } from 'react';
import { usePlan } from './usePlan';
import { useShotCards } from './useShotCards';
import { ShotCardEditor } from './ShotCardEditor';
import { VersionPanel } from './VersionPanel';
import { CaptureChecklist } from './CaptureChecklist';
import { ReviewLinkManager } from '../reviews/ReviewLinkManager';

interface PlanEditorProps {
  projectId: string;
}

const sectionDefs = [
  { key: 'executiveSummary' as const, label: '方案摘要' },
  { key: 'goals' as const, label: '拍摄目标' },
  { key: 'visualDiagnosis' as const, label: '视觉诊断' },
  { key: 'benchmarkSummary' as const, label: '对标总结' },
  { key: 'curationStrategy' as const, label: '策展策略' },
  { key: 'shootingApproach' as const, label: '拍摄方案' },
];

function saveStatusLabel(status: string) {
  const map: Record<string, string> = {
    idle: '',
    saving: '保存中…',
    saved: '已保存',
    error: '保存失败',
    conflict: '版本冲突',
  };
  return map[status] ?? '';
}

export function PlanEditor({ projectId }: PlanEditorProps) {
  const plan = usePlan(projectId);
  const shotCards = useShotCards(projectId);
  const [showVersions, setShowVersions] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showShotCards, setShowShotCards] = useState(true);
  const [showChecklist, setShowChecklist] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (plan.isDirty()) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  if (plan.loading) {
    return (
      <section className="plan-editor" aria-busy="true">
        <div className="benchmark-loading">
          <span className="projects-loading-spinner" aria-hidden="true" />
          <p>正在加载方案…</p>
        </div>
      </section>
    );
  }

  const safeCount = shotCards.cards.filter((c) => c.priority === 'MUST').length;

  return (
    <div className="plan-editor">
      <div className="plan-hierarchy" aria-label="摄影方案结构">
        <button type="button" className={!showShotCards && !showChecklist ? 'is-active' : ''} onClick={() => { setShowShotCards(false); setShowChecklist(false); }}><strong>摄影策略</strong><span>整体表达什么</span></button>
        <i aria-hidden="true">→</i>
        <button type="button" className={showShotCards ? 'is-active' : ''} onClick={() => { setShowShotCards(true); setShowChecklist(false); }}><strong>画面卡</strong><span>具体拍什么</span></button>
        <i aria-hidden="true">→</i>
        <button type="button" className={showChecklist ? 'is-active' : ''} onClick={() => { setShowShotCards(false); setShowChecklist(true); }}><strong>现场清单</strong><span>拍摄当天打勾</span></button>
      </div>
      <div className="plan-toolbar">
        <div className="plan-toolbar-left">
          <button
            type="button"
            className={`plan-tab-btn${showShotCards ? ' is-active' : ''}`}
            onClick={() => { setShowShotCards(true); setShowChecklist(false); }}
          >
            画面卡 {shotCards.cards.length > 0 && `(${shotCards.cards.length})`}
          </button>
          <button
            type="button"
            className={`plan-tab-btn${showChecklist ? ' is-active' : ''}`}
            onClick={() => { setShowShotCards(false); setShowChecklist(true); }}
          >
            拍摄清单
          </button>
          <button
            type="button"
            className={`plan-tab-btn${!showShotCards && !showChecklist ? ' is-active' : ''}`}
            onClick={() => { setShowShotCards(false); setShowChecklist(false); }}
          >
            方案文案
          </button>
        </div>
        <div className="plan-toolbar-right">
          <button
            type="button"
            className="plan-toolbar-btn"
            onClick={() => setShowVersions(true)}
          >
            版本历史
          </button>
          <button
            type="button"
            className="plan-toolbar-btn"
            onClick={() => setShowReviews(true)}
          >
            审核管理
          </button>
          <button
            type="button"
            className="plan-save-btn"
            onClick={() => void plan.save()}
            disabled={plan.saveStatus === 'saving'}
          >
            {plan.saveStatus === 'saving' ? '保存中…' : '立即保存'}
          </button>
          <span className={`plan-save-status status-${plan.saveStatus}`}>
            {saveStatusLabel(plan.saveStatus)}
          </span>
        </div>
      </div>

      {plan.errorMessage && (
        <div className="benchmark-save-error" role="alert" style={{ margin: '8px 0' }}>
          {plan.errorMessage}
        </div>
      )}

      {showShotCards ? (
        <ShotCardEditor
          cards={shotCards.cards}
          onCreate={shotCards.create}
          onUpdate={shotCards.update}
          onRemove={shotCards.remove}
          onDuplicate={shotCards.duplicate}
          onMoveUp={shotCards.moveUp}
          onMoveDown={shotCards.moveDown}
          error={shotCards.error}
          onClearError={() => shotCards.setError('')}
        />
      ) : showChecklist ? (
        <CaptureChecklist projectId={projectId} />
      ) : (
        <div className="plan-sections">
          {sectionDefs.map((section) => (
            <div className="plan-section" key={section.key}>
              <label className="plan-section-label">{section.label}</label>
              <textarea
                className="plan-section-textarea"
                value={plan.content[section.key]}
                onChange={(e) => {
                  plan.updateContent({ [section.key]: e.target.value });
                  plan.autoSave();
                }}
                placeholder={`输入${section.label}…`}
                rows={Math.max(3, (plan.content[section.key]?.split('\n').length ?? 3) + 1)}
              />
            </div>
          ))}
        </div>
      )}

      {safeCount > 0 && (
        <div className="plan-footer-info">
          必拍画面卡 {safeCount} 张
        </div>
      )}

      {showVersions && (
        <VersionPanel
          versions={plan.versions}
          currentVersion={plan.currentVersion}
          onRestore={(v) => { void plan.restoreVersion(v); }}
          onClose={() => setShowVersions(false)}
        />
      )}

      {showReviews && (
        <ReviewDialog projectId={projectId} onClose={() => setShowReviews(false)} />
      )}
    </div>
  );
}

function ReviewDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  return (
    <div className="version-panel-overlay" role="dialog" aria-label="审核管理" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="version-panel">
        <div className="version-panel-head">
          <h2>审核管理</h2>
          <button type="button" className="feedback-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>
        <div className="version-panel-body">
          <ReviewLinkManager projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
