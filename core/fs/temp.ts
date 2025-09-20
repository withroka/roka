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
 * You can also automatically change to the temporary directory by passing
 * the `chdir` option:
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * {
 *   await using dir = await tempDirectory({ chdir: true });
 *   // cwd is dir.path() at this point
 *   await Deno.writeTextFile("file.txt", "Hello, world!");
 * }
 * // cwd is restored here
 * ```
 *
 * @module temp
 */

import { join } from "@std/path";

/** Options for the {@linkcode tempDirectory} function. */
export interface TempDirectoryOptions {
  /**
   * If true, automatically changes the current working directory to the
   * temporary directory and restores it when disposed.
   */
  chdir?: boolean;
}

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
 *
 * @example Automatically changing to the directory.
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * {
 *   await using dir = await tempDirectory({ chdir: true });
 *   // cwd is dir.path() at this point
 *   await Deno.writeTextFile("file.txt", "Hello!");
 * }
 * // Original directory is restored here
 * ```
 */
export async function tempDirectory(
  options?: TempDirectoryOptions,
): Promise<TempDirectory & AsyncDisposable> {
  const directory = await Deno.makeTempDir();
  const originalCwd = options?.chdir ? Deno.cwd() : undefined;

  if (options?.chdir) {
    Deno.chdir(directory);
  }

  return Object.assign({
    path: (...paths: string[]) => join(directory, ...paths),
  }, {
    toString: () => directory,
    [Symbol.asyncDispose]: async () => {
      if (originalCwd) {
        Deno.chdir(originalCwd);
      }
      await Deno.remove(directory, { recursive: true });
    },
  });
}
