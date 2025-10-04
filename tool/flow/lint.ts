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

import { assert } from "@std/assert/assert";
import { assertExists } from "@std/assert/exists";
import { stripAnsiCode } from "@std/fmt/colors";
import { deno, type Problem } from "./deno.ts";

const EXTENSIONS = ["ts", "tsx", "js", "jsx", "mts", "mjs", "cts", "cjs", "md"];

/** Problem reported by the {@linkcode lint} function. */
export interface LintProblem extends Problem {
  /** Failing lint rule. */
  rule: string;
  /** Reason for the lint failure. */
  reason: string;
  /** Path of the file with the issue. */
  file: string;
  /** Line number (1-based) of the issue. */
  line: number;
  /** Column number (0-based) of the issue. */
  col: number;
}

/**
 * Lints given files using [`deno lint`](https://docs.deno.com/go/lint).
 *
 * Code blocks in documentation are also linted.
 *
 * @param files List of files to lint.
 * @yields Errors reported by the command.
 * @return The number of files processed.
 * @throws {DenoError} If the command fails with no error message.
 */
export async function* lint(
  files: string[],
): AsyncGenerator<Problem | LintProblem, number> {
  const command = deno("lint", files, {
    doc: true,
    extensions: EXTENSIONS,
    ignore: [/^Error linting: .*$/],
  });
  while (true) {
    // deno-lint-ignore no-await-in-loop
    const { value, done } = await command.next();
    if (done) return value;
    const lintProblemMatch = stripAnsiCode(value.error).match(
      /^error\[(?<rule>.*?)\]:(?<reason>.*)\n *--> *(?<file>.*):(?<line>\d+):(?<col>\d+)/,
    );
    if (!lintProblemMatch) {
      yield value;
      continue;
    }
    assertExists(lintProblemMatch.groups);
    const { rule, reason, file, line, col } = lintProblemMatch.groups;
    assertExists(rule);
    assertExists(reason);
    assertExists(file);
    assertExists(line);
    assertExists(col);
    assert(!isNaN(Number(line)) && Number(line) > 0);
    assert(!isNaN(Number(col)) && Number(col) >= 0);
    yield {
      ...value,
      rule,
      reason,
      file,
      line: Number(line),
      col: Number(col),
    };
  }
}
