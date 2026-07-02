export interface MdCard {
  label: string;
  content: string;
}

export function cleanMarkdownText(text: string): string {
  return text
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .trim();
}

export function parseMdToCards(md: string): MdCard[] {
  const lines = md.split('\n');
  const cards: MdCard[] = [];
  let tableHeaders: string[] = [];
  let pendingContent = '';

  function flush() {
    const trimmed = cleanMarkdownText(pendingContent.trim());
    if (!trimmed) { pendingContent = ''; return; }
    const last = cards[cards.length - 1];
    if (last) {
      last.content += '\n' + trimmed;
    } else {
      cards.push({ label: '', content: trimmed });
    }
    pendingContent = '';
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }

    if (/^[-–—]{3,}$/.test(line)) continue;
    if (/^\|[\s\-:|]*\|$/.test(line)) {
      flush();
      continue;
    }

    const headingMatch = line.match(/^(?:#{1,6}\s*)?(\d+\.\s+)?(.+)$/);
    if (/^#{1,6}\s/.test(line) || /^\d+\.\s+\*\*.+\*\*$/.test(line)) {
      flush();
      const label = cleanMarkdownText(headingMatch?.[2] ?? line);
      if (label && !/^plan\s+[a-z]\s*·/i.test(label)) cards.push({ label, content: '' });
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)/);
    if (listMatch?.[1]) {
      flush();
      const text = cleanMarkdownText(listMatch[1]);
      const colonIdx = Math.max(text.indexOf('：'), text.indexOf(':'));
      if (colonIdx > 0 && colonIdx < 24) {
        cards.push({
          label: text.slice(0, colonIdx).trim(),
          content: text.slice(colonIdx + 1).trim(),
        });
      } else {
        cards.push({ label: '', content: text });
      }
      continue;
    }

    const tableRowMatch = line.match(/^\|(.+)\|$/);
    if (tableRowMatch?.[1]) {
      const cells = tableRowMatch[1].split('|').map((c) => c.trim());
      if (tableHeaders.length === 0) {
        tableHeaders = cells;
      } else {
        const label = cells[0] || '';
        const body = cells.slice(1).map((c, i) => {
          const prefix = tableHeaders[i + 1] ?? '';
          return prefix ? `${prefix}：${c}` : c;
        }).join(' · ');
        if (label && body) cards.push({ label, content: body });
      }
      continue;
    }

    const blockMatch = line.match(/^>\s*(.+)/);
    if (blockMatch?.[1]) {
      flush();
      cards.push({ label: '', content: cleanMarkdownText(blockMatch[1]) });
      continue;
    }

    pendingContent += (pendingContent ? '\n' : '') + cleanMarkdownText(line);
  }

  flush();

  if (cards.length === 0) return [{ label: '', content: md.trim() }];
  return cards;
}
