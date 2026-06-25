const markdownNoise = /^(\s*>|\s*#{1,6}\s*|\s*[-*]\s*|\s*\d+\.\s*)/;

export function summarizeNodeContent(body: string | undefined, fallback: string, maxLength = 210): string {
  const source = body?.trim() ? body : fallback;
  const text = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[-–—]{3,}$/.test(line))
    .map((line) => line
      .replace(markdownNoise, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .trim())
    .filter((line) => line && line !== '---')
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/[，。；、\s]+$/, '')}…`;
}

export function getNodePreviewTone(status: string): 'active' | 'done' | 'empty' | 'blocked' {
  if (status === 'RUNNING' || status === 'READY' || status === 'QUEUED') return 'active';
  if (status === 'COMPLETED' || status === 'AWAITING_HUMAN') return 'done';
  if (status === 'FAILED') return 'blocked';
  return 'empty';
}
