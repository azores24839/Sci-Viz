import type { MdCard } from './parseMarkdownToCards';

const contextLabels = new Set([
  '项目', '当前版本', '当前节点', '输入类型', '资产数量', '资产类型', '资料概况', '素材总览', '本次分析范围',
]);

const groupRules = [
  { label: '诊断结论', matches: ['一句话结论', '诊断结论', '结论'] },
  { label: '资料完整度', matches: ['资料完整度'] },
  { label: '来源相关性', matches: ['来源相关性'] },
  { label: '已确认的信息', matches: ['已确认信息', '已确认的信息', '已知信息'] },
  { label: '目前无法判断', matches: ['关键缺口', '目前无法判断', '当前无法判断的信息', '资料缺口'] },
  { label: '信息风险与使用限制', matches: ['风险与待确认', '风险标记', '待确认事实与现场条件', '信息风险与使用限制'] },
  { label: '对后续节点的初步影响', matches: ['对后续节点的初步影响', '对后续拍摄策略的初步影响'] },
  { label: '资料补充入口', matches: ['资料补充入口'] },
] as const;

type DiagnosisSection = MdCard & { items?: string[] };

function stripEnding(text: string) {
  return text.trim().replace(/[.。；;]+$/, '');
}

function splitItems(content: string) {
  return content
    .split(/\n|；|;/)
    .map((item) => item.trim().replace(/^\d+\.\s*/, ''))
    .filter(Boolean);
}

function joinContent(items: MdCard[]) {
  return items.map((item) => stripEnding(item.content)).filter(Boolean).join('。');
}

export interface VisualDiagnosisContent {
  context: string;
  sections: Array<MdCard & { items?: string[] }>;
  basis: string;
}

export function organizeVisualDiagnosis(cards: MdCard[]): VisualDiagnosisContent {
  const contentCards = cards.filter((card) => card.content);
  const context = contentCards.filter((card) => contextLabels.has(card.label));
  const project = context.find((card) => card.label === '项目')?.content;
  const overview = context.find((card) => ['资料概况', '素材总览'].includes(card.label))?.content;
  const scope = context.find((card) => card.label === '本次分析范围')?.content;
  const count = context.find((card) => card.label === '资产数量')?.content;
  const type = context.find((card) => card.label === '资产类型')?.content
    ?? context.find((card) => card.label === '输入类型')?.content;
  const contextText = [project, scope ?? overview ?? count, type].filter(Boolean).map((item) => stripEnding(item!)).join(' · ');

  const used = new Set<MdCard>(context);
  const basisCards = contentCards.filter((card) => card.label === '分析依据');
  basisCards.forEach((card) => used.add(card));
  const sections: DiagnosisSection[] = groupRules.flatMap((rule) => {
    const matched = contentCards.filter((card) => rule.matches.some((label) => card.label.includes(label)));
    matched.forEach((card) => used.add(card));
    const content = joinContent(matched);
    return content ? [{ label: rule.label, content, items: splitItems(content) }] : [];
  });

  const remaining = contentCards.filter((card) => !used.has(card));
  if (remaining.length > 0) {
    const target = sections.find((section) => section.label === '已确认的信息');
    const extra = joinContent(remaining);
    if (target) target.content = `${target.content}。${extra}`;
    else sections.push({ label: '已确认的信息', content: extra, items: splitItems(extra) });
  }

  return {
    context: contextText || '本轮使用已选择的项目资料',
    sections: sections.slice(0, 6),
    basis: joinContent(basisCards),
  };
}
