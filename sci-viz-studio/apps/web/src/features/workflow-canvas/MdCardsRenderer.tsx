import { useMemo } from 'react';
import { parseMdToCards } from './parseMarkdownToCards';

const chipLabels = new Set(['主目标', '次目标', '产物类型', '暂不可选', '主目的', '辅助目的', '目标受众', '输出形式', '限制条件', '约束', '待确认']);

function splitChips(content: string) {
  return content
    .split(/[、，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function MdCardsRenderer({ md, compact = false }: { md: string; compact?: boolean }) {
  const cards = useMemo(() => parseMdToCards(md).filter((card) => card.content), [md]);
  const maxCards = compact ? 3 : cards.length;

  return <div className={`md-cards${compact ? ' is-compact' : ''}`}>
    {cards.slice(0, maxCards).map((card, i) => {
      const useChips = card.label && chipLabels.has(card.label) && card.content;
      return <article className={`md-card${useChips ? ' as-chips' : ''}`} key={`${card.label}-${i}`}>
        {card.label ? <div className="md-card-titlebar">
          <span className="md-card-label">{card.label}</span>
          <button type="button" className="md-card-edit" aria-label={`编辑${card.label}`} title="编辑" />
        </div> : null}
        <div className="md-card-main">
          {useChips
            ? <div className="md-chip-row">{splitChips(card.content).map((chip) => <span className="md-chip" key={chip}>{chip}</span>)}</div>
            : card.content ? <p className="md-card-content">{card.content}</p> : null}
        </div>
      </article>;
    })}
  </div>;
}
