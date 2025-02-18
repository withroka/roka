/**
 * Returns a temporary directory as a disposable object.
 *
 * @example
 * ```ts
 * import { tempDirectory } from "@roka/testing/temp";
 * import { assert } from "@std/assert";
 * await using dir = await tempDirectory();
 * assert((await Deno.stat(dir.path)).isDirectory)
 * ```
 */
export async function tempDirectory(): Promise<
  { path: string } & AsyncDisposable
> {
  const dir = { path: await Deno.makeTempDir() };
  Object.assign(dir, {
    [Symbol.asyncDispose]: () => Deno.remove(dir.path, { recursive: true }),
  });
  return dir as { path: string } & AsyncDisposable;
}
