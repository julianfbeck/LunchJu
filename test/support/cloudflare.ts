export class DurableObject<T> {
  constructor(
    public ctx: DurableObjectState,
    public env: T,
  ) {}
}
export class WorkerEntrypoint<T> {
  constructor(
    public ctx: ExecutionContext,
    public env: T,
  ) {}
}
export function durableState() {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    storage: {
      async get(key: string) {
        return values.get(key);
      },
      async put(key: string, value: unknown) {
        values.set(key, value);
      },
      async delete(key: string) {
        return values.delete(key);
      },
      async list({
        prefix = "",
        startAfter,
        limit = 1000,
      }: { prefix?: string; startAfter?: string; limit?: number } = {}) {
        return new Map(
          [...values]
            .filter(
              ([key]) =>
                key.startsWith(prefix) && (!startAfter || key > startAfter),
            )
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, limit),
        );
      },
      async getAlarm() {
        return alarm;
      },
      async setAlarm(time: number) {
        alarm = time;
      },
    },
    waitUntil: () => {},
  } as unknown as DurableObjectState;
}
