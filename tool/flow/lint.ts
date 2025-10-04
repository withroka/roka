/**
 * This module provides the {@linkcode lint} function for linting files.
 *
 * This uses [`deno lint`](https://docs.deno.com/go/lint) to check source files
 * and the code blocks in documentation for style issues and common mistakes.
 *
 * ```ts
 * import { lint } from "@roka/flow/lint";
 * (async () => {
 *   try {
 *     await lint(["file1.ts", "file2.ts"]);
 *   } catch (error) {
 *     // deno-lint-ignore no-console
 *     console.error("Linting failed:", error);
 *   }
 * });
 * ```
 *
 * @module lint
 */

import { deno, type Problem } from "./deno.ts";

/**
 * Lints given files using [`deno lint`](https://docs.deno.com/go/lint).
 *
 * Code blocks in documentation are also linted.
 *
 * @param files List of files to lint.
 * @yields Problems found linting.
 * @throws {DenoError} If the command fails with no error message.
 */
export async function* lint(files: string[]): AsyncIterableIterator<Problem> {
  yield* deno("lint", files, {
    args: ["--quiet", "--permit-no-files"],
    doc: true,
    ignore: [/^Error linting: .*$/],
  });
}
