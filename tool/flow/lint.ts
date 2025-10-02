/**
 * This module provides the {@linkcode lint} function for linting project files.
 *
 * This is currently the same as [`deno lint`](https://docs.deno.com/go/lint).
 *
 * ```ts
 * import { lint } from "@roka/flow/lint";
 *
 * (async () => {
 *   try {
 *     await lint(["file1.ts", "file2.ts"]);
 *   } catch (error) {
 *     console.error("Linting failed:", error);
 *   }
 * });
 * ```
 *
 * @module lint
 */

import { pool } from "@roka/async/pool";
import { block } from "./block.ts";

export async function lint(files: string[]): Promise<void> {
  await pool(files, (file) => block(file, { check: ["lint"] }));
  const cmd = new Deno.Command("deno", {
    args: ["lint", "--quiet", "--permit-no-files", ...files],
    stdin: "null",
    stdout: "null",
    stderr: "piped",
  });
  const { success, stderr } = await cmd.output();
  if (!success) {
    const error = new TextDecoder()
      .decode(stderr)
      .trimEnd();
    throw new Error(error);
  }
}
