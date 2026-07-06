import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectGoal, StudioProject } from '@studio/contracts';
import { apiFetch } from '../api/client';
import { ProjectStarter } from '../features/projects/ProjectStarter';
import { FeedbackWidget } from '../features/feedback/FeedbackWidget';
import { UsageProfile } from '../auth/UsageProfile';

const projectGoalLabel: Record<ProjectGoal, string> = {
  ACADEMIC_COMMUNICATION: '学术传播',
  PUBLIC_COMMUNICATION: '公众传播',
  RECRUITING_BRAND: '招生/招聘/团队品牌',
  INDUSTRY_COLLABORATION: '产业转化/合作',
};

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '进行中',
  COMPLETED: '已完成',
  ARCHIVED: '已归档',
};

type PageState = 'loading' | 'empty' | 'error' | 'ready';

function formatTime(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      <aside className="projects-sidebar" aria-label="首页导航">
        <div className="projects-brand">
          <img className="projects-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="研影" />
        </div>
        <nav className="projects-nav">
          <Link to="/" className="projects-nav-item is-active" aria-current="page">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v14h-17z" /></svg><span>所有项目</span>
          </Link>
          <div className="projects-nav-item projects-account-item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" /></svg><span>账户</span>
          </div>
        </nav>
        <div className="projects-sidebar-bottom">
          <FeedbackWidget context={{ page: '项目列表' }} triggerClassName="projects-nav-item projects-feedback-item" triggerLabel={<><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.5 2.5 0 0 1 4.8 1c0 2-2.5 2.1-2.5 4M12 17.5h.01" /></svg><span>问题反馈</span></>} />
        </div>
      </aside>

      <div className="projects-main">
        <div className="projects-usage"><UsageProfile /></div>
        <main className="projects-body">
        <ProjectStarter />

        <section className="recent-projects" aria-labelledby="recent-projects-title">
          <div className="recent-projects-head"><h2 id="recent-projects-title">最近项目</h2></div>
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
          <div className="recent-projects-empty">还没有项目，从上方开始。</div>
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
        </section>
        </main>
      </div>

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
