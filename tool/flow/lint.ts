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

import { pool } from "@roka/async/pool";
import { tempDirectory } from "@roka/fs/temp";
import { assertExists } from "@std/assert";
import { basename, extname, fromFileUrl, SEPARATOR } from "@std/path";
import { blocks } from "./doc.ts";

const EXTENSIONS = ["ts", "tsx", "js", "jsx", "mts", "mjs", "cts", "cjs", "md"];

/**
 * Lints given files using [`deno lint`](https://docs.deno.com/go/lint).
 *
 * Code blocks in documentation are also linted.
 */
export async function lint(files: string[]): Promise<number> {
  files = files.filter((x) => {
    const ext = extname(x).slice(1).toLowerCase();
    return EXTENSIONS.includes(ext);
  });
  if (files.length === 0) return 0;
  await using dir = await tempDirectory();
  const codeBlocks = Object.fromEntries(
    await pool(
      (await blocks(files)).filter((x) =>
        x.lang && EXTENSIONS.includes(x.lang) && x.lang !== "md"
      ),
      async (block) => {
        const path = await Deno.makeTempFile({
          dir: dir.path(),
          suffix: `.${block.lang}`,
        });
        await Deno.writeTextFile(path, block.content);
        return [basename(path), { ...block, path }];
      },
    ),
  );
  const command = new Deno.Command("deno", {
    args: ["lint", "--quiet", "--permit-no-files", ...files, dir.path()],
    stdin: "null",
    stdout: "null",
    stderr: "piped",
  });
  const { success, stderr } = await command.output();
  if (!success) {
    let error = new TextDecoder().decode(stderr)
      .replaceAll(dir.path() + SEPARATOR, "%%%/");
    error = error.matchAll(
      /%%%\/(?<file>.*\.\w+)((?<tail>.*?):(?<line>\d+):(?<col>\d+))?/g,
    ).reduce((error, m) => {
      assertExists(m.groups);
      const { file, tail, line, col } = m?.groups;
      assertExists(file);
      const block = codeBlocks[file];
      assertExists(block);
      const originalFile = fromFileUrl(block.location.filename);
      return error.replace(
        m[0],
        (line === undefined || col === undefined)
          ? originalFile
          : originalFile + tail +
            (`:${Number(block.location.line) + Number(line)}` +
              `:${Number(block.location.col) + Number(col)}`),
      );
    }, error);
    throw new Error(`Linting failed\n\n${error}`);
  }
  return files.length;
}
