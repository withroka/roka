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
 * You can also temporarily change the working directory to the temporary
 * directory:
 *
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * await using directory = await tempDirectory();
 * using cwd = directory.chdir();
 * // Now working in the temporary directory
 * await Deno.writeTextFile("file.txt", "Hello, world!");
 * ```
 *
 * @module temp
 */

import { join } from "@std/path";

/** A temporary directory returned by the {@linkcode tempDirectory} function. */
export interface TempDirectory {
  /** Returns the temporary directory path, with optional relative children. */
  path(...paths: string[]): string;
  /**
   * Temporarily changes the current working directory to the temporary directory.
   * Returns a disposable that restores the original directory when disposed.
   */
  chdir(): TempChdir & Disposable;
}

/** A temporary chdir returned by the {@linkcode TempDirectory.chdir} method. */
export interface TempChdir {
  /** Whether the original working directory has been restored. */
  restored: boolean;
  /** Restores the original working directory. */
  restore(): void;
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
 * @example Temporarily changing to the directory.
 * ```ts
 * import { tempDirectory } from "@roka/fs/temp";
 * await using directory = await tempDirectory();
 * const originalCwd = Deno.cwd();
 * using cwd = directory.chdir();
 * // Now in the temporary directory
 * await Deno.writeTextFile("file.txt", "Hello!");
 * // When cwd is disposed, original directory is restored
 * ```
 */
export async function tempDirectory(): Promise<
  TempDirectory & AsyncDisposable
> {
  const directory = await Deno.makeTempDir();
  return Object.assign({
    path: (...paths: string[]) => join(directory, ...paths),
    chdir(): TempChdir & Disposable {
      const originalCwd = Deno.cwd();
      Deno.chdir(directory);

      const tempChdir = {
        get restored() {
          return Deno.cwd() === originalCwd;
        },
        restore() {
          if (this.restored) {
            throw new Error("Cannot restore: chdir already restored");
          }
          Deno.chdir(originalCwd);
        },
      };

      return Object.assign(tempChdir, {
        [Symbol.dispose]: () => {
          if (!tempChdir.restored) {
            tempChdir.restore();
          }
        },
      });
    },
  }, {
    toString: () => directory,
    [Symbol.asyncDispose]: () => Deno.remove(directory, { recursive: true }),
  });
}
