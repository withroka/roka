/**
 * This module provides helpers for working with temporary files and
 * directories. Currently, only the {@linkcode tempDirectory} function is
 * available.
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * await using directory = await tempDirectory();
 * await Deno.writeTextFile(directory.path("file.txt"), "Hello, world!");
 * ```
 *
 * @module temp
 */

import { join } from "@std/path";

/** A temporary directory returned by the {@linkcode tempDirectory} function. */
export interface TempDirectory {
  /** Returns the temporary directory path, with optional relative children. */
  path(...paths: string[]): string;
}

/**
 * Returns a temporary directory as a disposable object.
 *
 * @example Using a temporary directory.
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertEquals } from "@std/assert";
 * await using directory = await tempDirectory();
 * assertEquals((await Deno.stat(directory.path())).isDirectory, true);
 * ```
 */
export async function tempDirectory(): Promise<
  TempDirectory & AsyncDisposable
> {
  const directory = await Deno.makeTempDir();
  return Object.assign({
    path: (...paths: string[]) => join(directory, ...paths),
  }, {
    toString: () => directory,
    [Symbol.asyncDispose]: () => Deno.remove(directory, { recursive: true }),
  });
}
