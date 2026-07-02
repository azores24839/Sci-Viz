import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { SourceDocument } from '@studio/contracts';

export interface SourceRepository {
  list(projectId: string): Promise<SourceDocument[]>;
  get(id: string): Promise<SourceDocument | undefined>;
  save(source: SourceDocument): Promise<void>;
  remove(id: string): Promise<void>;
  listPending(): Promise<SourceDocument[]>;
}

export class FileSourceRepository implements SourceRepository {
  private queue = Promise.resolve();
  constructor(private readonly filePath: string) {}

  private async read(): Promise<SourceDocument[]> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as SourceDocument[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async write(items: SourceDocument[]) {
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

  list(projectId: string) { return this.serial(async () => (await this.read()).filter((item) => item.projectId === projectId)); }
  get(id: string) { return this.serial(async () => (await this.read()).find((item) => item.id === id)); }
  save(source: SourceDocument) {
    return this.serial(async () => {
      const items = await this.read();
      const index = items.findIndex((item) => item.id === source.id);
      if (index >= 0) items[index] = source;
      else items.push(source);
      await this.write(items);
    });
  }
  remove(id: string) { return this.serial(async () => this.write((await this.read()).filter((item) => item.id !== id))); }
  listPending() { return this.serial(async () => (await this.read()).filter((item) => ['QUEUED', 'PARSING', 'SUMMARIZING'].includes(item.status))); }
}

export class PostgresSourceRepository implements SourceRepository {
  private readonly sql;
  private ready: Promise<void>;
  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 10 });
    this.ready = this.initialize();
  }
  private async initialize() {
    await this.sql`create table if not exists studio_source_document (
      id text primary key,
      project_id text not null,
      status text not null,
      document jsonb not null,
      updated_at timestamptz not null default now()
    )`;
    await this.sql`create index if not exists studio_source_project_idx on studio_source_document(project_id)`;
    await this.sql`create index if not exists studio_source_status_idx on studio_source_document(status)`;
  }
  async list(projectId: string) {
    await this.ready;
    const rows = await this.sql`select document from studio_source_document where project_id = ${projectId} order by updated_at desc`;
    return rows.map((row) => row.document as SourceDocument);
  }
  async get(id: string) {
    await this.ready;
    const rows = await this.sql`select document from studio_source_document where id = ${id} limit 1`;
    return rows[0]?.document as SourceDocument | undefined;
  }
  async save(source: SourceDocument) {
    await this.ready;
    await this.sql`insert into studio_source_document (id, project_id, status, document, updated_at)
      values (${source.id}, ${source.projectId}, ${source.status}, ${this.sql.json(source)}, now())
      on conflict (id) do update set status = excluded.status, document = excluded.document, updated_at = now()`;
  }
  async remove(id: string) { await this.ready; await this.sql`delete from studio_source_document where id = ${id}`; }
  async listPending() {
    await this.ready;
    const rows = await this.sql`select document from studio_source_document where status in ('QUEUED','PARSING','SUMMARIZING') order by updated_at`;
    return rows.map((row) => row.document as SourceDocument);
  }
}

export function createSourceRepository(env: NodeJS.ProcessEnv): SourceRepository {
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresSourceRepository(env.DATABASE_URL);
  const dataRoot = path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio');
  if (env.NODE_ENV === 'production') console.warn('[sources] DATABASE_URL is absent; using single-node file metadata store');
  return new FileSourceRepository(path.join(dataRoot, 'sources.json'));
}
