import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

export interface UsageSnapshot { used: number; limit: number; remaining: number; resetsAt: string }
export interface UsageLimiter {
  consume(userId: string, amount?: number): Promise<void>;
  getUsage(userId: string): Promise<UsageSnapshot>;
}
const day = () => new Date().toISOString().slice(0, 10);
const nextReset = () => {
  const value = new Date();
  value.setUTCHours(24, 0, 0, 0);
  return value.toISOString();
};

class FileUsageLimiter implements UsageLimiter {
  private queue = Promise.resolve();
  constructor(private filePath: string, private limit: number) {}
  async consume(userId: string, amount = 1) {
    const operation = this.queue.then(async () => {
      let values: Record<string, number> = {};
      try { values = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Record<string, number>; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const key = `${day()}:${userId}`; const next = (values[key] ?? 0) + amount;
      if (next > this.limit) throw new Error('AI_DAILY_QUOTA_EXCEEDED');
      values[key] = next; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); await fs.writeFile(this.filePath, JSON.stringify(values));
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
  async getUsage(userId: string) {
    const operation = this.queue.then(async () => {
      let values: Record<string, number> = {};
      try { values = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Record<string, number>; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const used = values[`${day()}:${userId}`] ?? 0;
      return { used, limit: this.limit, remaining: Math.max(0, this.limit - used), resetsAt: nextReset() };
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

class PostgresUsageLimiter implements UsageLimiter {
  private sql; private ready;
  constructor(url: string, private limit: number) { this.sql = postgres(url, { max: 5 }); this.ready = this.sql`create table if not exists studio_daily_usage (user_id text, usage_day date, ai_tasks int not null default 0, primary key(user_id, usage_day))`; }
  async consume(userId: string, amount = 1) {
    await this.ready;
    const rows = await this.sql.begin(async (sql) => {
      await sql`insert into studio_daily_usage (user_id, usage_day, ai_tasks) values (${userId}, current_date, 0) on conflict do nothing`;
      return sql`update studio_daily_usage set ai_tasks = ai_tasks + ${amount} where user_id = ${userId} and usage_day = current_date and ai_tasks + ${amount} <= ${this.limit} returning ai_tasks`;
    });
    if (rows.length === 0) throw new Error('AI_DAILY_QUOTA_EXCEEDED');
  }
  async getUsage(userId: string) {
    await this.ready;
    const rows = await this.sql`select ai_tasks from studio_daily_usage where user_id = ${userId} and usage_day = current_date limit 1`;
    const used = Number(rows[0]?.ai_tasks ?? 0);
    return { used, limit: this.limit, remaining: Math.max(0, this.limit - used), resetsAt: nextReset() };
  }
}

export function createUsageLimiter(env: NodeJS.ProcessEnv): UsageLimiter {
  const limit = Number(env.USER_DAILY_AI_LIMIT ?? 50);
  if (env.DATABASE_URL?.startsWith('postgres')) return new PostgresUsageLimiter(env.DATABASE_URL, limit);
  return new FileUsageLimiter(path.resolve(process.cwd(), env.USAGE_DATABASE_PATH ?? '../../data/studio/daily-usage.json'), limit);
}
