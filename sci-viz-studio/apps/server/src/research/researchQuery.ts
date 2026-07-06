import type { SourceDocument } from '@studio/contracts';

export const TAVILY_QUERY_LIMIT = 380;
export const TAVILY_RETRY_QUERY_LIMIT = 300;

const boundaryCharacters = new Set([' ', '；', ';', '。', '.', '，', ',', '、', '：', ':', '\n', '\t']);

export function normalizeResearchText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/([；;，,。])\1+/g, '$1')
    .replace(/\s*([；;，,。])\s*/g, '$1')
    .trim();
}

function safeSlice(value: string, end: number) {
  let safeEnd = Math.max(0, Math.min(end, value.length));
  const previous = value.charCodeAt(safeEnd - 1);
  if (previous >= 0xD800 && previous <= 0xDBFF) safeEnd -= 1;
  return value.slice(0, safeEnd).trim();
}

export function truncateResearchQuery(value: string, maxLength = TAVILY_QUERY_LIMIT) {
  const normalized = normalizeResearchText(value);
  if (normalized.length <= maxLength) return normalized;

  const window = safeSlice(normalized, maxLength + 1);
  const minimumBoundary = Math.floor(maxLength * 0.65);
  let boundary = -1;
  for (let index = window.length - 1; index >= minimumBoundary; index -= 1) {
    if (boundaryCharacters.has(window[index] ?? '')) {
      boundary = index;
      break;
    }
  }

  const candidate = safeSlice(normalized, boundary > 0 ? boundary : maxLength);
  const partialUrl = [...normalized.matchAll(/https?:\/\/[^\s；;，,。]+/gi)].find((match) => {
    const start = match.index ?? 0;
    return start < candidate.length && start + match[0].length > candidate.length;
  });
  if (!partialUrl) return candidate;

  const urlStart = partialUrl.index ?? 0;
  const urlEnd = urlStart + partialUrl[0].length;
  if (urlEnd <= maxLength) return safeSlice(normalized, urlEnd);
  const beforeUrl = safeSlice(normalized, urlStart);
  if (beforeUrl) return beforeUrl;
  try {
    const parsed = new URL(partialUrl[0]);
    return safeSlice(parsed.origin, maxLength);
  } catch {
    return safeSlice(normalized, maxLength);
  }
}

function sourceFragment(source: SourceDocument) {
  const content = source.aiSummary || source.imageDescription || source.extractedText || source.ocrText || source.rawText || '';
  const title = normalizeResearchText(source.title);
  const summary = normalizeResearchText(content);
  if (!summary) return title;
  if (!title || summary.toLocaleLowerCase().includes(title.toLocaleLowerCase())) return summary;
  return `${title}：${summary}`;
}

function uniqueFragments(sources: SourceDocument[]) {
  const seen = new Set<string>();
  return sources.filter((source) => source.selected).slice(0, 8).flatMap((source) => {
    const fragment = sourceFragment(source);
    const key = fragment.toLocaleLowerCase();
    if (!fragment || seen.has(key)) return [];
    seen.add(key);
    return [fragment];
  });
}

export function buildResearchQuery(baseQuery: string, sources: SourceDocument[] = []) {
  const base = normalizeResearchText(baseQuery);
  const fragments = uniqueFragments(sources);
  if (fragments.length === 0) return truncateResearchQuery(base);

  const userPart = truncateResearchQuery(base, 200);
  const prefix = '；用户资料：';
  const available = Math.max(0, TAVILY_QUERY_LIMIT - userPart.length - prefix.length);
  const selected: string[] = [];
  let remaining = available;

  for (let index = 0; index < fragments.length && remaining > 0; index += 1) {
    const separatorLength = selected.length > 0 ? 1 : 0;
    const fairShare = Math.max(24, Math.floor((remaining - separatorLength) / (fragments.length - index)));
    const fragment = truncateResearchQuery(fragments[index] ?? '', fairShare);
    if (!fragment) continue;
    const cost = fragment.length + separatorLength;
    if (cost > remaining) continue;
    selected.push(fragment);
    remaining -= cost;
  }

  return truncateResearchQuery(selected.length > 0 ? `${userPart}${prefix}${selected.join('；')}` : userPart);
}
