import { useState } from 'react';
import { useCaptureItems, STATUS_LABEL, type MergedCaptureItem } from './useCaptureItems';

interface CaptureChecklistProps {
  projectId: string;
}

const priorityLabel: Record<string, string> = {
  MUST: '必拍',
  SHOULD: '建议',
  OPTIONAL: '可选',
};

function CaptureRow({ item, onToggle, onFileChange, onNoteChange }: {
  item: MergedCaptureItem;
  onToggle: () => void;
  onFileChange: (v: string) => void;
  onNoteChange: (v: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.note);
  const statusClass = `status-${item.status.toLowerCase()}`;
  const syncLabel = item.syncState === 'saving' ? '同步中…' :
    item.syncState === 'queued' ? '排队中' :
    item.syncState === 'error' ? '同步失败' :
    item.syncState === 'conflict' ? '版本冲突' : '';

  return (
    <div className={`checklist-row${item.status !== 'TODO' ? ' is-done' : ''}${item.syncState === 'saving' || item.syncState === 'queued' ? ' is-syncing' : ''}${item.syncState === 'error' ? ' has-error' : ''}`}>
      <button
        type="button"
        className={`checklist-status-btn ${statusClass}`}
        onClick={onToggle}
        disabled={item.syncState === 'saving'}
        aria-label={`${item.title}：${STATUS_LABEL[item.status]}，点击切换`}
      >
        <span className="checklist-status-icon" aria-hidden="true" />
        <span className="checklist-status-text">{STATUS_LABEL[item.status]}</span>
      </button>

      <div className="checklist-info">
        <div className="checklist-head">
          <span className={`checklist-priority priority-${item.priority}`}>{priorityLabel[item.priority]}</span>
          <strong>{item.title}</strong>
          <span className="checklist-shot-size">{item.shotSize}</span>
        </div>

        <div className="checklist-fields">
          <label className="checklist-file-label">
            <span>文件编号</span>
            <input
              type="text"
              value={item.fileNumber}
              onChange={(e) => onFileChange(e.target.value)}
              placeholder="IMG_001"
              maxLength={200}
              disabled={item.syncState === 'saving'}
              className="checklist-file-input"
            />
          </label>

          {editingNote ? (
            <div className="checklist-note-edit">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="添加备注…"
                rows={2}
                maxLength={500}
                autoFocus
              />
              <div className="checklist-note-actions">
                <button type="button" onClick={() => { setEditingNote(false); setNoteDraft(item.note); }}>取消</button>
                <button type="button" onClick={() => { onNoteChange(noteDraft); setEditingNote(false); }}>保存</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="checklist-note-trigger"
              onClick={() => { setNoteDraft(item.note); setEditingNote(true); }}
            >
              {item.note ? item.note : '添加备注…'}
            </button>
          )}
        </div>

        {syncLabel && (
          <div className={`checklist-sync-label ${item.syncState}`}>{syncLabel}</div>
        )}
      </div>
    </div>
  );
}

export function CaptureChecklist({ projectId }: CaptureChecklistProps) {
  const { scenes, loading, error, globalSyncState, toggleStatus, updateDetail, retrySync, reload } = useCaptureItems(projectId);

  if (loading && scenes.length === 0) {
    return (
      <div className="checklist-shell">
        <div className="benchmark-loading">
          <span className="projects-loading-spinner" aria-hidden="true" />
          <p>正在加载拍摄清单…</p>
        </div>
      </div>
    );
  }

  if (!error && scenes.length === 0) {
    return (
      <div className="checklist-shell">
        <div className="benchmark-error">
          <p>暂无画面卡。请先在「画面卡」标签中创建拍摄计划。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checklist-shell">
      <div className="checklist-sync-bar">
        <span>
          {globalSyncState === 'saving' && '同步中…'}
          {globalSyncState === 'queued' && '有未同步的修改'}
          {globalSyncState === 'conflict' && '部分修改存在版本冲突'}
          {globalSyncState === 'error' && '部分修改未保存'}
          {globalSyncState === 'idle' && '已同步'}
        </span>
        {(globalSyncState === 'queued' || globalSyncState === 'error' || globalSyncState === 'conflict') && (
          <button type="button" className="checklist-retry-btn" onClick={() => void retrySync()} title="重新同步">
            ↻
          </button>
        )}
        {globalSyncState === 'idle' && (
          <button type="button" className="checklist-retry-btn" onClick={() => void reload()} title="刷新">
            ↻
          </button>
        )}
      </div>

      {error && (
        <div className="checklist-conflict-banner" role="alert">
          {error}
          <button type="button" className="checklist-conflict-reload" onClick={() => void reload()}>重新加载</button>
        </div>
      )}

      {scenes.map(([scene, items]) => {
        const doneCount = items.filter((i) => i.status === 'CAPTURED').length;
        return (
          <section className="checklist-scene" key={scene}>
            <div className="checklist-scene-head">
              <h3>{scene}</h3>
              <span>{doneCount}/{items.length} 已拍</span>
            </div>
            <div className="checklist-scene-body">
              {items.map((item) => (
                <CaptureRow
                  key={item.shotCardId}
                  item={item}
                  onToggle={() => toggleStatus(item.shotCardId)}
                  onFileChange={(v) => updateDetail(item.shotCardId, 'fileNumber', v)}
                  onNoteChange={(v) => updateDetail(item.shotCardId, 'note', v)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
