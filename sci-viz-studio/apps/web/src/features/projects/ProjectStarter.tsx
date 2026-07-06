import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProjectIntakeInterpretation, ResearchMode, StudioProject } from '@studio/contracts';
import { apiFetch } from '../../api/client';
import {
  createProjectTextSource,
  createProjectWebSource,
  readApiPayload,
  startProjectResearch,
  uploadProjectFile,
} from '../sources/sourceApi';
import { fileIdentity, formatFileSize, validateAndMergeFiles } from '../sources/pendingFileUtils';

const researchCopy: Record<ResearchMode, { label: string; description: string }> = {
  FAST: { label: 'Fast Research', description: '快速获得公开来源' },
  DEEP: { label: 'Deep Research', description: '获得深入报告和结果' },
};

function ResearchModeIcon({ mode, className }: { mode: ResearchMode; className?: string }) {
  return mode === 'FAST'
    ? <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d="m13.5 2.5-8 11h6l-1 8 8-12h-6z" /></svg>
    : <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
}

export function ProjectStarter() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [researchMode, setResearchMode] = useState<ResearchMode>('FAST');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileStates, setFileStates] = useState<Record<string, 'pending' | 'uploading' | 'uploaded' | 'failed'>>({});
  const dragDepth = useRef(0);
  const researchMenu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  const addFiles = (incoming: File[]) => {
    const result = validateAndMergeFiles(files, incoming);
    setFiles(result.files);
    setFileStates((current) => Object.fromEntries(result.files.map((file) => [fileIdentity(file), current[fileIdentity(file)] ?? 'pending'])));
    setError(result.errors.join('；'));
  };

  const submit = async () => {
    const rawInput = input.trim();
    if ((!rawInput && files.length === 0) || submitting) return;
    setSubmitting(true); setError('');
    try {
      const interpretation = await readApiPayload<{ success: true; data: ProjectIntakeInterpretation }>(await apiFetch('/project-intake/interpret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: rawInput, fileNames: files.map((file) => file.name) }),
      }));
      const intake = interpretation.data;
      const created = await readApiPayload<{ success: true; data: { project: StudioProject } }>(await apiFetch('/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: intake.title,
          researchDirection: intake.researchDirection,
          primaryAudience: intake.possibleAudience,
          ...(intake.primaryGoal ? { primaryGoal: intake.primaryGoal } : {}),
          ...(intake.secondaryGoal ? { secondaryGoal: intake.secondaryGoal } : {}),
        }),
      }));
      const projectId = created.data.project.id;
      const setupErrors: string[] = [];
      const run = async (action: () => Promise<void>, label: string) => {
        try { await action(); } catch { setupErrors.push(label); }
      };
      if (rawInput) await run(() => createProjectTextSource(projectId, rawInput, '首页项目描述'), '项目描述');
      for (const url of intake.urls) await run(() => createProjectWebSource(projectId, url), `网页 ${url}`);
      for (const file of files) {
        const identity = fileIdentity(file);
        setFileStates((current) => ({ ...current, [identity]: 'uploading' }));
        try {
          await uploadProjectFile(projectId, file);
          setFileStates((current) => ({ ...current, [identity]: 'uploaded' }));
        } catch {
          setFileStates((current) => ({ ...current, [identity]: 'failed' }));
          setupErrors.push(`文件“${file.name}”`);
        }
      }
      await run(() => startProjectResearch(projectId, researchMode, intake.searchQuery), researchCopy[researchMode].label);
      if (setupErrors.length) sessionStorage.setItem(`studio:intake-warning:${projectId}`, `项目已创建，但${setupErrors.join('、')}未完成，可在 01 重试。`);
      navigate(`/projects/${projectId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '项目暂时无法创建，请重试。');
      setSubmitting(false);
    }
  };

  return <section className="project-starter" aria-labelledby="project-starter-title">
    <header>
      <h1 id="project-starter-title">从一个科研项目开始</h1>
    </header>
    <div
      className={`project-starter-composer${dragging ? ' is-dragging' : ''}`}
      onDragEnter={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
      onDragOver={(event) => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}
    >
      {dragging && <div className="project-starter-drop-message">松开即添加到项目</div>}
      <textarea
        autoFocus
        value={input}
        disabled={submitting}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit();
        }}
        placeholder="描述你的科研项目、粘贴资料或告诉我们这次希望解决什么问题…"
        aria-label="项目启动内容"
      />
      {files.length > 0 && <div className="project-starter-files" aria-label="待上传文件">
        {files.map((file, index) => <span className={`is-${fileStates[fileIdentity(file)] ?? 'pending'}`} key={fileIdentity(file)}><em>{file.name}</em><small>{fileStates[fileIdentity(file)] === 'uploading' ? '上传中…' : fileStates[fileIdentity(file)] === 'uploaded' ? '已上传' : fileStates[fileIdentity(file)] === 'failed' ? '上传失败' : formatFileSize(file.size)}</small><button type="button" disabled={submitting} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${file.name}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8m0-8-8 8" /></svg>
        </button></span>)}
      </div>}
      <div className="project-starter-toolbar">
        <div className="project-starter-tools">
          <label className={`project-starter-add${submitting ? ' is-disabled' : ''}`} aria-label="上传 PDF、Word 或图片">
            <input className="sr-only" type="file" multiple disabled={submitting} accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => {
              addFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }} />
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </label>
          <details ref={researchMenu} className="project-research-menu">
            <summary aria-label="选择联网研究模式">
              <ResearchModeIcon mode={researchMode} className="project-research-icon" />
              <span>{researchCopy[researchMode].label}</span>
              <svg className="project-chevron-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </summary>
            <div className="project-research-popover" role="menu">
              {(Object.keys(researchCopy) as ResearchMode[]).map((mode) => <button key={mode} type="button" role="menuitemradio" aria-checked={researchMode === mode} onClick={() => { setResearchMode(mode); researchMenu.current?.removeAttribute('open'); }}>
                <ResearchModeIcon mode={mode} />
                <span><strong>{researchCopy[mode].label}</strong><small>{researchCopy[mode].description}</small></span>
              </button>)}
            </div>
          </details>
        </div>
        <button type="button" className="project-starter-send" disabled={submitting || (!input.trim() && files.length === 0)} onClick={() => void submit()} aria-label="创建项目">
          {submitting ? <span className="project-starter-spinner" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </button>
      </div>
    </div>
    {error && <div className="project-starter-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>关闭</button></div>}
  </section>;
}
