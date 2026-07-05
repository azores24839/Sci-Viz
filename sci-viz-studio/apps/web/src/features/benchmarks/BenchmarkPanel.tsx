import { useEffect } from 'react';
import { useBenchmarkSelection } from './useBenchmarkSelection';
import { BenchmarkCard } from './BenchmarkCard';

interface BenchmarkPanelProps { projectId: string; onSelectionChange?: (count: number) => void }

export function BenchmarkPanel({ projectId, onSelectionChange }: BenchmarkPanelProps) {
  const { recommendations, fallbackMessage, loadState, errorMessage, retryable, retry } =
    useBenchmarkSelection(projectId);

  useEffect(() => { onSelectionChange?.(recommendations.length); }, [onSelectionChange, recommendations.length]);

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
        <strong>AI 推荐参考案例</strong>
        <span>系统已按项目目标和匹配度自动排序，无需手动选择</span>
      </div>

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
            selected
            onToggle={() => {}}
            saving={false}
            readOnly
          />
        ))}
      </div>
    </section>
  );
}
