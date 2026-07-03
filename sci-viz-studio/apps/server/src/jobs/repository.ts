import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { AgentJob } from '@studio/contracts';

export interface AgentJobRepository {
  create(job: AgentJob): Promise<AgentJob>;
  get(id: string): Promise<AgentJob | undefined>;
  findByIdempotencyKey(ownerUserId: string, key: string): Promise<AgentJob | undefined>;
  claimNext(): Promise<AgentJob | undefined>;
  save(job: AgentJob): Promise<void>;
  recoverInterrupted(): Promise<number>;
}

export class FileAgentJobRepository implements AgentJobRepository {
  private queue = Promise.resolve();
  constructor(private filePath: string) {}
  private async read(): Promise<AgentJob[]> { try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as AgentJob[]; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; } }
  private async write(jobs: AgentJob[]) { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const temporary = `${this.filePath}.tmp`; await fs.writeFile(temporary, JSON.stringify(jobs, null, 2)); await fs.rename(temporary, this.filePath); }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const next = this.queue.then(operation, operation); this.queue = next.then(() => undefined, () => undefined); return next; }
  create(job: AgentJob) { return this.serial(async () => { const jobs = await this.read(); const existing = jobs.find((item) => item.ownerUserId === job.ownerUserId && item.idempotencyKey === job.idempotencyKey); if (existing) return existing; jobs.push(job); await this.write(jobs); return job; }); }
  get(id: string) { return this.serial(async () => (await this.read()).find((job) => job.id === id)); }
  findByIdempotencyKey(ownerUserId: string, key: string) { return this.serial(async () => (await this.read()).find((job) => job.ownerUserId === ownerUserId && job.idempotencyKey === key)); }
  claimNext() { return this.serial(async () => { const jobs = await this.read(); const index = jobs.findIndex((job) => job.status === 'QUEUED' && job.availableAt <= new Date().toISOString()); if (index < 0) return undefined; const stamp = new Date().toISOString(); const claimed: AgentJob = { ...jobs[index]!, status: 'RUNNING', attempt: jobs[index]!.attempt + 1, startedAt: stamp, updatedAt: stamp }; jobs[index] = claimed; await this.write(jobs); return claimed; }); }
  save(job: AgentJob) { return this.serial(async () => { const jobs = await this.read(); const index = jobs.findIndex((item) => item.id === job.id); if (index < 0) jobs.push(job); else jobs[index] = job; await this.write(jobs); }); }
  recoverInterrupted() { return this.serial(async () => { const jobs = await this.read(); let count = 0; const stamp = new Date().toISOString(); for (let index = 0; index < jobs.length; index += 1) { const job = jobs[index]!; if (job.status === 'RUNNING') { jobs[index] = { ...job, status: 'QUEUED', availableAt: stamp, updatedAt: stamp }; count += 1; } } if (count) await this.write(jobs); return count; }); }
}

export class PostgresAgentJobRepository implements AgentJobRepository {
  private sql; private ready;
  constructor(databaseUrl: string) { this.sql = postgres(databaseUrl, { max: 10 }); this.ready = this.initialize(); }
  private async initialize() {
    await this.sql`create table if not exists studio_agent_job (
      id text primary key, project_id text not null, owner_user_id text not null,
      idempotency_key text not null, status text not null, attempt int not null default 0,
      available_at timestamptz not null, document jsonb not null,
      created_at timestamptz not null, updated_at timestamptz not null,
      unique(owner_user_id, idempotency_key)
    )`;
    await this.sql`create index if not exists studio_agent_job_queue_idx on studio_agent_job(status, available_at)`;
  }
  async create(job: AgentJob) { await this.ready; const rows = await this.sql`insert into studio_agent_job (id, project_id, owner_user_id, idempotency_key, status, attempt, available_at, document, created_at, updated_at) values (${job.id}, ${job.projectId}, ${job.ownerUserId}, ${job.idempotencyKey}, ${job.status}, ${job.attempt}, ${job.availableAt}, ${this.sql.json(job)}, ${job.createdAt}, ${job.updatedAt}) on conflict(owner_user_id, idempotency_key) do update set idempotency_key=excluded.idempotency_key returning document`; return rows[0]!.document as AgentJob; }
  async get(id: string) { await this.ready; const rows = await this.sql`select document from studio_agent_job where id=${id} limit 1`; return rows[0]?.document as AgentJob | undefined; }
  async findByIdempotencyKey(ownerUserId: string, key: string) { await this.ready; const rows = await this.sql`select document from studio_agent_job where owner_user_id=${ownerUserId} and idempotency_key=${key} limit 1`; return rows[0]?.document as AgentJob | undefined; }
  async claimNext() {
    await this.ready;
    const rows = await this.sql.begin(async (sql) => {
      const candidates = await sql`select id, document from studio_agent_job where status='QUEUED' and available_at <= now() order by available_at, created_at for update skip locked limit 1`;
      if (!candidates[0]) return [];
      const current = candidates[0].document as AgentJob; const stamp = new Date().toISOString(); const claimed: AgentJob = { ...current, status: 'RUNNING', attempt: current.attempt + 1, startedAt: stamp, updatedAt: stamp };
      await sql`update studio_agent_job set status='RUNNING', attempt=${claimed.attempt}, document=${sql.json(claimed)}, updated_at=${stamp} where id=${claimed.id}`;
      return [claimed];
    });
    return rows[0];
  }
  async save(job: AgentJob) { await this.ready; await this.sql`update studio_agent_job set status=${job.status}, attempt=${job.attempt}, available_at=${job.availableAt}, document=${this.sql.json(job)}, updated_at=${job.updatedAt} where id=${job.id}`; }
  async recoverInterrupted() { await this.ready; const stamp = new Date().toISOString(); const rows = await this.sql`select document from studio_agent_job where status='RUNNING'`; for (const row of rows) { const job = row.document as AgentJob; await this.save({ ...job, status: 'QUEUED', availableAt: stamp, updatedAt: stamp }); } return rows.length; }
}

export function createAgentJobRepository(env: NodeJS.ProcessEnv): AgentJobRepository {
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresAgentJobRepository(env.DATABASE_URL);
  const dataRoot = path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio');
  return new FileAgentJobRepository(path.join(dataRoot, 'agent-jobs.json'));
}
