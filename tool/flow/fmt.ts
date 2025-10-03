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

import { pool } from "@roka/async/pool";
import { tempDirectory } from "@roka/fs/temp";
import { assertExists } from "@std/assert";
import { basename, extname, fromFileUrl, SEPARATOR } from "@std/path";
import { blocks } from "./doc.ts";

const EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mts",
  "mjs",
  "cts",
  "cjs",
  "md",
  "json",
  "jsonc",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "svelte",
  "vue",
  "astro",
  "yml",
  "yaml",
  "ipynb",
  "sql",
  "vto",
  "njk",
];

/**
 * Format given files using [`deno fmt`](https://docs.deno.com/go/fmt).
 *
 * Code blocks in documentation are also formatted.
 */
export async function fmt(files: string[]): Promise<number> {
  files = files.filter((x) => {
    const ext = extname(x).slice(1).toLowerCase();
    return EXTENSIONS.includes(ext);
  });
  if (files.length === 0) return 0;
  await using dir = await tempDirectory();
  const codeBlocks = Object.fromEntries(
    await pool(
      (await blocks(files)).filter((x) =>
        x.lang && EXTENSIONS.includes(x.lang)
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
    args: ["fmt", "--quiet", "--permit-no-files", ...files, dir.path()],
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
    throw new Error(`Formatting failed\n\n${error}`);
  }
  const formattedBlocks =
    (await pool(Object.values(codeBlocks), async (block) => {
      const formatted = await Deno.readTextFile(block.path);
      if (block.content === formatted) return undefined;
      return { ...block, formatted };
    })).filter((x) => x !== undefined);
  await pool(
    Object.entries(
      Object.groupBy(formattedBlocks, (b) => fromFileUrl(b.location.filename)),
    ),
    async ([file, blocks]) => {
      if (blocks === undefined) return;
      const updates = blocks
        .sort((a, b) => b.location.byteIndex - a.location.byteIndex);
      const lines = updates.reduce(
        (lines, block) => {
          const content = [
            "```" + block.lang,
            ...block.formatted.trimEnd().split("\n"),
            "```",
          ];
          lines.splice(
            block.location.line - 1,
            block.content.trimEnd().split("\n").length + 2,
            ...content.map((l) => block.indent + l),
          );
          return lines;
        },
        (await Deno.readTextFile(file)).split("\n"),
      );
      await Deno.writeTextFile(file, lines.join("\n"));
    },
    { concurrency: 4 },
  );
  return files.length;
}
