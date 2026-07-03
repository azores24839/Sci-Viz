import type { PlanVersion } from '@studio/contracts';

interface VersionPanelProps {
  versions: PlanVersion[];
  currentVersion: number;
  onRestore: (version: number) => void;
  onClose: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const createdByLabel: Record<string, string> = {
  USER: '你',
  AGENT: 'AI',
  SYSTEM: '系统',
};

export function VersionPanel({ versions, currentVersion, onRestore, onClose }: VersionPanelProps) {
  return (
    <div className="version-panel-overlay" role="dialog" aria-label="版本历史" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="version-panel">
        <div className="version-panel-head">
          <h2>版本历史</h2>
          <button type="button" className="feedback-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>
        <div className="version-panel-body">
          {versions.length === 0 ? (
            <p className="version-empty">暂无历史版本。</p>
          ) : (
            <div className="version-timeline">
              {versions.map((v) => {
                const isCurrent = v.version === currentVersion;
                return (
                  <div key={v.id} className={`version-item${isCurrent ? ' is-current' : ''}`}>
                    <div className="version-marker">
                      <span className="version-dot" aria-hidden="true" />
                      {isCurrent && <span className="version-current-label">当前</span>}
                    </div>
                    <div className="version-content">
                      <div className="version-head">
                        <strong>v{v.version}</strong>
                        <span>{createdByLabel[v.createdBy] ?? v.createdBy}</span>
                        <time>{formatTime(v.createdAt)}</time>
                      </div>
                      {v.changeSummary && (
                        <p className="version-change">{v.changeSummary}</p>
                      )}
                      <div className="version-preview">
                        <p className="version-preview-text">
                          {v.content.executiveSummary || v.content.shootingApproach || '（无摘要）'}
                        </p>
                      </div>
                      {!isCurrent && (
                        <button
                          type="button"
                          className="version-restore-btn"
                          onClick={() => {
                            if (window.confirm(`确定恢复到 v${v.version} 吗？当前版本会被保留在历史中。`)) {
                              onRestore(v.version);
                              onClose();
                            }
                          }}
                        >
                          恢复此版本
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
