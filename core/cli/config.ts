/**
 * This module provides the {@linkcode config} function, which provides access
 * to a user configuration on the file system for the running application.
 *
 * The config object is a disposable resource that should be closed when no
 * longer needed, which can be achieved via the `using` keyword.
 *
 * ```ts
 * // deno-lint-ignore-file no-console
 * import { config } from "@roka/cli/config";
 * (async () => {
 *   using cfg = config<{ username: string; email: string }>();
 *   const data = await cfg.get();
 *   console.log(data.username);
 *   console.log(data.email);
 *   await cfg.set({ email: "new-email@example.com" });
 * });
 * ```
 *
 * The config system wraps the {@link https://deno.com/kv Deno.Kv} API to
 * provide a simple key-value store for the running application. This API is
 * still experimental, and code using the config module needs the
 * `--unstable-kv` flag enabled.
 *
 * @module config
 */

import { basename, dirname, join } from "@std/path";

/**
 * A key-value stored returned by the {@linkcode config} function.
 *
 * @typeParam T The type of configuration data.
 */
export interface Config<T extends Record<string, unknown>> {
  /** Returns all data stored for this configuration. */
  get(): Promise<Partial<T>>;
  /** Writes data to the configuration. Prior data is not deleted. */
  set(value: Partial<T>): Promise<void>;
  /** Clear all stored configuration data. */
  clear(): Promise<void>;
}

/** Options for the {@linkcode config} function. */
export interface ConfigOptions {
  /**
   * The path to the database file. If not provided, the file is stored in the
   * user's home directory, in a directory whose name is derived from the
   * running application.
   *
   * The configuration can be made in-memory by setting this value to
   * `":memory:"`.
   */
  path?: string;
}

/**
 * Creates a user configuration store for the running application.
 *
 * The returned config object is a key-value store that can be used to modify
 * or retrieve object-based data. It is a disposable resource that should be
 * used with the `using` keyword.
 *
 * Setting {@linkcode ConfigOptions.path path} to `":memory:"` will create a
 * configuration that persists until the process ends.
 *
 * @example Use a file-based user configuration.
 * ```ts
 * import { config } from "@roka/cli/config";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertEquals } from "@std/assert";
 * await using directory = await tempDirectory();
 * using cfg = config<{ foo: string; bar: number }>({
 *   path: directory.path("config.db"),
 * });
 * await cfg.set({ foo: "value" });
 * await cfg.set({ bar: 42 });
 * assertEquals(await cfg.get(), { foo: "value", bar: 42 });
 * ```
 *
 * @example Use an in-memory configuration.
 * ```ts
 * import { config } from "@roka/cli/config";
 * import { assertEquals } from "@std/assert";
 * using cfg = config<{ foo: string; bar: number }>({
 *   path: ":memory:",
 * });
 * await cfg.set({ foo: "value" });
 * await cfg.set({ bar: 42 });
 * assertEquals(await cfg.get(), { foo: "value", bar: 42 });
 * ```
 *
 * @typeParam T The type of configuration data.
 * @returns A configuration object that closes itself at disposal.
 *
 * @todo Add single key getters.
 * @todo Add many key getters.
 */
export function config<T extends Record<string, unknown>>(
  options?: ConfigOptions,
): Config<T> & Disposable {
  let kv: Deno.Kv | undefined;
  async function open(): Promise<Deno.Kv> {
    if (kv) return kv;
    const path = options?.path ??
      join(
        Deno.env.get("HOME") ?? ".",
        `.${basename(dirname(Deno.mainModule))}`,
        "config.db",
      );
    if (path !== ":memory:") {
      await Deno.mkdir(dirname(path), { recursive: true });
    }
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
    [Symbol.dispose]: () => kv?.close(),
  });
}
