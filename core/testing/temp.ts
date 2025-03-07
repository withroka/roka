/**
 * This module provides common temporary objects useful for testing. Currently,
 * only the {@link tempDirectory} function is available.
 *
 * ```ts
 * import { tempDirectory } from "@roka/testing/temp";
 * await using directory = await tempDirectory();
 * await Deno.writeTextFile(directory.path("file.txt"), "Hello, world!");
 * ```
 *
 * @module temp
 */

import { join } from "@std/path";

/** A temporary directory returned by the {@linkcode tempDirectory} function. */
export interface TempDirectory extends AsyncDisposable {
  /** Returns the temporary directory path, with optional relative children. */
  path(...paths: string[]): string;
}

/**
 * Returns a temporary directory as a disposable object.
 *
 * @example Using a temporary directory.
 * ```ts
 * import { tempDirectory } from "@roka/testing/temp";
 * import { assert } from "@std/assert";
 * await using directory = await tempDirectory();
 * assert((await Deno.stat(directory.path())).isDirectory)
 * ```
 */
export async function tempDirectory(): Promise<TempDirectory> {
  const directory = await Deno.makeTempDir();
  return Object.assign({
    path: (...paths: string[]) => join(directory, ...paths),
  }, {
    toString: () => directory,
    [Symbol.asyncDispose]: () => Deno.remove(directory, { recursive: true }),
  });
}
