import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { ArtifactVersion, ProjectWorkflow, StudioProject } from '@studio/contracts';

export class VersionConflictError extends Error { constructor() { super('VERSION_CONFLICT'); } }

export interface WorkspaceRepository {
  listProjects(ownerUserId: string): Promise<StudioProject[]>;
  getProject(id: string): Promise<StudioProject | undefined>;
  saveProject(project: StudioProject, expectedUpdatedAt?: string): Promise<void>;
  getWorkflow(projectId: string): Promise<ProjectWorkflow | undefined>;
  saveWorkflow(ownerUserId: string, workflow: ProjectWorkflow, expectedRevision: number): Promise<void>;
  listArtifactVersions(projectId: string, nodeId?: string): Promise<ArtifactVersion[]>;
  saveArtifactVersion(ownerUserId: string, artifact: ArtifactVersion): Promise<void>;
}

interface FileState { projects: StudioProject[]; workflows: ProjectWorkflow[]; artifacts: ArtifactVersion[] }
const emptyState = (): FileState => ({ projects: [], workflows: [], artifacts: [] });

export class FileWorkspaceRepository implements WorkspaceRepository {
  private queue = Promise.resolve();
  constructor(private filePath: string) {}
  private async read(): Promise<FileState> {
    try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as FileState; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState(); throw error; }
  }
  private async write(state: FileState) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state, null, 2));
    await fs.rename(temporary, this.filePath);
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
  listProjects(ownerUserId: string) { return this.serial(async () => (await this.read()).projects.filter((project) => project.ownerUserId === ownerUserId && !project.archivedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))); }
  getProject(id: string) { return this.serial(async () => (await this.read()).projects.find((project) => project.id === id)); }
  saveProject(project: StudioProject, expectedUpdatedAt?: string) {
    return this.serial(async () => {
      const state = await this.read(); const index = state.projects.findIndex((item) => item.id === project.id);
      if (index >= 0 && expectedUpdatedAt && state.projects[index]!.updatedAt !== expectedUpdatedAt) throw new VersionConflictError();
      if (index >= 0) state.projects[index] = project; else state.projects.push(project);
      await this.write(state);
    });
  }
  getWorkflow(projectId: string) { return this.serial(async () => (await this.read()).workflows.find((workflow) => workflow.projectId === projectId)); }
  saveWorkflow(_ownerUserId: string, workflow: ProjectWorkflow, expectedRevision: number) {
    return this.serial(async () => {
      const state = await this.read(); const index = state.workflows.findIndex((item) => item.projectId === workflow.projectId);
      const currentRevision = index >= 0 ? state.workflows[index]!.revision : 0;
      if (currentRevision !== expectedRevision) throw new VersionConflictError();
      if (index >= 0) state.workflows[index] = workflow; else state.workflows.push(workflow);
      await this.write(state);
    });
  }
  listArtifactVersions(projectId: string, nodeId?: string) { return this.serial(async () => (await this.read()).artifacts.filter((item) => item.projectId === projectId && (!nodeId || item.nodeId === nodeId)).sort((a, b) => b.version - a.version)); }
  saveArtifactVersion(_ownerUserId: string, artifact: ArtifactVersion) {
    return this.serial(async () => { const state = await this.read(); if (state.artifacts.some((item) => item.projectId === artifact.projectId && item.nodeId === artifact.nodeId && item.version === artifact.version)) throw new VersionConflictError(); state.artifacts.push(artifact); await this.write(state); });
  }
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  private sql;
  private ready;
  constructor(databaseUrl: string) { this.sql = postgres(databaseUrl, { max: 10 }); this.ready = this.initialize(); }
  private async initialize() {
    await this.sql`create table if not exists studio_project (
      id text primary key, owner_user_id text not null, name text not null, status text not null,
      document jsonb not null, created_at timestamptz not null, updated_at timestamptz not null, archived_at timestamptz
    )`;
    await this.sql`create index if not exists studio_project_owner_idx on studio_project(owner_user_id, updated_at desc)`;
    await this.sql`create table if not exists studio_project_workflow (
      project_id text primary key references studio_project(id), owner_user_id text not null,
      template_id text not null, template_version int not null, revision int not null,
      document jsonb not null, created_at timestamptz not null, updated_at timestamptz not null
    )`;
    await this.sql`create index if not exists studio_workflow_owner_idx on studio_project_workflow(owner_user_id)`;
    await this.sql`create table if not exists studio_artifact_version (
      id text primary key, project_id text not null references studio_project(id), owner_user_id text not null,
      node_id text not null, version int not null, document jsonb not null, created_at timestamptz not null,
      unique(project_id, node_id, version)
    )`;
    await this.sql`create index if not exists studio_artifact_project_idx on studio_artifact_version(project_id, node_id, version desc)`;
  }
  async listProjects(ownerUserId: string) { await this.ready; const rows = await this.sql`select document from studio_project where owner_user_id = ${ownerUserId} and archived_at is null order by updated_at desc`; return rows.map((row) => row.document as StudioProject); }
  async getProject(id: string) { await this.ready; const rows = await this.sql`select document from studio_project where id = ${id} limit 1`; return rows[0]?.document as StudioProject | undefined; }
  async saveProject(project: StudioProject, expectedUpdatedAt?: string) {
    await this.ready;
    if (expectedUpdatedAt) {
      const rows = await this.sql`update studio_project set name=${project.name}, status=${project.status}, document=${this.sql.json(project)}, updated_at=${project.updatedAt}, archived_at=${project.archivedAt ?? null} where id=${project.id} and owner_user_id=${project.ownerUserId} and updated_at=${expectedUpdatedAt} returning id`;
      if (rows.length === 0) throw new VersionConflictError(); return;
    }
    await this.sql`insert into studio_project (id, owner_user_id, name, status, document, created_at, updated_at, archived_at) values (${project.id}, ${project.ownerUserId}, ${project.name}, ${project.status}, ${this.sql.json(project)}, ${project.createdAt}, ${project.updatedAt}, ${project.archivedAt ?? null}) on conflict(id) do update set name=excluded.name, status=excluded.status, document=excluded.document, updated_at=excluded.updated_at, archived_at=excluded.archived_at`;
  }
  async getWorkflow(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_project_workflow where project_id=${projectId} limit 1`; return rows[0]?.document as ProjectWorkflow | undefined; }
  async saveWorkflow(ownerUserId: string, workflow: ProjectWorkflow, expectedRevision: number) {
    await this.ready;
    if (expectedRevision === 0) {
      const rows = await this.sql`insert into studio_project_workflow (project_id, owner_user_id, template_id, template_version, revision, document, created_at, updated_at) values (${workflow.projectId}, ${ownerUserId}, ${workflow.templateId}, ${workflow.templateVersion}, ${workflow.revision}, ${this.sql.json(workflow)}, ${workflow.createdAt}, ${workflow.updatedAt}) on conflict do nothing returning project_id`;
      if (rows.length === 0) throw new VersionConflictError(); return;
    }
    const rows = await this.sql`update studio_project_workflow set revision=${workflow.revision}, document=${this.sql.json(workflow)}, updated_at=${workflow.updatedAt} where project_id=${workflow.projectId} and owner_user_id=${ownerUserId} and revision=${expectedRevision} returning project_id`;
    if (rows.length === 0) throw new VersionConflictError();
  }
  async listArtifactVersions(projectId: string, nodeId?: string) { await this.ready; const rows = nodeId ? await this.sql`select document from studio_artifact_version where project_id=${projectId} and node_id=${nodeId} order by version desc` : await this.sql`select document from studio_artifact_version where project_id=${projectId} order by created_at desc`; return rows.map((row) => row.document as ArtifactVersion); }
  async saveArtifactVersion(ownerUserId: string, artifact: ArtifactVersion) { await this.ready; try { await this.sql`insert into studio_artifact_version (id, project_id, owner_user_id, node_id, version, document, created_at) values (${artifact.id}, ${artifact.projectId}, ${ownerUserId}, ${artifact.nodeId}, ${artifact.version}, ${this.sql.json(artifact)}, ${artifact.createdAt})`; } catch (error) { if ((error as { code?: string }).code === '23505') throw new VersionConflictError(); throw error; } }
}

export function createWorkspaceRepository(env: NodeJS.ProcessEnv): WorkspaceRepository {
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresWorkspaceRepository(env.DATABASE_URL);
  const dataRoot = path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio');
  return new FileWorkspaceRepository(path.join(dataRoot, 'workspace.json'));
}
