/**
 * This module provides the {@linkcode fmt} function for formatting files.
 *
 * This uses [`deno fmt`](https://docs.deno.com/go/fmt) to format source files
 * and the code blocks in documentation.
 *
 * ```ts
 * import { fmt } from "@roka/flow/fmt";
 * (async () => {
 *   try {
 *     await fmt(["file1.ts", "file2.md"]);
 *   } catch (error) {
 *     // deno-lint-ignore no-console
 *     console.error("Formatting failed:", error);
 *   }
 * });
 * ```
 *
 * @module fmt
 */

import { deno, type Problem } from "./deno.ts";

/**
 * Format given files using [`deno fmt`](https://docs.deno.com/go/fmt).
 *
 * Code blocks in documentation are also formatted.
 *
 * @param files List of files to format.
 * @yields Problems found formatting.
 * @throws {DenoError} If the command fails with no error message.
 */
export async function* fmt(files: string[]): AsyncIterableIterator<Problem> {
  yield* deno("fmt", files, {
    args: ["--quiet", "--permit-no-files"],
    doc: "replace",
  });
}
