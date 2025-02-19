/**
 * Config object that stores key-value pairs in the file system.
 *
 * The config system wrap the {@link https://deno.com/kv | Deno.Kv} API to
 * provide a simple key-value store for the running application.
 *
 * The config object is a disposable resource that should be closed when no
 * longer needed.
 *
 * @example
 * ```ts
 * import { config } from "@roka/cli/config";
 * import { assertEquals } from "@std/assert";
 * using cfg = config<{ key: string }>({ path: ":memory:" });
 * await cfg.set({ key: "value" });
 * assertEquals(await cfg.get(), { key: "value" });
 * ```
 *
 * @module
 */

import { basename, dirname, join } from "@std/path";

/** A key-value stored returned by {@linkcode config}. */
export interface Config<T extends Record<string, unknown>> extends Disposable {
  /** Returns all data stored for this config. */
  get(): Promise<Partial<T>>;
  /** Writes data to the configuration. Prior data is not deleted. */
  set(value: Partial<T>): Promise<void>;
  /** Clear all stored configuration data. */
  clear(): Promise<void>;
}

/** Options for {@linkcode config}. */
export interface ConfigOptions {
  /**
   * The path to the database file. If not provided, the file is stored in the
   * user's home directory. The database can be made in-memory by setting this
   * value to `":memory:"`.
   * @default {"~/.<app>/config.db`}
   */
  path?: string;
}

/**
 * Creates a key-value config store for the process.
 *
 * @example
 * ```ts
 * import { config } from "@roka/cli/config";
 * import { assertEquals } from "@std/assert";
 * using cfg = config<{ foo: string, bar: string }>({ path: ":memory:" });
 * await cfg.set({ foo: "foo" });
 * await cfg.set({ bar: "bar" });
 * assertEquals(await cfg.get(), { foo: "foo", bar: "bar" });
 * ```
 *
 * @todo Add single key getters.
 * @todo Add many key getters.
 */
export function config<T extends Record<string, unknown>>(
  options?: ConfigOptions,
): Config<T> {
  let kv: Deno.Kv | undefined;
  async function open(): Promise<Deno.Kv> {
    if (kv) return kv;
    const path = options?.path ??
      join(
        Deno.env.get("HOME") ?? ".",
        `.${basename(dirname(Deno.mainModule))}`,
        "config.db",
      );
    await Deno.mkdir(dirname(path), { recursive: true });
    kv = await Deno.openKv(path);
    return kv;
  }
  const config = {
    async get() {
      const kv = await open();
      const result = {} as Record<string, unknown>;
      for await (const { key, value } of kv.list({ prefix: [] })) {
        const [property] = key;
        if (property) result[property.toString()] = value;
      }
      return result as Partial<T>;
    },
    async set(value: Partial<T>) {
      const kv = await open();
      const set = kv.atomic();
      for (const property of Object.getOwnPropertyNames(value)) {
        set.set([property], value[property]);
      }
      await set.commit();
    },
    async clear() {
      const kv = await open();
      const del = kv.atomic();
      for await (const { key } of kv.list({ prefix: [] })) {
        del.delete(key);
      }
      await del.commit();
    },
  };
  return Object.assign(config, {
    [Symbol.dispose]() {
      kv?.close();
    },
  });
}
