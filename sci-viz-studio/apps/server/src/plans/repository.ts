import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import type { CaptureItem, PlanDocument, PlanVersion, ShotCard } from '@studio/contracts';

export class PlanConflictError extends Error { constructor() { super('PLAN_VERSION_CONFLICT'); } }

export interface PlanRepository {
  getPlan(projectId: string): Promise<PlanDocument | undefined>;
  savePlan(ownerUserId: string, plan: PlanDocument, version: PlanVersion, expectedVersion: number): Promise<void>;
  listVersions(projectId: string): Promise<PlanVersion[]>;
  getVersion(projectId: string, version: number): Promise<PlanVersion | undefined>;
  listShotCards(projectId: string): Promise<ShotCard[]>;
  getShotCard(id: string): Promise<ShotCard | undefined>;
  saveShotCard(ownerUserId: string, card: ShotCard, expectedRevision?: number): Promise<void>;
  removeShotCard(ownerUserId: string, id: string, expectedRevision: number): Promise<void>;
  reorderShotCards(ownerUserId: string, projectId: string, orderedIds: string[]): Promise<void>;
  listCaptureItems(projectId: string): Promise<CaptureItem[]>;
  saveCaptureItem(ownerUserId: string, item: CaptureItem, expectedRevision: number): Promise<void>;
}

interface FileState { plans: PlanDocument[]; versions: PlanVersion[]; cards: ShotCard[]; captures: CaptureItem[] }
const empty = (): FileState => ({ plans: [], versions: [], cards: [], captures: [] });

export class FilePlanRepository implements PlanRepository {
  private queue = Promise.resolve();
  constructor(private filePath: string) {}
  private async read(): Promise<FileState> { try { return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as FileState; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error; } }
  private async write(state: FileState) { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.tmp`; await fs.writeFile(temp, JSON.stringify(state, null, 2)); await fs.rename(temp, this.filePath); }
  private serial<T>(operation: () => Promise<T>): Promise<T> { const next = this.queue.then(operation, operation); this.queue = next.then(() => undefined, () => undefined); return next; }
  getPlan(projectId: string) { return this.serial(async () => (await this.read()).plans.find((item) => item.projectId === projectId)); }
  savePlan(_ownerUserId: string, plan: PlanDocument, version: PlanVersion, expectedVersion: number) { return this.serial(async () => { const state = await this.read(); const index = state.plans.findIndex((item) => item.projectId === plan.projectId); const current = index < 0 ? 0 : state.plans[index]!.currentVersion; if (current !== expectedVersion) throw new PlanConflictError(); if (index < 0) state.plans.push(plan); else state.plans[index] = plan; state.versions.push(version); await this.write(state); }); }
  listVersions(projectId: string) { return this.serial(async () => (await this.read()).versions.filter((item) => item.projectId === projectId).sort((a, b) => b.version - a.version)); }
  getVersion(projectId: string, version: number) { return this.serial(async () => (await this.read()).versions.find((item) => item.projectId === projectId && item.version === version)); }
  listShotCards(projectId: string) { return this.serial(async () => (await this.read()).cards.filter((item) => item.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder)); }
  getShotCard(id: string) { return this.serial(async () => (await this.read()).cards.find((item) => item.id === id)); }
  saveShotCard(_ownerUserId: string, card: ShotCard, expectedRevision?: number) { return this.serial(async () => { const state = await this.read(); const index = state.cards.findIndex((item) => item.id === card.id); if (index >= 0 && expectedRevision !== undefined && state.cards[index]!.revision !== expectedRevision) throw new PlanConflictError(); if (index < 0) { state.cards.push(card); state.captures.push({ shotCardId: card.id, projectId: card.projectId, status: 'TODO', fileNumber: '', note: '', revision: 1, updatedAt: card.createdAt }); } else state.cards[index] = card; await this.write(state); }); }
  removeShotCard(_ownerUserId: string, id: string, expectedRevision: number) { return this.serial(async () => { const state = await this.read(); const card = state.cards.find((item) => item.id === id); if (!card || card.revision !== expectedRevision) throw new PlanConflictError(); state.cards = state.cards.filter((item) => item.id !== id); state.captures = state.captures.filter((item) => item.shotCardId !== id); await this.write(state); }); }
  reorderShotCards(_ownerUserId: string, projectId: string, orderedIds: string[]) { return this.serial(async () => { const state = await this.read(); const currentIds = state.cards.filter((item) => item.projectId === projectId).map((item) => item.id).sort(); if (currentIds.join(',') !== [...orderedIds].sort().join(',')) throw new PlanConflictError(); state.cards = state.cards.map((item) => item.projectId === projectId ? { ...item, sortOrder: orderedIds.indexOf(item.id), revision: item.revision + 1, updatedAt: new Date().toISOString() } : item); await this.write(state); }); }
  listCaptureItems(projectId: string) { return this.serial(async () => (await this.read()).captures.filter((item) => item.projectId === projectId)); }
  saveCaptureItem(_ownerUserId: string, item: CaptureItem, expectedRevision: number) { return this.serial(async () => { const state = await this.read(); const index = state.captures.findIndex((entry) => entry.shotCardId === item.shotCardId); if (index < 0 || state.captures[index]!.revision !== expectedRevision) throw new PlanConflictError(); state.captures[index] = item; await this.write(state); }); }
}

export class PostgresPlanRepository implements PlanRepository {
  private sql; private ready;
  constructor(url: string) { this.sql = postgres(url, { max: 10 }); this.ready = this.initialize(); }
  private async initialize() {
    await this.sql`create table if not exists studio_plan (project_id text primary key, owner_user_id text not null, current_version int not null, document jsonb not null, created_at timestamptz not null, updated_at timestamptz not null)`;
    await this.sql`create table if not exists studio_plan_version (id text primary key, project_id text not null, owner_user_id text not null, version int not null, document jsonb not null, created_at timestamptz not null, unique(project_id, version))`;
    await this.sql`create index if not exists studio_plan_version_idx on studio_plan_version(project_id, version desc)`;
    await this.sql`create table if not exists studio_shot_card (id text primary key, project_id text not null, owner_user_id text not null, sort_order int not null, revision int not null, document jsonb not null, created_at timestamptz not null, updated_at timestamptz not null)`;
    await this.sql`create index if not exists studio_shot_project_idx on studio_shot_card(project_id, sort_order)`;
    await this.sql`create table if not exists studio_capture_item (shot_card_id text primary key, project_id text not null, owner_user_id text not null, revision int not null, document jsonb not null, updated_at timestamptz not null)`;
  }
  async getPlan(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_plan where project_id=${projectId} limit 1`; return rows[0]?.document as PlanDocument | undefined; }
  async savePlan(ownerUserId: string, plan: PlanDocument, version: PlanVersion, expectedVersion: number) { await this.ready; const rows = await this.sql.begin(async (sql) => { const existing = await sql`select current_version from studio_plan where project_id=${plan.projectId} for update`; const current = Number(existing[0]?.current_version ?? 0); if (current !== expectedVersion) return []; if (current === 0) await sql`insert into studio_plan (project_id, owner_user_id, current_version, document, created_at, updated_at) values (${plan.projectId}, ${ownerUserId}, ${plan.currentVersion}, ${sql.json(plan)}, ${plan.createdAt}, ${plan.updatedAt})`; else await sql`update studio_plan set current_version=${plan.currentVersion}, document=${sql.json(plan)}, updated_at=${plan.updatedAt} where project_id=${plan.projectId} and owner_user_id=${ownerUserId}`; await sql`insert into studio_plan_version (id, project_id, owner_user_id, version, document, created_at) values (${version.id}, ${version.projectId}, ${ownerUserId}, ${version.version}, ${sql.json(version)}, ${version.createdAt})`; return [plan.projectId]; }); if (!rows.length) throw new PlanConflictError(); }
  async listVersions(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_plan_version where project_id=${projectId} order by version desc`; return rows.map((row) => row.document as PlanVersion); }
  async getVersion(projectId: string, version: number) { await this.ready; const rows = await this.sql`select document from studio_plan_version where project_id=${projectId} and version=${version} limit 1`; return rows[0]?.document as PlanVersion | undefined; }
  async listShotCards(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_shot_card where project_id=${projectId} order by sort_order`; return rows.map((row) => row.document as ShotCard); }
  async getShotCard(id: string) { await this.ready; const rows = await this.sql`select document from studio_shot_card where id=${id} limit 1`; return rows[0]?.document as ShotCard | undefined; }
  async saveShotCard(ownerUserId: string, card: ShotCard, expectedRevision?: number) { await this.ready; if (expectedRevision === undefined) { await this.sql.begin(async (sql) => { await sql`insert into studio_shot_card (id, project_id, owner_user_id, sort_order, revision, document, created_at, updated_at) values (${card.id}, ${card.projectId}, ${ownerUserId}, ${card.sortOrder}, ${card.revision}, ${sql.json(card)}, ${card.createdAt}, ${card.updatedAt})`; const capture: CaptureItem = { shotCardId: card.id, projectId: card.projectId, status: 'TODO', fileNumber: '', note: '', revision: 1, updatedAt: card.createdAt }; await sql`insert into studio_capture_item (shot_card_id, project_id, owner_user_id, revision, document, updated_at) values (${card.id}, ${card.projectId}, ${ownerUserId}, 1, ${sql.json(capture)}, ${card.createdAt})`; }); return; } const rows = await this.sql`update studio_shot_card set sort_order=${card.sortOrder}, revision=${card.revision}, document=${this.sql.json(card)}, updated_at=${card.updatedAt} where id=${card.id} and owner_user_id=${ownerUserId} and revision=${expectedRevision} returning id`; if (!rows.length) throw new PlanConflictError(); }
  async removeShotCard(ownerUserId: string, id: string, expectedRevision: number) { await this.ready; const rows = await this.sql.begin(async (sql) => { const removed = await sql`delete from studio_shot_card where id=${id} and owner_user_id=${ownerUserId} and revision=${expectedRevision} returning id`; if (!removed.length) return []; await sql`delete from studio_capture_item where shot_card_id=${id} and owner_user_id=${ownerUserId}`; return removed; }); if (!rows.length) throw new PlanConflictError(); }
  async reorderShotCards(ownerUserId: string, projectId: string, orderedIds: string[]) { await this.ready; await this.sql.begin(async (sql) => { const rows = await sql`select id from studio_shot_card where project_id=${projectId} and owner_user_id=${ownerUserId} for update`; const current = rows.map((row) => String(row.id)).sort(); if (current.join(',') !== [...orderedIds].sort().join(',')) throw new PlanConflictError(); for (let index = 0; index < orderedIds.length; index += 1) { const id = orderedIds[index]!; const existing = await sql`select document from studio_shot_card where id=${id}`; const card = existing[0]!.document as ShotCard; const updated = { ...card, sortOrder: index, revision: card.revision + 1, updatedAt: new Date().toISOString() }; await sql`update studio_shot_card set sort_order=${index}, revision=${updated.revision}, document=${sql.json(updated)}, updated_at=${updated.updatedAt} where id=${id}`; } }); }
  async listCaptureItems(projectId: string) { await this.ready; const rows = await this.sql`select document from studio_capture_item where project_id=${projectId}`; return rows.map((row) => row.document as CaptureItem); }
  async saveCaptureItem(ownerUserId: string, item: CaptureItem, expectedRevision: number) { await this.ready; const rows = await this.sql`update studio_capture_item set revision=${item.revision}, document=${this.sql.json(item)}, updated_at=${item.updatedAt} where shot_card_id=${item.shotCardId} and owner_user_id=${ownerUserId} and revision=${expectedRevision} returning shot_card_id`; if (!rows.length) throw new PlanConflictError(); }
}

export function createPlanRepository(env: NodeJS.ProcessEnv): PlanRepository {
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresPlanRepository(env.DATABASE_URL);
  return new FilePlanRepository(path.join(path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio'), 'plans.json'));
}
