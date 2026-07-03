import { useState } from 'react';
import type { ShotCard } from '@studio/contracts';

interface ShotCardInput {
  title: string; purpose: string; subject: string; scene: string;
  shotSize: string; cameraAngle: string; composition: string;
  lighting: string; colorTone: string; action: string;
  scienceInfo: string; priority: 'MUST' | 'SHOULD' | 'OPTIONAL';
  peopleEquipmentMaterials: string;
  riskNotes: string;
  referenceImageUrls: string;
}

const priorityLabel: Record<string, string> = {
  MUST: '必拍',
  SHOULD: '建议',
  OPTIONAL: '可选',
};

const baseFields: Array<{ key: keyof ShotCardInput; label: string; placeholder: string; kind: 'input' | 'textarea' }> = [
  { key: 'title', label: '标题', placeholder: '例如：实验室全景', kind: 'input' },
  { key: 'purpose', label: '目的', placeholder: '为什么要拍这张画面', kind: 'textarea' },
  { key: 'subject', label: '拍摄对象', placeholder: '拍什么', kind: 'input' },
  { key: 'scene', label: '场景', placeholder: '在哪拍', kind: 'input' },
  { key: 'shotSize', label: '景别', placeholder: '全景/中景/近景/特写', kind: 'input' },
  { key: 'cameraAngle', label: '机位/角度', placeholder: '平拍/俯拍/仰拍', kind: 'input' },
  { key: 'composition', label: '构图', placeholder: '主体居中/三分法/引导线', kind: 'input' },
  { key: 'lighting', label: '光线', placeholder: '自然光/冷白光/补光方案', kind: 'input' },
  { key: 'colorTone', label: '色调', placeholder: '冷白/暖黄/灰调', kind: 'input' },
  { key: 'action', label: '动作/状态', placeholder: '科研人员操作设备', kind: 'input' },
  { key: 'scienceInfo', label: '科学信息', placeholder: '需要传达的科学内容', kind: 'textarea' },
];

function emptyForm(): ShotCardInput {
  return {
    title: '', purpose: '', subject: '', scene: '',
    shotSize: '', cameraAngle: '', composition: '',
    lighting: '', colorTone: '', action: '',
    scienceInfo: '', priority: 'MUST',
    peopleEquipmentMaterials: '',
    riskNotes: '',
    referenceImageUrls: '',
  };
}

interface ShotCardEditorProps {
  cards: ShotCard[];
  onCreate: (input: ShotCardInput) => Promise<ShotCard | null>;
  onUpdate: (cardId: string, patch: Partial<ShotCardInput>, expectedRevision: number) => Promise<boolean>;
  onRemove: (cardId: string, expectedRevision: number) => Promise<void>;
  onDuplicate: (card: ShotCard) => Promise<ShotCard | null>;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  error: string;
  onClearError: () => void;
}

export function ShotCardEditor({ cards, onCreate, onUpdate, onRemove, onDuplicate, onMoveUp, onMoveDown, error, onClearError }: ShotCardEditorProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShotCardInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ShotCardInput, string>>>({});

  const validate = (f: ShotCardInput) => {
    const errs: Partial<Record<keyof ShotCardInput, string>> = {};
    if (!f.title.trim()) errs.title = '请输入标题';
    if (!f.purpose.trim()) errs.purpose = '请输入目的';
    if (!f.subject.trim()) errs.subject = '请输入拍摄对象';
    if (!f.scene.trim()) errs.scene = '请输入场景';
    if (!f.shotSize.trim()) errs.shotSize = '请输入景别';
    return errs;
  };

  const handleAdd = () => {
    setAdding(true);
    setEditingId(null);
    setForm(emptyForm());
    setFieldErrors({});
    onClearError();
  };

  const handleEdit = (card: ShotCard) => {
    setEditingId(card.id);
    setAdding(false);
    setForm({
      title: card.title, purpose: card.purpose, subject: card.subject,
      scene: card.scene, shotSize: card.shotSize, cameraAngle: card.cameraAngle,
      composition: card.composition, lighting: card.lighting, colorTone: card.colorTone,
      action: card.action, scienceInfo: card.scienceInfo, priority: card.priority,
      peopleEquipmentMaterials: (card.peopleEquipmentMaterials ?? []).join('、'),
      riskNotes: (card.risks ?? []).map((r) => `[${r.severity}] ${r.description}`).join('\n'),
      referenceImageUrls: (card.referenceImageUrls ?? []).join('\n'),
    });
    setFieldErrors({});
    onClearError();
  };

  const handleCancel = () => {
    setAdding(false);
    setEditingId(null);
    setFieldErrors({});
  };

  const handleSubmit = async () => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setSaving(true);
    onClearError();
    if (editingId) {
      const card = cards.find((c) => c.id === editingId);
      if (card) {
        const ok = await onUpdate(editingId, form, card.revision);
        if (ok) {
          setEditingId(null);
          setForm(emptyForm());
        }
      }
    } else {
      const result = await onCreate(form);
      if (result) {
        setAdding(false);
        setForm(emptyForm());
      }
    }
    setSaving(false);
  };

  const cardForm = (f: ShotCardInput, set: (p: Partial<ShotCardInput>) => void) => (
    <div className="shot-card-form">
      <div className="shot-form-grid">
        {baseFields.map((field) => {
          if (field.kind === 'textarea') {
            return (
              <label className="shot-field shot-field-wide" key={field.key}>
                <span className="shot-field-label">
                  {field.label}
                  {fieldErrors[field.key] && <em className="shot-field-error">{fieldErrors[field.key]}</em>}
                </span>
                <textarea
                  className={`shot-textarea${fieldErrors[field.key] ? ' has-error' : ''}`}
                  value={String(f[field.key])}
                  onChange={(e) => set({ [field.key]: e.target.value } as Partial<ShotCardInput>)}
                  placeholder={field.placeholder}
                  rows={3}
                />
              </label>
            );
          }
          return (
            <label className="shot-field" key={field.key}>
              <span className="shot-field-label">
                {field.label}
                {fieldErrors[field.key] && <em className="shot-field-error">{fieldErrors[field.key]}</em>}
              </span>
              <input
                type="text"
                value={String(f[field.key])}
                onChange={(e) => set({ [field.key]: e.target.value } as Partial<ShotCardInput>)}
                placeholder={field.placeholder}
                className={fieldErrors[field.key] ? 'has-error' : ''}
                maxLength={field.key === 'title' ? 200 : 1000}
              />
            </label>
          );
        })}
        <label className="shot-field">
          <span className="shot-field-label">优先级</span>
          <select
            value={f.priority}
            onChange={(e) => set({ priority: e.target.value as ShotCardInput['priority'] })}
            className="shot-select"
          >
            <option value="MUST">必拍</option>
            <option value="SHOULD">建议</option>
            <option value="OPTIONAL">可选</option>
          </select>
        </label>
        <label className="shot-field shot-field-wide">
          <span className="shot-field-label">人员/设备/材料（用逗号或顿号分隔）</span>
          <input
            type="text"
            value={f.peopleEquipmentMaterials}
            onChange={(e) => set({ peopleEquipmentMaterials: e.target.value })}
            placeholder="科研人员、大型离心机、生物样本"
          />
        </label>
        <label className="shot-field shot-field-wide">
          <span className="shot-field-label">风险信息（每行一个，格式：[严重度] 描述）</span>
          <textarea
            className="shot-textarea"
            value={f.riskNotes}
            onChange={(e) => set({ riskNotes: e.target.value })}
            placeholder={`[WARNING] 激光设备运行时需戴防护眼镜\n[INFO] 样本需保持在 4°C 以下`}
            rows={3}
          />
        </label>
        <label className="shot-field shot-field-wide">
          <span className="shot-field-label">参考图 URL（每行一个）</span>
          <textarea
            className="shot-textarea"
            value={f.referenceImageUrls}
            onChange={(e) => set({ referenceImageUrls: e.target.value })}
            placeholder={'https://example.com/ref1.jpg\nhttps://example.com/ref2.jpg'}
            rows={2}
          />
        </label>
      </div>
      <div className="shot-form-actions">
        <button type="button" className="project-btn-secondary" onClick={handleCancel}>取消</button>
        <button
          type="button"
          className="project-btn-primary"
          onClick={() => void handleSubmit()}
          disabled={saving}
        >
          {saving ? '保存中…' : editingId ? '更新画面卡' : '添加画面卡'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="shot-card-editor">
      {error && (
        <div className="shot-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onClearError} aria-label="关闭">&times;</button>
        </div>
      )}

      <div className="shot-card-list">
        {cards.length === 0 && !adding ? (
          <div className="benchmark-error">
            <p>还没有画面卡。添加你的第一张必拍画面卡。</p>
          </div>
        ) : (
          cards.map((card, index) => (
            <div key={card.id} className={`shot-card-item${editingId === card.id ? ' is-editing' : ''}`}>
              {editingId === card.id ? (
                cardForm(form, (p) => setForm((prev) => ({ ...prev, ...p })))
              ) : (
                <>
                  <div className="shot-card-preview">
                    <div className="shot-card-preview-head">
                      <span className={`shot-priority-badge priority-${card.priority}`}>{priorityLabel[card.priority]}</span>
                      <strong>{card.title}</strong>
                      <span className="shot-card-index">{index + 1}/{cards.length}</span>
                    </div>
                    <div className="shot-card-preview-meta">
                      <span>{card.shotSize}</span>
                      <span>{card.cameraAngle}</span>
                      <span>{card.scene}</span>
                      {(card.peopleEquipmentMaterials ?? []).length > 0 && (
                        <span>{card.peopleEquipmentMaterials.slice(0, 3).join('、')}{card.peopleEquipmentMaterials.length > 3 ? '…' : ''}</span>
                      )}
                    </div>
                    <p className="shot-card-preview-purpose">{card.purpose}</p>
                    {(card.risks ?? []).length > 0 && (
                      <div className="shot-card-preview-risks">
                        {card.risks.map((r, i) => (
                          <span key={i} className={`risk-tag risk-${r.severity.toLowerCase()}`}>
                            {r.severity === 'BLOCKER' ? '阻断' : r.severity === 'WARNING' ? '警告' : '提示'}: {r.description.slice(0, 60)}{r.description.length > 60 ? '…' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shot-card-actions">
                    <button type="button" className="shot-action-btn" onClick={() => onMoveUp(index)} title="上移" disabled={index === 0}>↑</button>
                    <button type="button" className="shot-action-btn" onClick={() => onMoveDown(index)} title="下移" disabled={index >= cards.length - 1}>↓</button>
                    <button type="button" className="shot-action-btn" onClick={() => handleEdit(card)} title="编辑">✎</button>
                    <button type="button" className="shot-action-btn" onClick={() => void onDuplicate(card)} title="复制">⧉</button>
                    <button
                      type="button"
                      className="shot-action-btn shot-action-danger"
                      onClick={() => {
                        if (window.confirm('确定删除这张画面卡吗？')) void onRemove(card.id, card.revision);
                      }}
                      title="删除"
                    >✕</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {adding && cardForm(form, (p) => setForm((prev) => ({ ...prev, ...p })))}

      {!adding && (
        <button type="button" className="shot-add-btn" onClick={handleAdd}>
          + 添加画面卡
        </button>
      )}
    </div>
  );
}
