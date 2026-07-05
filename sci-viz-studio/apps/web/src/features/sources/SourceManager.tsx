import { useEffect, useRef, useState } from 'react';
import type { SourceDocument } from '@studio/contracts';
import { apiFetch, notifyUsageChanged } from '../../api/client';
import { ResearchPanel } from './ResearchPanel';
const kindCopy: Record<SourceDocument['kind'], string> = { PDF: 'PDF', DOCX: 'Word', IMAGE: '图片', TEXT: '文字', WEB: '网页' };

function sourceLabel(source: SourceDocument) {
  if (!source.sourceUrl) return kindCopy[source.kind];
  try { return new URL(source.sourceUrl).hostname.replace(/^www\./, ''); }
  catch { return '网页'; }
}

async function readPayload<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? `请求失败（${response.status}）`);
}

export function SourceManager({ projectId, onSourcesChange }: { projectId: string; onSourcesChange: (sources: SourceDocument[]) => void }) {
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [mode, setMode] = useState<'files' | 'text' | 'web' | 'research'>('files');
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const payload = await readPayload<{ success: true; data: SourceDocument[] }>(await apiFetch(`/projects/${projectId}/sources`));
    setSources(payload.data); onSourcesChange(payload.data);
  };

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : '资料列表加载失败')); }, [projectId]);
  useEffect(() => {
    if (!sources.some((source) => ['UPLOADING', 'QUEUED', 'PARSING', 'SUMMARIZING'].includes(source.status))) return;
    const timer = window.setInterval(() => void load(), 1800);
    return () => window.clearInterval(timer);
  }, [sources]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const mimeType = file.type || (extension === 'pdf' ? 'application/pdf' : extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : extension === 'png' ? 'image/png' : 'image/jpeg');
        const init = await readPayload<{ success: true; data: { source: SourceDocument; storageMode: 'local' | 'oss'; uploadUrl?: string } }>(await apiFetch('/source-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, fileName: file.name, mimeType, sizeBytes: file.size }) }));
        if (init.data.storageMode === 'oss' && init.data.uploadUrl) {
          const uploaded = await fetch(init.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
          if (!uploaded.ok) throw new Error(`“${file.name}”上传到 OSS 失败。`);
          await readPayload(await apiFetch('/source-uploads/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId: init.data.source.id }) }));
        } else {
          const form = new FormData(); form.append('projectId', projectId); form.append('sourceId', init.data.source.id); form.append('file', file.type ? file : new File([file], file.name, { type: mimeType }));
          await readPayload(await apiFetch('/source-uploads/local', { method: 'POST', body: form }));
        }
      }
      await load(); notifyUsageChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '上传失败'); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const createText = async () => {
    if (!textBody.trim()) return;
    setBusy(true); setError('');
    try { await readPayload(await apiFetch('/sources/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, title: textTitle || undefined, text: textBody }) })); setTextTitle(''); setTextBody(''); await load(); notifyUsageChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '文字资料保存失败'); } finally { setBusy(false); }
  };

  const createWeb = async () => {
    if (!url.trim()) return;
    setBusy(true); setError('');
    try { await readPayload(await apiFetch('/sources/web', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, url }) })); setUrl(''); await load(); notifyUsageChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '网页资料添加失败'); } finally { setBusy(false); }
  };

  const toggle = async (source: SourceDocument) => {
    try { await readPayload(await apiFetch(`/sources/${source.id}/selection`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: !source.selected }) })); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '选择状态更新失败'); }
  };
  return <div className="source-manager">
    <div className="source-mode-tabs" role="tablist" aria-label="添加资料方式">
      <button className={mode === 'files' ? 'is-active' : ''} onClick={() => setMode('files')} type="button">文件与图片</button>
      <button className={mode === 'text' ? 'is-active' : ''} onClick={() => setMode('text')} type="button">粘贴文字</button>
      <button className={mode === 'web' ? 'is-active' : ''} onClick={() => setMode('web')} type="button">网页链接</button>
      <button className={mode === 'research' ? 'is-active' : ''} onClick={() => setMode('research')} type="button">联网研究</button>
    </div>
    <section className={`source-add-dock${mode === 'research' ? ' is-research' : ''}`}>
      {mode === 'files' && <>
        <input ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
        <button className="source-drop-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><span>＋</span><strong>{busy ? '正在上传…' : '选择 PDF、Word 或照片'}</strong><small>单个文件不超过 50 MB</small></button>
      </>}
      {mode === 'text' && <div className="source-compose"><input value={textTitle} onChange={(event) => setTextTitle(event.target.value)} placeholder="标题（可选）" /><textarea value={textBody} onChange={(event) => setTextBody(event.target.value)} placeholder="粘贴研究背景、项目介绍或现场说明…" /><button onClick={() => void createText()} disabled={busy || !textBody.trim()} type="button">保存并解析</button></div>}
      {mode === 'web' && <div className="source-compose"><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/research" /><p>只读取当前公开页面，不会继续抓取站内其他链接。</p><button onClick={() => void createWeb()} disabled={busy || !url.trim()} type="button">读取并总结</button></div>}
      {mode === 'research' && <ResearchPanel projectId={projectId} onAdopted={load} />}
    </section>
    {error && <div className="source-error" role="alert">{error}<button type="button" onClick={() => setError('')}>关闭</button></div>}
    <div className="source-ledger">
      <div className="source-ledger-head"><strong>已添加的资料</strong><span>{sources.filter((item) => item.selected).length}/{sources.length} 已选</span></div>
      {sources.length === 0 ? <div className="source-empty-state"><strong>还没有资料</strong><span>上传文件、粘贴文字或提供一个公开网页。</span></div> : sources.map((source) => <article className={`source-ledger-row${source.selected ? ' is-selected' : ''}`} key={source.id}>
        <div className="source-row-main">
          <span className="source-kind">{kindCopy[source.kind]}</span>
          <span className="source-row-copy"><small>{sourceLabel(source)}</small><strong>{source.title}</strong></span>
        </div>
        <button className={`source-check${source.selected ? ' is-checked' : ''}`} type="button" onClick={() => void toggle(source)} aria-label={source.selected ? '取消选入分析' : '选入分析'} aria-pressed={source.selected}>✓</button>
      </article>)}
    </div>
  </div>;
}
