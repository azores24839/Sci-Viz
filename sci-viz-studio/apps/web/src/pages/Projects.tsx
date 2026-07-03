import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectGoal, StudioProject } from '@studio/contracts';
import { apiFetch } from '../api/client';

const projectGoalLabel: Record<ProjectGoal, string> = {
  ACADEMIC_COMMUNICATION: '学术传播',
  PUBLIC_COMMUNICATION: '公众传播',
  RECRUITING_BRAND: '招生/招聘/团队品牌',
  INDUSTRY_COLLABORATION: '产业转化/合作',
};

const goalOptions: Array<{ id: ProjectGoal; label: string }> = [
  { id: 'ACADEMIC_COMMUNICATION', label: '学术传播' },
  { id: 'PUBLIC_COMMUNICATION', label: '公众传播' },
  { id: 'RECRUITING_BRAND', label: '招生/招聘/团队品牌' },
  { id: 'INDUSTRY_COLLABORATION', label: '产业转化/合作' },
];

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '进行中',
  COMPLETED: '已完成',
  ARCHIVED: '已归档',
};

type PageState = 'loading' | 'empty' | 'error' | 'ready';

interface NewProjectForm {
  name: string;
  teamType: string;
  researchDirection: string;
  primaryAudience: string;
  primaryGoal: ProjectGoal | '';
  secondaryGoal: ProjectGoal | '';
}

const emptyForm = (): NewProjectForm => ({
  name: '',
  teamType: '',
  researchDirection: '',
  primaryAudience: '',
  primaryGoal: '',
  secondaryGoal: '',
});

function formatTime(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function NewProjectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: NewProjectForm) => Promise<void>;
}) {
  const [form, setForm] = useState<NewProjectForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = form.name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试。');
      setSubmitting(false);
    }
  };

  const setField = <K extends keyof NewProjectForm>(key: K, value: NewProjectForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="project-modal-overlay" role="dialog" aria-label="新建项目" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="project-modal">
        <div className="project-modal-head">
          <h2>新建项目</h2>
          <button type="button" className="project-modal-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>
        <form className="project-form" onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}>
          <label className="project-field">
            <span>项目名称 <em>*</em></span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="例如：微流控芯片成像方案"
              maxLength={120}
              autoFocus
            />
          </label>
          <label className="project-field">
            <span>团队类型</span>
            <input
              type="text"
              value={form.teamType}
              onChange={(e) => setField('teamType', e.target.value)}
              placeholder="例如：高校实验室、企业研发中心"
              maxLength={120}
            />
          </label>
          <label className="project-field">
            <span>研究方向</span>
            <input
              type="text"
              value={form.researchDirection}
              onChange={(e) => setField('researchDirection', e.target.value)}
              placeholder="例如：生物医学工程、环境监测"
              maxLength={300}
            />
          </label>
          <label className="project-field">
            <span>主要受众</span>
            <input
              type="text"
              value={form.primaryAudience}
              onChange={(e) => setField('primaryAudience', e.target.value)}
              placeholder="例如：合作企业、期刊审稿人、公众"
              maxLength={200}
            />
          </label>
          <fieldset className="project-goal-group">
            <legend>拍摄目标</legend>
            <div className="project-goal-grid">
              {goalOptions.map((goal) => (
                <label
                  key={goal.id}
                  className={`project-goal-chip${form.primaryGoal === goal.id ? ' is-primary' : ''}${form.secondaryGoal === goal.id ? ' is-secondary' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={form.primaryGoal === goal.id || form.secondaryGoal === goal.id}
                    onChange={() => {
                      if (form.primaryGoal === goal.id) {
                        setField('primaryGoal', form.secondaryGoal as ProjectGoal | '');
                        setField('secondaryGoal', '');
                      } else if (form.secondaryGoal === goal.id) {
                        setField('secondaryGoal', '');
                      } else if (!form.primaryGoal) {
                        setField('primaryGoal', goal.id);
                      } else {
                        setField('secondaryGoal', goal.id);
                      }
                    }}
                    className="sr-only"
                  />
                  <span className="project-goal-chip-label">{goal.label}</span>
                  {form.primaryGoal === goal.id && <span className="project-goal-chip-badge">主目标</span>}
                  {form.secondaryGoal === goal.id && <span className="project-goal-chip-badge">次目标</span>}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="project-form-error" role="alert">{error}</p>}
          <div className="project-form-actions">
            <button type="button" className="project-btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="project-btn-primary" disabled={!canSubmit}>
              {submitting ? '创建中…' : '创建项目'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RenameModal({
  name,
  onClose,
  onSave,
}: {
  name: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败，请重试。');
      setSaving(false);
    }
  };

  return (
    <div className="project-modal-overlay" role="dialog" aria-label="重命名项目" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="project-modal project-modal-sm">
        <div className="project-modal-head">
          <h2>重命名项目</h2>
          <button type="button" className="project-modal-close" onClick={onClose} aria-label="关闭">&times;</button>
        </div>
        <form className="project-form" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
          <label className="project-field">
            <span>项目名称</span>
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} autoFocus />
          </label>
          {error && <p className="project-form-error" role="alert">{error}</p>}
          <div className="project-form-actions">
            <button type="button" className="project-btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="project-btn-primary" disabled={!value.trim() || saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Projects() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [renamingProject, setRenamingProject] = useState<StudioProject | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadProjects = useCallback(async () => {
    setPageState('loading');
    setErrorMessage('');
    try {
      const response = await apiFetch('/projects');
      if (!response.ok) throw new Error('项目列表加载失败');
      const payload = await response.json() as { success: boolean; data: StudioProject[]; error?: { message: string } };
      if (!payload.success) throw new Error(payload.error?.message ?? '项目列表加载失败');
      setProjects(payload.data);
      setPageState(payload.data.length === 0 ? 'empty' : 'ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '无法加载项目列表。');
      setPageState('error');
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const createProject = async (form: NewProjectForm) => {
    const response = await apiFetch('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        teamType: form.teamType.trim(),
        researchDirection: form.researchDirection.trim(),
        primaryAudience: form.primaryAudience.trim(),
        ...(form.primaryGoal ? { primaryGoal: form.primaryGoal } : {}),
        ...(form.secondaryGoal ? { secondaryGoal: form.secondaryGoal } : {}),
      }),
    });
    if (!response.ok) {
      const payload = await response.json() as { error?: { message: string } };
      throw new Error(payload.error?.message ?? '创建项目失败。');
    }
    setShowNewModal(false);
    await loadProjects();
  };

  const renameProject = async (project: StudioProject, newName: string) => {
    const response = await apiFetch(`/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, expectedUpdatedAt: project.updatedAt }),
    });
    if (!response.ok) {
      const payload = await response.json() as { error?: { message: string } };
      throw new Error(payload.error?.message ?? '重命名失败。');
    }
    setRenamingProject(null);
    await loadProjects();
  };

  const archiveProject = async (project: StudioProject) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch(`/projects/${project.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json() as { error?: { message: string } };
        throw new Error(payload.error?.message ?? '归档失败。');
      }
      await loadProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : '归档失败。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="projects-shell">
      <header className="projects-header">
        <div className="projects-brand">
          <img className="projects-logo" src="/logo.png" alt="研影" />
          <span>Sci AI Studio</span>
        </div>
        <button
          type="button"
          className="project-btn-primary"
          onClick={() => setShowNewModal(true)}
          disabled={pageState === 'loading'}
        >
          + 新建项目
        </button>
        <Link to="/help" className="projects-help-link">帮助</Link>
      </header>

      <main className="projects-body">
        {pageState === 'loading' && (
          <div className="projects-message" role="status">
            <span className="projects-loading-spinner" aria-hidden="true" />
            <p>正在加载项目…</p>
          </div>
        )}

        {pageState === 'error' && (
          <div className="projects-message projects-message-error" role="alert">
            <strong>加载失败</strong>
            <p>{errorMessage}</p>
            <button type="button" className="project-btn-secondary" onClick={() => void loadProjects()}>重试</button>
          </div>
        )}

        {pageState === 'empty' && (
          <div className="projects-message projects-empty">
            <strong>还没有项目</strong>
            <p>创建你的第一个科研影像项目，上传资料后让 AI 帮你策划拍摄方案。</p>
            <button
              type="button"
              className="project-btn-primary"
              onClick={() => setShowNewModal(true)}
            >
              创建第一个项目
            </button>
          </div>
        )}

        {pageState === 'ready' && (
          <div className="projects-grid">
            {projects.map((project) => (
              <article key={project.id} className="project-card">
                <Link to={`/projects/${project.id}`} className="project-card-main">
                  <div className="project-card-head">
                    <h3 className="project-card-name">{project.name}</h3>
                    <span className={`project-card-status status-${project.status.toLowerCase()}`}>
                      {statusLabel[project.status] ?? project.status}
                    </span>
                  </div>
                  <div className="project-card-meta">
                    {project.teamType && <span>{project.teamType}</span>}
                    {project.researchDirection && <span>{project.researchDirection}</span>}
                    {project.primaryGoal && (
                      <span className="project-card-goal">{projectGoalLabel[project.primaryGoal]}</span>
                    )}
                    {project.secondaryGoal && (
                      <span className="project-card-goal project-card-goal-secondary">
                        {projectGoalLabel[project.secondaryGoal]}
                      </span>
                    )}
                  </div>
                  <time className="project-card-time">{formatTime(project.updatedAt)}</time>
                </Link>
                <div className="project-card-actions">
                  <button
                    type="button"
                    className="project-card-action-btn"
                    onClick={() => setRenamingProject(project)}
                    title="重命名"
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="project-card-action-btn project-card-action-danger"
                    onClick={() => {
                      if (window.confirm(`确定要归档「${project.name}」吗？归档后可从数据库恢复。`)) {
                        void archiveProject(project);
                      }
                    }}
                    title="归档"
                  >
                    归档
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onSubmit={createProject}
        />
      )}

      {renamingProject && (
        <RenameModal
          name={renamingProject.name}
          onClose={() => setRenamingProject(null)}
          onSave={(newName) => renameProject(renamingProject, newName)}
        />
      )}
    </div>
  );
}
