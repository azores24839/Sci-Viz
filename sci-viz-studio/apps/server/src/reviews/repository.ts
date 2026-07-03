import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { ReviewLink, ReviewResponse } from '@studio/contracts';

export interface StoredReviewLink extends ReviewLink { ownerUserId: string; tokenHash: string }
export interface ReviewAuditEvent { id: string; reviewLinkId: string; projectId: string; action: 'CREATED' | 'ACCESSED' | 'SUBMITTED' | 'REVOKED'; createdAt: string }
export interface ReviewRepository {
  saveLink(link: StoredReviewLink): Promise<void>;
  findLinkByHash(tokenHash: string): Promise<StoredReviewLink | undefined>;
  listLinks(projectId: string): Promise<StoredReviewLink[]>;
  revokeLink(id: string, ownerUserId: string, revokedAt: string): Promise<boolean>;
  touchLink(id: string, accessedAt: string): Promise<void>;
  saveResponse(response: ReviewResponse): Promise<boolean>;
  listResponses(projectId: string): Promise<ReviewResponse[]>;
  addAudit(event: ReviewAuditEvent): Promise<void>;
  listAudit(projectId: string): Promise<ReviewAuditEvent[]>;
}

interface FileState { links: StoredReviewLink[]; responses: ReviewResponse[]; audit: ReviewAuditEvent[] }
const empty = (): FileState => ({ links: [], responses: [], audit: [] });

export class FileReviewRepository implements ReviewRepository {
  private queue = Promise.resolve();
  constructor(private filePath: string) {}
  private async read(): Promise<FileState> { try { const value = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Partial<FileState>; return { links: value.links ?? [], responses: value.responses ?? [], audit: value.audit ?? [] }; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error; } }
  private async write(state: FileState) { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.tmp`; await fs.writeFile(temp, JSON.stringify(state, null, 2)); await fs.rename(temp, this.filePath); }
  private serial<T>(fn: () => Promise<T>): Promise<T> { const next = this.queue.then(fn, fn); this.queue = next.then(() => undefined, () => undefined); return next; }
  saveLink(link: StoredReviewLink) { return this.serial(async () => { const state = await this.read(); state.links.push(link); await this.write(state); }); }
  findLinkByHash(tokenHash: string) { return this.serial(async () => (await this.read()).links.find((link) => link.tokenHash === tokenHash)); }
  listLinks(projectId: string) { return this.serial(async () => (await this.read()).links.filter((link) => link.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }
  revokeLink(id: string, ownerUserId: string, revokedAt: string) { return this.serial(async () => { const state = await this.read(); const index = state.links.findIndex((link) => link.id === id && link.ownerUserId === ownerUserId); if (index < 0) return false; state.links[index] = { ...state.links[index]!, revokedAt }; await this.write(state); return true; }); }
  touchLink(id: string, accessedAt: string) { return this.serial(async () => { const state = await this.read(); const index = state.links.findIndex((link) => link.id === id); if (index >= 0) { state.links[index] = { ...state.links[index]!, lastAccessedAt: accessedAt }; await this.write(state); } }); }
  saveResponse(response: ReviewResponse) { return this.serial(async () => { const state = await this.read(); if (state.responses.some((item) => item.reviewLinkId === response.reviewLinkId)) return false; state.responses.push(response); await this.write(state); return true; }); }
  listResponses(projectId: string) { return this.serial(async () => (await this.read()).responses.filter((item) => item.projectId === projectId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))); }
  addAudit(event: ReviewAuditEvent) { return this.serial(async () => { const state = await this.read(); state.audit.push(event); await this.write(state); }); }
  listAudit(projectId: string) { return this.serial(async () => (await this.read()).audit.filter((item) => item.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }
}

export class PostgresReviewRepository implements ReviewRepository {
  private sql; private ready;
  constructor(url: string) { this.sql = postgres(url, { max: 10 }); this.ready = this.initialize(); }
  private async initialize() {
    await this.sql`create table if not exists studio_review_link (id text primary key, project_id text not null, owner_user_id text not null, token_hash text unique not null, document jsonb not null, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null)`;
    await this.sql`create index if not exists studio_review_link_project_idx on studio_review_link(project_id, created_at desc)`;
    await this.sql`create table if not exists studio_review_response (id text primary key, review_link_id text unique not null, project_id text not null, document jsonb not null, submitted_at timestamptz not null)`;
    await this.sql`create table if not exists studio_review_audit (id text primary key, project_id text not null, review_link_id text not null, document jsonb not null, created_at timestamptz not null)`;
  }
  async saveLink(link: StoredReviewLink) { await this.ready; await this.sql`insert into studio_review_link (id, project_id, owner_user_id, token_hash, document, expires_at, revoked_at, created_at) values (${link.id}, ${link.projectId}, ${link.ownerUserId}, ${link.tokenHash}, ${this.sql.json(JSON.parse(JSON.stringify(link)))}, ${link.expiresAt}, ${link.revokedAt ?? null}, ${link.createdAt})`; }
  async findLinkByHash(tokenHash: string) { await this.ready; const rows = await this.sql`select document from studio_review_link where token_hash=${tokenHash} limit 1`; return rows[0]?.document as StoredReviewLink | undefined; }
  async listLinks(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_review_link where project_id=${projectId} order by created_at desc`; return rows.map((row) => row.document as StoredReviewLink); }
  async revokeLink(id: string, ownerUserId: string, revokedAt: string) { await this.ready; const rows = await this.sql`update studio_review_link set revoked_at=${revokedAt}, document=jsonb_set(document, '{revokedAt}', to_jsonb(${revokedAt}::text)) where id=${id} and owner_user_id=${ownerUserId} returning id`; return rows.length > 0; }
  async touchLink(id: string, accessedAt: string) { await this.ready; await this.sql`update studio_review_link set document=jsonb_set(document, '{lastAccessedAt}', to_jsonb(${accessedAt}::text)) where id=${id}`; }
  async saveResponse(response: ReviewResponse) { await this.ready; const rows = await this.sql`insert into studio_review_response (id, review_link_id, project_id, document, submitted_at) values (${response.id}, ${response.reviewLinkId}, ${response.projectId}, ${this.sql.json(response)}, ${response.submittedAt}) on conflict(review_link_id) do nothing returning id`; return rows.length > 0; }
  async listResponses(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_review_response where project_id=${projectId} order by submitted_at desc`; return rows.map((row) => row.document as ReviewResponse); }
  async addAudit(event: ReviewAuditEvent) { await this.ready; await this.sql`insert into studio_review_audit (id, project_id, review_link_id, document, created_at) values (${event.id}, ${event.projectId}, ${event.reviewLinkId}, ${this.sql.json(JSON.parse(JSON.stringify(event)))}, ${event.createdAt})`; }
  async listAudit(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_review_audit where project_id=${projectId} order by created_at desc`; return rows.map((row) => row.document as ReviewAuditEvent); }
}

export function createReviewRepository(env: NodeJS.ProcessEnv): ReviewRepository {
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresReviewRepository(env.DATABASE_URL);
  return new FileReviewRepository(path.join(path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio'), 'reviews.json'));
}
