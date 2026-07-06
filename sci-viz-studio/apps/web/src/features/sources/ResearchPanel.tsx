import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResearchCandidate, ResearchMode, ResearchTask, SourceDocument } from '@studio/contracts';
import { apiFetch, notifyUsageChanged } from '../../api/client';

async function readPayload<T>(response: Response): Promise<T> {
  if (response.ok) return await response.json() as T;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? `请求失败（${response.status}）`);
}

const statusCopy: Record<ResearchTask['status'], string> = { QUEUED: '等待研究', RUNNING: '正在研究', COMPLETED: '研究完成', FAILED: '研究失败' };
const typeCopy: Record<ResearchCandidate['sourceType'], string> = { OFFICIAL: '官方', PAPER: '论文', NEWS: '新闻', INSTITUTION: '机构', OTHER: '网页' };

function ResearchSelectAll({ task, selectedIds, onChange }: { task: ResearchTask; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const allIds = task.candidates.map((candidate) => candidate.id);
  const selectedCount = allIds.filter((id) => selectedIds.includes(id)).length;
  const allSelected = allIds.length > 0 && selectedCount === allIds.length;
  useEffect(() => { if (input.current) input.current.indeterminate = selectedCount > 0 && !allSelected; }, [allSelected, selectedCount]);
  return <label className="research-select-all">
    <input ref={input} type="checkbox" aria-label="全选本次结果" checked={allSelected} onChange={() => onChange(allSelected ? [] : allIds)} />
    <span>全选本次结果</span>
    <small>已选 {selectedCount}/{allIds.length}</small>
  </label>;
}

export function ResearchPanel({ projectId, onAdopted, sources = [] }: { projectId: string; onAdopted: () => Promise<void>; sources?: SourceDocument[] }) {
  const [mode, setMode] = useState<ResearchMode>('FAST');
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const payload = await readPayload<{ success: true; data: ResearchTask[] }>(await apiFetch(`/projects/${projectId}/research-tasks`));
    setTasks(payload.data);
  };

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : '研究任务加载失败')); }, [projectId]);
  const hasActiveTask = tasks.some((task) => task.status === 'QUEUED' || task.status === 'RUNNING');
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = window.setInterval(() => void load(), 1600);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, projectId]);

  const visibleTasks = useMemo(() => tasks.slice(0, 4), [tasks]);
  const evidenceSources = useMemo(() => sources.filter((source) => source.selected && (source.kind === 'WEB' || source.kind === 'PDF' || source.kind === 'DOCX' || source.kind === 'IMAGE')).slice(0, 8), [sources]);

  const start = async () => {
    if (query.trim().length < 2) return;
    setBusy(true); setError('');
    try {
      await readPayload(await apiFetch('/research-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, mode, query }) }));
      setQuery(''); await load(); notifyUsageChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '联网研究启动失败'); }
    finally { setBusy(false); }
  };

  const retry = async (task: ResearchTask) => {
    setError('');
    try { await readPayload(await apiFetch(`/research-tasks/${task.id}/retry`, { method: 'POST' })); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '重新研究失败'); }
  };

  const toggle = (taskId: string, candidateId: string) => setSelected((current) => {
    const ids = current[taskId] ?? [];
    return { ...current, [taskId]: ids.includes(candidateId) ? ids.filter((id) => id !== candidateId) : [...ids, candidateId] };
  });

  const adopt = async (task: ResearchTask) => {
    const candidateIds = selected[task.id] ?? [];
    if (!candidateIds.length) return;
    setBusy(true); setError('');
    try {
      const payload = await readPayload<{ success: true; data: { skippedDuplicateCount: number } }>(await apiFetch(`/research-tasks/${task.id}/adopt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateIds }) }));
      setSelected((current) => ({ ...current, [task.id]: [] })); await onAdopted(); notifyUsageChanged();
      if (payload.data.skippedDuplicateCount) setError(`${payload.data.skippedDuplicateCount} 个重复网页已跳过，其余来源已加入资料。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '来源加入资料失败'); }
    finally { setBusy(false); }
  };

  return <div className="research-panel">
    <div className="research-mode-switch" aria-label="联网研究模式">
      <button type="button" className={mode === 'FAST' ? 'is-active' : ''} onClick={() => setMode('FAST')}><strong>Fast Research</strong><span>快速获得公开来源</span></button>
      <button type="button" className={mode === 'DEEP' ? 'is-active' : ''} onClick={() => setMode('DEEP')}><strong>Deep Research</strong><span>异步获得深入报告</span></button>
    </div>
    <div className="research-compose">
      <textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入项目名称、实验室、研究主题，或希望补充的问题…" />
      <div><span>{mode === 'FAST' ? '返回候选来源，由你选择后加入资料。' : '任务在后台运行，不会阻塞当前工作。'}</span><button type="button" disabled={busy || query.trim().length < 2} onClick={() => void start()}>{busy ? '正在启动…' : mode === 'FAST' ? '快速研究' : '开始深度研究'}</button></div>
    </div>
    {error && <div className="source-error" role="alert">{error}<button type="button" onClick={() => setError('')}>关闭</button></div>}
    {evidenceSources.length > 0 && <section className="research-used-sources" aria-label="本轮已使用资料">
      <strong>本轮已使用资料</strong>
      <div>{evidenceSources.map((source) => source.sourceUrl
        ? <a key={source.id} href={source.sourceUrl} target="_blank" rel="noreferrer"><span>{source.title}</span><small>{new URL(source.sourceUrl).hostname.replace(/^www\./, '')}</small></a>
        : <span key={source.id}><span>{source.title}</span><small>{source.kind}</small></span>)}</div>
    </section>}
    {visibleTasks.length > 0 && <div className="research-task-list">
      {visibleTasks.map((task) => <article className="research-task" key={task.id}>
        <header><div><span>{task.mode === 'FAST' ? 'FAST' : 'DEEP'}</span><strong>{task.effectiveQuery ?? task.query}</strong></div><em className={`is-${task.status.toLowerCase()}`}>{statusCopy[task.status]}</em></header>
        {(task.status === 'QUEUED' || task.status === 'RUNNING') && <p>{task.mode === 'DEEP' ? '可以继续添加其他资料；研究完成后结果会保留在这里。' : '正在搜索并整理公开来源…'}</p>}
        {task.status === 'FAILED' && <div className="research-task-failure"><p>{task.error?.message ?? '联网研究失败。'}</p>{task.error?.retryable && <button type="button" onClick={() => void retry(task)}>重试</button>}</div>}
        {task.report && <section className="research-report"><strong>研究摘要</strong><p>{task.report.summary}</p>{task.report.limitations.map((item) => <small key={item}>限制：{item}</small>)}</section>}
        {task.status === 'COMPLETED' && task.candidates.length === 0 && <p>没有找到可采用的公开来源，请尝试更具体的查询。</p>}
        {task.candidates.length > 0 && <div className="research-candidates">
          <ResearchSelectAll task={task} selectedIds={selected[task.id] ?? []} onChange={(ids) => setSelected((current) => ({ ...current, [task.id]: ids }))} />
          {task.candidates.map((candidate) => { const checked = (selected[task.id] ?? []).includes(candidate.id); return <label className={checked ? 'is-selected' : ''} key={candidate.id}>
            <input type="checkbox" checked={checked} onChange={() => toggle(task.id, candidate.id)} />
            <span className="research-source-type">{typeCopy[candidate.sourceType]}</span>
            <span className="research-candidate-copy"><strong>{candidate.title}</strong><small>{candidate.domain}</small><p>{candidate.snippet || '打开原始来源查看详情。'}</p></span>
            <a href={candidate.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>来源</a>
          </label>; })}
          <button className="research-adopt" type="button" disabled={busy || !(selected[task.id]?.length)} onClick={() => void adopt(task)}>将所选来源加入资料</button>
        </div>}
      </article>)}
    </div>}
  </div>;
}
