/**
 * Mock objects taht live for the duration of a test scope.
 *
 * The mocking system mimicks the behavior of the `@std/testing/snapshot`
 * module. Running tests with the `--update` or `-u` flag will create a mock
 * file in the `__mocks__` directory, using real calls. The mock file will be
 * used in subsequent test runs, when these flags are not present.
 *
 * * @example
 * ```ts
 * import { tempDirectory } from "@roka/testing/temp";
 * await using directory = await tempDirectory();
 * await Deno.writeTextFile(directory.path("file.txt"), "Hello, world!");
 * ```
 *
 * @module
 */

import { join } from "@std/path/join";

/** A temporary directory returned by {@linkcode tempDirectory}. */
export interface TempDirectory extends AsyncDisposable {
  /** Returns the temporary directory path, with optional relative children. */
  path(...paths: string[]): string;
}

/**
 * Returns a temporary directory as a disposable object.
 *
 * @example
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
