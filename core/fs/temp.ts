/**
 * This module provides helpers for working with temporary files and
 * directories. Currently, only the {@linkcode tempDirectory} function is
 * available.
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 *
 * await using directory = await tempDirectory();
 * await Deno.writeTextFile(directory.path("file.txt"), "Hello, world!");
 * ```
 *
 * @module temp
 */

import { runtime } from "@roka/runtime";
import { makeTempDir } from "@std/fs/unstable-make-temp-dir";
import { remove } from "@std/fs/unstable-remove";
import { join } from "@std/path";

/** A temporary directory returned by the {@linkcode tempDirectory} function. */
export interface TempDirectory {
  /** Returns the temporary directory path, with optional relative children. */
  path(...paths: string[]): string;
}

/** Options for the {@linkcode tempDirectory} function. */
export interface TempDirectoryOptions {
  /**
   * Automatically changes the current working directory to the
   * temporary directory and restores it when disposed.
   *
   * @default {false}
   */
  chdir?: boolean;
}

/**
 * Returns a temporary directory as a disposable object.
 *
 * @example Using a temporary directory
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertEquals } from "@std/assert";
 *
 * await using directory = await tempDirectory();
 * assertEquals((await Deno.stat(directory.path())).isDirectory, true);
 * ```
 *
 * @example Automatically changing to the directory
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertEquals } from "@std/assert";
 *
 * const cwd = Deno.cwd();
 * {
 *   await using directory = await tempDirectory({ chdir: true });
 *   assertEquals(Deno.cwd(), await Deno.realPath(directory.path()));
 *   await Deno.writeTextFile("file.txt", "Hello!");
 * }
 * assertEquals(Deno.cwd(), cwd);
 * ```
 */
export async function tempDirectory(
  options?: TempDirectoryOptions,
): Promise<TempDirectory & AsyncDisposable> {
  const directory = await makeTempDir();
  const cwd = options?.chdir ? runtime.cwd() : undefined;
  if (options?.chdir) runtime.chdir(directory);
  return Object.assign({
    path: (...paths: string[]) => join(directory, ...paths),
  }, {
    toString: () => directory,
    async [Symbol.asyncDispose]() {
      if (cwd) runtime.chdir(cwd);
      await remove(directory, { recursive: true });
    },
  });
}
