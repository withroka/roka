import { pool } from "@roka/async/pool";
import { tempDirectory } from "@roka/fs/temp";
import { assertExists } from "@std/assert";
import { stripAnsiCode } from "@std/fmt/colors";
import { basename, extname, resolve, SEPARATOR } from "@std/path";

/** A problem reported from `deno` and returned by {@linkcode deno} function. */
export interface Problem {
  /** Error message from `deno`. */
  error: string;
}

/** Options for the {@linkcode deno} function. */
export interface DenoOptions {
  /**
   * Additional arguments to pass to the deno command.
   * @default {[]}
   */
  args?: string[];
  /**
   * Whether to process code blocks in documentation or Markdown files.
   *
   * If set to `"replace"`, the updated code blocks will be written back to the
   * original files.
   *
   * @default {false}
   */
  doc?: boolean | "replace";
  /**
   * File extensions to fitler inputs.
   *
   * By default all files are accepted. If provided, only files with the given
   * extensions (case-insensitive, without the dot) are processed.
   *
   * Code blocks in documentation or Markdown files are also filtered
   * if {@linkcode DenoOptions.doc | doc} is set to `true` or `"replace"`.
   *
   * @example ["ts", "js", "md"]
   */
  extensions?: string[];
  ignore?: RegExp[];
}

/**
 * Runs given deno command over a list of files.
 *
 * The same command will be applied to all code blocks in documentation or
 * Markdown files, if requested.
 */
export async function* deno(
  command: string,
  files: string[],
  options?: DenoOptions,
): AsyncIterableIterator<Problem> {
  // input validation
  const { args = [], doc = false, extensions, ignore = [] } = options ?? {};
  files = files
    .filter((x) =>
      extensions === undefined ||
      extensions.includes(extname(x).slice(1).toLowerCase())
    );
  if (files.length === 0) return;
  // if doc processing is requested, extract code blocks to temp files
  await using dir = doc ? await tempDirectory() : undefined;
  const codeBlocks = dir && Object.fromEntries(
    await pool(
      (await blocks(files))
        .filter((x) =>
          extensions === undefined ||
          x.lang && extensions.includes(x.lang) && x.lang !== "md"
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
  // run the requested deno command
  const process = new Deno.Command("deno", {
    args: [
      command,
      "--quiet",
      "--permit-no-files",
      ...args,
      ...files,
      ...dir ? [dir.path()] : [],
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  // handle errors, mapping temp file locations back to original files
  for await (const chunk of process.stderr.values()) {
    let error = new TextDecoder().decode(chunk);
    if (dir && codeBlocks) {
      error = error.replaceAll(dir.path() + SEPARATOR, "%%%&");
      error = error.matchAll(
        /%%%&(?<file>.*\.\w+)((?<tail>.*?):(?<line>\d+):(?<col>\d+))?/g,
      ).reduce((error, m) => {
        assertExists(m.groups);
        const { file, tail, line, col } = m?.groups;
        assertExists(file);
        const block = codeBlocks[file];
        assertExists(block);
        const originalFile = block.file;
        return error.replace(
          m[0],
          (line === undefined || col === undefined)
            ? originalFile
            : originalFile + tail +
              (`:${Number(block.line) + Number(line)}` +
                `:${Number(block.col) + Number(col)}`),
        );
      }, error);
    }
    yield* error
      .split("\n")
      .filter((x) => x && !ignore.some((r) => r.test(stripAnsiCode(x))))
      .join("\n")
      .split("\n\n\n")
      .map((x) => x.trimEnd())
      .filter((x) => x)
      .map((x) => ({ error: x }));
  }
  const status = await process.status;
  if (!status.success) {
    throw new Error(`Command "deno ${command}" failed.`);
  }
  // if requested, replace code blocks in original files
  if (doc === "replace" && dir && codeBlocks) {
    const updatedBlocks =
      (await pool(Object.values(codeBlocks), async (block) => {
        const formatted = await Deno.readTextFile(block.path);
        if (block.content === formatted) return undefined;
        return { ...block, formatted };
      })).filter((x) => x !== undefined);
    await pool(
      Object.entries(Object.groupBy(updatedBlocks, (b) => b.file)),
      async ([file, blocks]) => {
        if (blocks === undefined) return;
        const updates = blocks
          .sort((a, b) => b.byteIndex - a.byteIndex);
        const lines = updates.reduce(
          (lines, block) => {
            const content = [
              "```" + block.lang,
              ...block.formatted.trimEnd().split("\n"),
              "```",
            ];
            lines.splice(
              block.line - 1,
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
  }
}

interface Block {
  file: string;
  line: number;
  col: number;
  byteIndex: number;
  indent: string;
  lang?: string;
  content: string;
}

async function blocks(files: string[]): Promise<Block[]> {
  const blocks = await pool(files, async (file) => {
    const fileContent = await Deno.readTextFile(file);
    return Array.from(
      fileContent.matchAll(
        /(?<=^|\n)(?<indent>.*?)```(?<lang>\w+)? *\n(?<content>(?:\k<indent>.*\n)*?)\k<indent>``` *\n/g,
      ).map((m) => {
        if (!m[0] || !m.groups) return undefined;
        const { indent, lang, content } = m.groups;
        assertExists(indent);
        assertExists(content);
        return {
          file: resolve(Deno.cwd(), file),
          line: fileContent.slice(0, m.index).split("\n").length,
          col: indent.length,
          byteIndex: m.index,
          indent,
          ...lang && { lang },
          content: content
            .split("\n")
            .map((l) => l.slice(indent.length))
            .join("\n"),
        };
      }).filter((x) => x !== undefined),
    );
  });
  return blocks.flat();
}
