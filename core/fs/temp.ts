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

/** Options for the {@linkcode tempDirectory} function. */
export interface TempDirectoryOptions {
  /**
   * Automatically changes the current working directory to the
   * temporary directory and restores it when disposed.
   * @default {false}
   */
  chdir?: boolean;
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
 *   Deno.cwd(); // dir.path()
 *   await Deno.writeTextFile("file.txt", "Hello!");
 * }
 * Deno.cwd(); // restored
 * ```
 */
export async function tempDirectory(
  options?: TempDirectoryOptions,
): Promise<TempDirectory & AsyncDisposable> {
  const tempDir = await Deno.makeTempDir();
  let directory: string;
  try {
    directory = await Deno.realPath(tempDir);
  } catch {
    // If realPath fails (e.g., due to permissions), fall back to the original path
    directory = tempDir;
  }
  const cwd = options?.chdir ? Deno.cwd() : undefined;

  if (options?.chdir) Deno.chdir(directory);

  return Object.assign({
    path: (...paths: string[]) => join(directory, ...paths),
  }, {
    toString: () => directory,
    [Symbol.asyncDispose]: async () => {
      if (cwd) Deno.chdir(cwd);
      await Deno.remove(directory, { recursive: true });
    },
  });
}
