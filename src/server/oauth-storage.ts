type StoredValue = {
  value: string;
  expiresAt?: number;
  metadata?: unknown;
};

/** KV-shaped storage for the OAuth library, backed by strongly consistent DO storage.
 * All callers must run through the same serialized request queue in oauth.ts.
 * The adapter implements expiry itself; expired records never validate as tokens.
 */
export class DurableOAuthStorage {
  constructor(private readonly storage: DurableObjectStorage) {}

  async get<T = string>(
    key: string,
    options?: string | { type?: string },
  ): Promise<T | null> {
    const stored = await this.storage.get<StoredValue>(`oauth:${key}`);
    if (!stored) return null;
    if (
      stored.expiresAt !== undefined &&
      stored.expiresAt <= Date.now() / 1000
    ) {
      await this.storage.delete(`oauth:${key}`);
      return null;
    }
    const type = typeof options === "string" ? options : options?.type;
    return (type === "json" ? JSON.parse(stored.value) : stored.value) as T;
  }

  async put(
    key: string,
    value: string,
    options?: {
      expiration?: number;
      expirationTtl?: number;
      metadata?: unknown;
    },
  ): Promise<void> {
    const expiresAt =
      options?.expiration ??
      (options?.expirationTtl === undefined
        ? undefined
        : Date.now() / 1000 + options.expirationTtl);
    await this.storage.put(`oauth:${key}`, {
      value,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(options?.metadata === undefined
        ? {}
        : { metadata: options.metadata }),
    } satisfies StoredValue);
    if (
      expiresAt !== undefined &&
      typeof this.storage.getAlarm === "function"
    ) {
      const next = Math.max(Date.now() + 1000, Math.ceil(expiresAt * 1000));
      const current = await this.storage.getAlarm();
      if (current === null || current > next) await this.storage.setAlarm(next);
    }
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(`oauth:${key}`);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
    const limit = Math.min(Math.max(options?.limit ?? 1000, 1), 1000);
    const prefix = `oauth:${options?.prefix ?? ""}`;
    const startAfter = options?.cursor
      ? decodeURIComponent(options.cursor)
      : undefined;
    const keys: Array<{
      name: string;
      expiration?: number;
      metadata?: unknown;
    }> = [];
    let after = startAfter;
    // Expired entries do not count against a KV page. Scan until a live page fills.
    for (;;) {
      const records = await this.storage.list<StoredValue>({
        prefix,
        startAfter: after,
        limit: limit + 1,
      });
      let last: string | undefined;
      for (const [key, record] of records) {
        last = key;
        if (
          record.expiresAt !== undefined &&
          record.expiresAt <= Date.now() / 1000
        ) {
          await this.storage.delete(key);
          continue;
        }
        if (keys.length === limit) {
          return {
            keys,
            list_complete: false,
            cursor: encodeURIComponent(after!),
          };
        }
        keys.push({
          name: key.slice("oauth:".length),
          ...(record.expiresAt === undefined
            ? {}
            : { expiration: record.expiresAt }),
          ...(record.metadata === undefined
            ? {}
            : { metadata: record.metadata }),
        });
        after = key;
      }
      if (records.size < limit + 1 || !last)
        return { keys, list_complete: true, cursor: "" };
      after = last;
    }
  }

  asKVNamespace(): KVNamespace {
    // The provider uses get(text/json), put(expiry/metadata), delete and list only.
    return this as unknown as KVNamespace;
  }

  /** Bounded alarm sweep: remove expired transactions, grants, tokens and clients.
   * A durable cursor resumes large stores on the next alarm without blocking a
   * request on an unbounded scan. Access checks enforce expiry independently.
   */
  async purgeExpired(): Promise<void> {
    const cursorKey = "oauth-cleanup-cursor";
    const cursor = await this.storage.get<string>(cursorKey);
    const records = await this.storage.list<StoredValue>({
      prefix: "oauth:",
      startAfter: cursor,
      limit: 1000,
    });
    const now = Date.now();
    let next = now + 3_600_000;
    let last: string | undefined;
    for (const [key, record] of records) {
      last = key;
      if (record.expiresAt === undefined) continue;
      if (record.expiresAt * 1000 <= now) await this.storage.delete(key);
      else next = Math.min(next, Math.ceil(record.expiresAt * 1000));
    }
    if (records.size === 1000 && last) {
      await this.storage.put(cursorKey, last);
      next = now + 1000;
    } else await this.storage.delete(cursorKey);
    await this.storage.setAlarm(Math.max(now + 1000, next));
  }
}
