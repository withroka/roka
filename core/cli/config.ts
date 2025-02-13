import { basename, dirname, join } from "@std/path";

/**
 * A key-value config store for the process.
 *
 * By default, the config store is persisted to a file in the user's home
 * directory. It can be made in-memory by passing `path = ":memory:"` to the
 * constructor. This allows for an easy setup for testing.
 *
 * @example
 * ```ts
 * import { Config } from "@roka/cli/config";
 * import { assertEquals } from "@std/assert";
 * using config = new Config<{ foo: string, bar: string }>({ path: ":memory:" });
 * await config.set({ foo: "foo" });
 * await config.set({ bar: "bar" });
 * assertEquals(await config.get(), { foo: "foo", bar: "bar" });
 * ```
 */
export class Config<T extends Record<string, unknown>> {
  private kv: Deno.Kv | undefined;

  /**
   * Creates a new config store.
   *
   * @param name Name of the config store.
   * @param options Configuration options.
   * @param options.path The path to the database file.
   */
  constructor(private readonly options?: { path?: string }) {}

  /** Returns all data stored for this config. */
  async get(): Promise<Partial<T>> {
    const kv = await this.open();
    const result = {} as Record<string, unknown>;
    for await (const { key, value } of kv.list({ prefix: [] })) {
      const [property] = key;
      if (property) result[property.toString()] = value;
    }
    return result as Partial<T>;
  }

  /** Writes data to the configuration. Prior data is not deleted. */
  async set(value: Partial<T>): Promise<void> {
    const kv = await this.open();
    const set = kv.atomic();
    for (const property of Object.getOwnPropertyNames(value)) {
      set.set([property], value[property]);
    }
    await set.commit();
  }

  /** Clear all stored configuration data. */
  async clear(): Promise<void> {
    const kv = await this.open();
    const del = kv.atomic();
    for await (const { key } of kv.list({ prefix: [] })) {
      del.delete(key);
    }
    await del.commit();
  }

  /** Open the db connection to the persistent data. */
  private async open(): Promise<Deno.Kv> {
    if (!this.kv) {
      const path = this.options?.path ??
        join(
          Deno.env.get("HOME") ?? ".",
          "." + basename(dirname(Deno.mainModule)),
          "config.db",
        );
      await Deno.mkdir(dirname(path), { recursive: true });
      this.kv = await Deno.openKv(path);
    }
    return this.kv;
  }

  /** Close the db connection to the persistent data. */
  [Symbol.dispose]() {
    this.kv?.close();
  }
}
