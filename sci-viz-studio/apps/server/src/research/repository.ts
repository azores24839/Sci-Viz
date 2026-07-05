import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { ResearchTask } from '@studio/contracts';

export interface ResearchRepository {
  list(projectId: string): Promise<ResearchTask[]>;
  get(id: string): Promise<ResearchTask | undefined>;
  save(task: ResearchTask): Promise<void>;
  listPending(): Promise<ResearchTask[]>;
}

export class FileResearchRepository implements ResearchRepository {
  private queue = Promise.resolve();
  constructor(private readonly filePath: string) {}
  private async read(): Promise<ResearchTask[]> {
    try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as ResearchTask[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  private async write(items: ResearchTask[]) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(items, null, 2));
    await fs.rename(temporary, this.filePath);
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
  list(projectId: string) { return this.serial(async () => (await this.read()).filter((item) => item.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }
  get(id: string) { return this.serial(async () => (await this.read()).find((item) => item.id === id)); }
  save(task: ResearchTask) { return this.serial(async () => { const items = await this.read(); const index = items.findIndex((item) => item.id === task.id); if (index >= 0) items[index] = task; else items.push(task); await this.write(items); }); }
  listPending() { return this.serial(async () => (await this.read()).filter((item) => item.status === 'QUEUED' || item.status === 'RUNNING')); }
}

export class PostgresResearchRepository implements ResearchRepository {
  private readonly sql;
  private readonly ready: Promise<void>;
  constructor(databaseUrl: string) { this.sql = postgres(databaseUrl, { max: 5 }); this.ready = this.initialize(); }
  private async initialize() {
    await this.sql`create table if not exists studio_research_task (id text primary key, project_id text not null, owner_user_id text not null, status text not null, document jsonb not null, created_at timestamptz not null, updated_at timestamptz not null)`;
    await this.sql`create index if not exists studio_research_project_idx on studio_research_task(project_id, created_at desc)`;
    await this.sql`create index if not exists studio_research_status_idx on studio_research_task(status, updated_at)`;
  }
  async list(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_research_task where project_id=${projectId} order by created_at desc`; return rows.map((row) => row.document as ResearchTask); }
  async get(id: string) { await this.ready; const rows = await this.sql`select document from studio_research_task where id=${id} limit 1`; return rows[0]?.document as ResearchTask | undefined; }
  async save(task: ResearchTask) { await this.ready; await this.sql`insert into studio_research_task (id, project_id, owner_user_id, status, document, created_at, updated_at) values (${task.id}, ${task.projectId}, ${task.ownerUserId}, ${task.status}, ${this.sql.json(task)}, ${task.createdAt}, ${task.updatedAt}) on conflict(id) do update set status=excluded.status, document=excluded.document, updated_at=excluded.updated_at`; }
  async listPending() { await this.ready; const rows = await this.sql`select document from studio_research_task where status in ('QUEUED','RUNNING') order by updated_at`; return rows.map((row) => row.document as ResearchTask); }
}

export function createResearchRepository(env: NodeJS.ProcessEnv): ResearchRepository {
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresResearchRepository(env.DATABASE_URL);
  return new FileResearchRepository(path.join(path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio'), 'research-tasks.json'));
}
