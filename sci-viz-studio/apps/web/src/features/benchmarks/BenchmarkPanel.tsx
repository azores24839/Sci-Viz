import { useEffect } from 'react';
import { useBenchmarkSelection } from './useBenchmarkSelection';
import { BenchmarkCard } from './BenchmarkCard';

interface BenchmarkPanelProps {
  projectId: string;
  minSelection?: number;
  onSelectionChange?: (count: number) => void;
}

export function BenchmarkPanel({ projectId, minSelection = 3, onSelectionChange }: BenchmarkPanelProps) {
  const { recommendations, selectedIds, fallbackMessage, loadState, errorMessage, retryable, saving, toggle, retry } =
    useBenchmarkSelection(projectId);

  useEffect(() => { onSelectionChange?.(selectedIds.length); }, [onSelectionChange, selectedIds.length]);

  if (loadState === 'loading') {
    return (
      <section className="benchmark-gallery" aria-label="对标案例" aria-busy="true">
        <div className="benchmark-gallery-header">
          <strong>正在加载对标案例…</strong>
          <span>从 Case Hub 获取推荐</span>
        </div>
        <div className="benchmark-loading">
          <span className="projects-loading-spinner" aria-hidden="true" />
          <p>正在匹配案例库…</p>
        </div>
      </section>
    );
  }

  if (loadState === 'unavailable') {
    return (
      <section className="benchmark-gallery" aria-label="对标案例">
        <div className="benchmark-gallery-header">
          <strong>案例库暂时不可用</strong>
          <span>项目内容已保留</span>
        </div>
        <div className="benchmark-error">
          <p>{errorMessage || 'Case Hub 暂时无法访问，你可以稍后重试。'}</p>
          <button type="button" className="project-btn-secondary" onClick={retry}>
            重试
          </button>
        </div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="benchmark-gallery" aria-label="对标案例">
        <div className="benchmark-gallery-header">
          <strong>加载失败</strong>
          <span>案例推荐未能加载</span>
        </div>
        <div className="benchmark-error">
          <p>{errorMessage || '网络请求失败，试试刷新。'}</p>
          {retryable && (
            <button type="button" className="project-btn-secondary" onClick={retry}>
              重试
            </button>
          )}
        </div>
      </section>
    );
  }

  if (recommendations.length === 0) {
    return (
      <section className="benchmark-gallery" aria-label="对标案例">
        <div className="benchmark-gallery-header">
          <strong>暂无推荐案例</strong>
          <span>当前条件未匹配到案例</span>
        </div>
        <div className="benchmark-error">
          <p>案例库中暂无与本项目方向匹配的案例。你可以提供更多研究信息后重新匹配。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="benchmark-gallery" aria-label="对标案例">
      <div className="benchmark-gallery-header">
        <strong>对标案例候选</strong>
        <span>已选 {selectedIds.length} / 需至少 {minSelection} 个</span>
      </div>

      {selectedIds.length < minSelection && (
        <div className="benchmark-hint">
          请至少选择 {minSelection} 个案例作为对标参考，才能进入下一步。
        </div>
      )}

      {fallbackMessage && (
        <div className="benchmark-fallback-msg">
          <span>降级匹配说明：</span>
          {fallbackMessage}
        </div>
      )}

      {errorMessage && (
        <div className="benchmark-save-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="benchmark-case-grid">
        {recommendations.map((rec) => (
          <BenchmarkCard
            key={rec.id}
            recommendation={rec}
            selected={selectedIds.includes(rec.id)}
            onToggle={() => toggle(rec.id)}
            saving={saving}
          />
        ))}
      </div>

      {selectedIds.length > 0 && (
        <div className="benchmark-selection-summary">
          <span>
            已选择 {selectedIds.length} 个对标案例
            {selectedIds.length < minSelection ? `（还需 ${minSelection - selectedIds.length} 个）` : '，可以进入下一步'}
          </span>
        </div>
      )}
    </section>
  );
}
