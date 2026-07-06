import { useRef, useState } from 'react';
import type { ResearchMode } from '@studio/contracts';
import {
  createProjectTextSource,
  createProjectWebSource,
  startProjectResearch,
  uploadProjectFiles,
} from './sourceApi';
import { validateAndMergeFiles } from './pendingFileUtils';

interface SourceOnboardingProps {
  projectId: string;
  onStarted: () => void | Promise<void>;
}

function safeMessage(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : '';
  return message && !/^[A-Z_]{4,}$/.test(message) ? message : fallback;
}

export function SourceOnboarding({ projectId, onStarted }: SourceOnboardingProps) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [busy, setBusy] = useState<'' | 'text' | 'file' | ResearchMode | 'web'>('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const finish = async (action: () => Promise<void>, kind: typeof busy, fallback: string) => {
    setBusy(kind); setError('');
    try { await action(); await onStarted(); }
    catch (cause) { setError(safeMessage(cause, fallback)); }
    finally { setBusy(''); }
  };

  const submitText = () => {
    const value = text.trim();
    if (!value) return;
    void finish(() => createProjectTextSource(projectId, value, '项目描述'), 'text', '项目描述暂时没有保存，请重试。');
  };

  const startResearch = (mode: ResearchMode) => {
    const query = text.trim();
    if (!query) { setError('请先写下希望调研的项目或问题。'); return; }
    void finish(() => startProjectResearch(projectId, mode, query), mode, '联网研究暂时无法启动，请稍后重试。');
  };

  return <main className="source-onboarding">
    <div className="source-onboarding-brand"><img src={`${import.meta.env.BASE_URL}logo.png`} alt="" /><span>科研影像</span></div>
    <section className="source-onboarding-content" aria-labelledby="source-onboarding-title">
      <header>
        <span className="source-onboarding-step">01 · 资料输入</span>
        <h1 id="source-onboarding-title">从理解科研项目开始</h1>
        <p>写下研究背景、核心对象或现阶段的问题；也可以上传资料或联网补充公开来源。</p>
      </header>
      <div className="source-onboarding-composer">
        <textarea
          autoFocus
          value={text}
          disabled={Boolean(busy)}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submitText();
          }}
          placeholder="例如：我们正在研发一套深海机器人，希望用于产业合作和公众传播。目前需要明确这个项目下一次应该怎么拍…"
          aria-label="项目描述"
        />
        {showUrl && <div className="source-onboarding-url">
          <input autoFocus type="url" value={url} disabled={Boolean(busy)} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/research" aria-label="公开网页地址" />
          <button type="button" disabled={Boolean(busy) || !url.trim()} onClick={() => void finish(() => createProjectWebSource(projectId, url.trim()), 'web', '网页暂时无法读取，请检查链接后重试。')}>添加</button>
        </div>}
        <div className="source-onboarding-toolbar">
          <div className="source-onboarding-tools">
            <input ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => {
              const result = validateAndMergeFiles([], Array.from(event.currentTarget.files ?? []));
              if (result.errors.length) setError(result.errors.join('；'));
              if (result.files.length) void finish(() => uploadProjectFiles(projectId, result.files), 'file', '文件暂时无法上传，请重试。');
              event.currentTarget.value = '';
            }} />
            <button type="button" className="source-tool-icon" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()} aria-label="上传 PDF、Word 或图片" title="上传 PDF、Word 或图片">+</button>
            <button type="button" className={`source-tool-icon is-link${showUrl ? ' is-active' : ''}`} disabled={Boolean(busy)} onClick={() => setShowUrl((value) => !value)} aria-label="添加公开网页" title="添加公开网页">∞</button>
            <span className="source-toolbar-divider" />
            <button type="button" className="source-research-action" disabled={Boolean(busy) || !text.trim()} onClick={() => startResearch('FAST')}><strong>{busy === 'FAST' ? '启动中…' : 'Fast Research'}</strong><span>快速补充来源</span></button>
            <button type="button" className="source-research-action" disabled={Boolean(busy) || !text.trim()} onClick={() => startResearch('DEEP')}><strong>{busy === 'DEEP' ? '启动中…' : 'Deep Research'}</strong><span>后台深入调研</span></button>
          </div>
          <button type="button" className="source-onboarding-send" disabled={Boolean(busy) || !text.trim()} onClick={submitText} aria-label="保存项目描述">↑</button>
        </div>
      </div>
      <div className="source-onboarding-hint"><span>PDF、Word、JPG 或 PNG</span><span>按 ⌘ Enter 提交</span></div>
      {error && <div className="source-onboarding-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError('')}>关闭</button></div>}
    </section>
  </main>;
}
