/** Entry limits bound retained public-source objects, not bytes or callers' own references. */
export const SOURCE_BOOK_CACHE_LIMIT = 24;
export const SOURCE_MANIFEST_CACHE_LIMIT = 32;
export const SEARCH_INDEX_CACHE_LIMIT = 2;

/** Keeps the most recently requested promises, including pending loads, without owning their lifetime. */
export class AsyncLruCache<Key, Value> {
  private readonly entries = new Map<Key, Promise<Value>>();
  readonly capacity: number;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('A source cache needs a positive integer capacity.');
    this.capacity = capacity;
  }

  get size(): number { return this.entries.size; }

  getOrLoad(key: Key, load: () => Value | PromiseLike<Value>): Promise<Value> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const pending = Promise.resolve().then(load).catch(error => {
      // An evicted older request may fail after the same key has been requested again.
      if (this.entries.get(key) === pending) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, pending);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    return pending;
  }
}

/** Bounds active expensive work to one task. Every queued caller still receives its own result. */
export class SequentialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<Value>(task: () => Value | PromiseLike<Value>): Promise<Value> {
    const result = this.tail.then(task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
