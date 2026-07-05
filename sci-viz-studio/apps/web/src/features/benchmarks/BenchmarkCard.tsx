import { useState } from 'react';
import type { BenchmarkRecommendation } from '@studio/contracts';

const matchLevelLabel: Record<string, string> = {
  EXACT: '精确匹配',
  RELATED: '相关匹配',
  CROSS_DOMAIN: '跨领域参考',
};

const matchLevelClass: Record<string, string> = {
  EXACT: 'match-exact',
  RELATED: 'match-related',
  CROSS_DOMAIN: 'match-cross',
};

interface BenchmarkCardProps {
  recommendation: BenchmarkRecommendation;
  selected: boolean;
  onToggle: () => void;
  saving: boolean;
  readOnly?: boolean;
}

export function BenchmarkCard({ recommendation, selected, onToggle, saving, readOnly = false }: BenchmarkCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <article className={`benchmark-card${selected ? ' is-selected' : ''}`}>
      <div className="benchmark-card-media">
        {recommendation.thumbnailUrl && !imgError ? (
          <img
            src={recommendation.thumbnailUrl}
            alt={recommendation.title}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="benchmark-card-placeholder">
            <span aria-hidden="true">&#9632;</span>
            <span>{recommendation.title.slice(0, 8)}</span>
          </div>
        )}
        <div className="benchmark-card-overlay">
          <button
            type="button"
            className={`benchmark-select-btn${selected ? ' is-checked' : ''}`}
            onClick={readOnly ? undefined : onToggle}
            disabled={saving || readOnly}
            aria-pressed={selected}
          >
            {readOnly ? 'AI 推荐' : selected ? '已选' : '选择'}
          </button>
        </div>
      </div>

      <div className="benchmark-card-body">
        <div className="benchmark-card-head">
          <h4 className="benchmark-card-title">{recommendation.title}</h4>
          <span className={`benchmark-match-badge ${matchLevelClass[recommendation.matchLevel] ?? ''}`}>
            {matchLevelLabel[recommendation.matchLevel] ?? recommendation.matchLevel}
          </span>
        </div>

        <div className="benchmark-card-tags">
          <span className="benchmark-tag">{recommendation.functionalPurpose}</span>
          <span className="benchmark-tag">{recommendation.technicalMethod}</span>
          <span className="benchmark-tag">{recommendation.distributionMedium}</span>
        </div>

        <p className="benchmark-card-reason">{recommendation.recommendationReason}</p>

        {recommendation.borrowablePoints && (
          <p className="benchmark-card-borrow">
            <span>可借鉴：</span>
            {recommendation.borrowablePoints}
          </p>
        )}

        <div className="benchmark-card-source">
          <span>{recommendation.sourceDomain}</span>
          {recommendation.sourceUrl && (
            <a
              href={recommendation.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="benchmark-source-link"
              onClick={(e) => e.stopPropagation()}
            >
              查看来源 &rarr;
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
