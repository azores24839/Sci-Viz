import fs from 'node:fs/promises';
import path from 'node:path';

export interface FeedbackEntry {
  id: string;
  userId: string;
  category: 'BUG' | 'SUGGESTION' | 'INACCURATE' | 'OTHER';
  description: string;
  context: string;
  createdAt: string;
}

interface FeedbackStore {
  entries: FeedbackEntry[];
}

const emptyStore = (): FeedbackStore => ({ entries: [] });

export class FileFeedbackRepository {
  private queue = Promise.resolve();
  constructor(private filePath: string) {}

  private async read(): Promise<FeedbackStore> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as FeedbackStore;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyStore();
      throw error;
    }
  }

  private async write(store: FeedbackStore) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(store, null, 2));
    await fs.rename(temporary, this.filePath);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async add(entry: FeedbackEntry) {
    return this.serial(async () => {
      const store = await this.read();
      store.entries.push(entry);
      await this.write(store);
      return entry;
    });
  }

  async list(): Promise<FeedbackEntry[]> {
    return this.serial(async () => (await this.read()).entries);
  }
}

export function createFeedbackRepository(env: NodeJS.ProcessEnv): FileFeedbackRepository {
  const dataRoot = path.resolve(process.cwd(), env.DATABASE_PATH ?? '../../data/studio');
  return new FileFeedbackRepository(path.join(dataRoot, 'feedback.json'));
}
