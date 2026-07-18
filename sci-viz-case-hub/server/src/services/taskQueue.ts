export class TaskQueue {
  private readonly waiting: Array<() => Promise<void>> = [];
  private active = 0;

  constructor(
    private readonly concurrency: number,
    private readonly maxWaiting: number,
    private readonly onError: (error: unknown) => void = () => {},
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('TaskQueue concurrency must be positive');
    if (!Number.isInteger(maxWaiting) || maxWaiting < 0) throw new Error('TaskQueue maxWaiting must not be negative');
  }

  tryEnqueue(task: () => Promise<void>): boolean {
    if (this.active >= this.concurrency && this.waiting.length >= this.maxWaiting) return false;
    this.waiting.push(task);
    this.drain();
    return true;
  }

  get size() {
    return { active: this.active, waiting: this.waiting.length };
  }

  private drain() {
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const task = this.waiting.shift()!;
      this.active += 1;
      void task()
        .catch(this.onError)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

export type EnqueueStatus = 'queued' | 'duplicate' | 'full';

export class KeyedTaskQueue {
  private readonly keys = new Set<string>();
  private readonly queue: TaskQueue;

  constructor(concurrency: number, maxWaiting: number, onError: (error: unknown) => void = () => {}) {
    this.queue = new TaskQueue(concurrency, maxWaiting, onError);
  }

  tryEnqueue(key: string, task: () => Promise<void>): EnqueueStatus {
    if (this.keys.has(key)) return 'duplicate';
    this.keys.add(key);
    const accepted = this.queue.tryEnqueue(async () => {
      try {
        await task();
      } finally {
        this.keys.delete(key);
      }
    });
    if (!accepted) {
      this.keys.delete(key);
      return 'full';
    }
    return 'queued';
  }
}
