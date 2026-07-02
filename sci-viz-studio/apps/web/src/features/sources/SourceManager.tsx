import { useEffect, useMemo, useRef, useState } from 'react';
import type { SourceDocument } from '@studio/contracts';
import { API_BASE_URL } from '../../api/client';

const API = API_BASE_URL;
const statusCopy: Record<SourceDocument['status'], string> = {
  UPLOADING: '上传中', QUEUED: '等待解析', PARSING: '提取内容', SUMMARIZING: 'AI 总结', READY: '已就绪', READY_WITHOUT_SUMMARY: '摘要待重试', FAILED: '需要处理',
};
const kindCopy: Record<SourceDocument['kind'], string> = { PDF: 'PDF', DOCX: 'Word', IMAGE: '图片', TEXT: '文字', WEB: '网页' };

async function readPayload<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? `请求失败（${response.status}）`);
}

export function SourceManager({ projectId, onSourcesChange }: { projectId: string; onSourcesChange: (sources: SourceDocument[]) => void }) {
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [mode, setMode] = useState<'files' | 'text' | 'web'>('files');
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    const payload = await readPayload<{ success: true; data: SourceDocument[] }>(await fetch(`${API}/projects/${projectId}/sources`));
    setSources(payload.data); onSourcesChange(payload.data);
    setActiveId((current) => current && payload.data.some((item) => item.id === current) ? current : payload.data[0]?.id);
  };

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : '资料列表加载失败')); }, [projectId]);
  useEffect(() => {
    if (!sources.some((source) => ['UPLOADING', 'QUEUED', 'PARSING', 'SUMMARIZING'].includes(source.status))) return;
    const timer = window.setInterval(() => void load(), 1800);
    return () => window.clearInterval(timer);
  }, [sources]);

  const active = useMemo(() => sources.find((source) => source.id === activeId), [sources, activeId]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const mimeType = file.type || (extension === 'pdf' ? 'application/pdf' : extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : extension === 'png' ? 'image/png' : 'image/jpeg');
        const init = await readPayload<{ success: true; data: { source: SourceDocument; storageMode: 'local' | 'oss'; uploadUrl?: string } }>(await fetch(`${API}/source-uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, fileName: file.name, mimeType, sizeBytes: file.size }) }));
        if (init.data.storageMode === 'oss' && init.data.uploadUrl) {
          const uploaded = await fetch(init.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
          if (!uploaded.ok) throw new Error(`“${file.name}”上传到 OSS 失败。`);
          await readPayload(await fetch(`${API}/source-uploads/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceId: init.data.source.id }) }));
        } else {
          const form = new FormData(); form.append('projectId', projectId); form.append('sourceId', init.data.source.id); form.append('file', file.type ? file : new File([file], file.name, { type: mimeType }));
          await readPayload(await fetch(`${API}/source-uploads/local`, { method: 'POST', body: form }));
        }
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '上传失败'); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const createText = async () => {
    if (!textBody.trim()) return;
    setBusy(true); setError('');
    try { await readPayload(await fetch(`${API}/sources/text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, title: textTitle || undefined, text: textBody }) })); setTextTitle(''); setTextBody(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '文字资料保存失败'); } finally { setBusy(false); }
  };

  const createWeb = async () => {
    if (!url.trim()) return;
    setBusy(true); setError('');
    try { await readPayload(await fetch(`${API}/sources/web`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, url }) })); setUrl(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '网页资料添加失败'); } finally { setBusy(false); }
  };

  const toggle = async (source: SourceDocument) => {
    try { await readPayload(await fetch(`${API}/sources/${source.id}/selection`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: !source.selected }) })); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '选择状态更新失败'); }
  };
  const retry = async (source: SourceDocument) => { try { await readPayload(await fetch(`${API}/sources/${source.id}/retry`, { method: 'POST' })); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : '重试失败'); } };
  const remove = async (source: SourceDocument) => { if (!window.confirm(`删除“${source.title}”？原文件和解析结果都会被移除。`)) return; try { await fetch(`${API}/sources/${source.id}`, { method: 'DELETE' }); await load(); } catch { setError('删除失败'); } };

  return <div className="source-manager">
    <div className="source-mode-tabs" role="tablist" aria-label="添加资料方式">
      <button className={mode === 'files' ? 'is-active' : ''} onClick={() => setMode('files')} type="button">文件与图片</button>
      <button className={mode === 'text' ? 'is-active' : ''} onClick={() => setMode('text')} type="button">粘贴文字</button>
      <button className={mode === 'web' ? 'is-active' : ''} onClick={() => setMode('web')} type="button">网页链接</button>
    </div>
    <section className="source-add-dock">
      {mode === 'files' && <>
        <input ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
        <button className="source-drop-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><span>＋</span><strong>{busy ? '正在上传…' : '选择 PDF、Word 或照片'}</strong><small>单个文件不超过 50 MB</small></button>
      </>}
      {mode === 'text' && <div className="source-compose"><input value={textTitle} onChange={(event) => setTextTitle(event.target.value)} placeholder="标题（可选）" /><textarea value={textBody} onChange={(event) => setTextBody(event.target.value)} placeholder="粘贴研究背景、项目介绍或现场说明…" /><button onClick={() => void createText()} disabled={busy || !textBody.trim()} type="button">保存并解析</button></div>}
      {mode === 'web' && <div className="source-compose"><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/research" /><p>只读取当前公开页面，不会继续抓取站内其他链接。</p><button onClick={() => void createWeb()} disabled={busy || !url.trim()} type="button">读取并总结</button></div>}
    </section>
    {error && <div className="source-error" role="alert">{error}<button type="button" onClick={() => setError('')}>关闭</button></div>}
    <div className="source-ledger">
      <div className="source-ledger-head"><strong>资料台账</strong><span>{sources.filter((item) => item.selected).length}/{sources.length} 已选</span></div>
      {sources.length === 0 ? <div className="source-empty-state"><strong>还没有资料</strong><span>上传文件、粘贴文字或提供一个公开网页。</span></div> : sources.map((source) => <article className={`source-ledger-row status-${source.status.toLowerCase()}${activeId === source.id ? ' is-active' : ''}`} key={source.id}>
        <button className="source-row-main" type="button" onClick={() => setActiveId(source.id)}>
          <span className="source-status-rail" aria-hidden="true" />
          <span className="source-kind">{kindCopy[source.kind]}</span>
          <span className="source-row-copy"><strong>{source.title}</strong><small>{statusCopy[source.status]}{source.truncated ? ' · 内容已截断' : ''}</small></span>
        </button>
        <button className={`source-check${source.selected ? ' is-checked' : ''}`} type="button" onClick={() => void toggle(source)} aria-label={source.selected ? '取消选入分析' : '选入分析'} aria-pressed={source.selected}>✓</button>
      </article>)}
    </div>
    {active && <section className="source-detail">
      <div className="source-detail-head"><div><span>{kindCopy[active.kind]} · {statusCopy[active.status]}</span><h3>{active.title}</h3></div><div>{(active.status === 'FAILED' || active.status === 'READY_WITHOUT_SUMMARY') && <button type="button" onClick={() => void retry(active)}>重试</button>}<button type="button" onClick={() => void remove(active)}>删除</button></div></div>
      {active.kind === 'IMAGE' && active.previewUrl && <img className="source-image-preview" src={active.previewUrl} alt={active.title} />}
      {active.errorMessage && <p className="source-detail-error">{active.errorMessage}</p>}
      {active.aiSummary && <div className="source-detail-block"><strong>AI 摘要</strong><p>{active.aiSummary}</p></div>}
      {active.imageDescription && <div className="source-detail-block"><strong>图片描述</strong><p>{active.imageDescription}</p></div>}
      {active.ocrText && <div className="source-detail-block"><strong>OCR 文字</strong><p>{active.ocrText}</p></div>}
      {(active.extractedText || active.rawText) && <details className="source-original"><summary>查看提取原文</summary><pre>{active.extractedText || active.rawText}</pre></details>}
      {active.sourceUrl && <a className="source-origin-link" href={active.sourceUrl} target="_blank" rel="noreferrer">打开原网页 ↗</a>}
    </section>}
    <p className="source-ai-notice">上传内容存入私有资料区；OCR 与摘要会发送给项目配置的 Qwen 服务。</p>
  </div>;
}
