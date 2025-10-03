/**
 * This module provides the {@linkcode doc} and {@linkcode blocks} function to
 * retrieve structured JSDoc from source files and code blocks in documentation.
 *
 * ```ts
 * import { doc } from "@roka/flow/doc";
 * (async () => {
 *   const docs = await doc(["file1.ts", "file2.ts"], { lint: true });
 *   return docs.filter((x) => x.kind === "function").map((x) => x.name);
 * });
 * ```
 *
 * ```ts
 * import { blocks } from "@roka/flow/doc";
 * (async () => {
 *   const examples = await blocks(["file1.md", "file2.md"]);
 *   return examples.filter((x) => x.lang === "ts").map((x) => x.content);
 * });
 * ```
 *
 * @module block
 */

import { pool } from "@roka/async/pool";
import { assertEquals, assertExists } from "@std/assert";
import { extname } from "@std/path/extname";
import { toFileUrl } from "@std/path/to-file-url";
import { resolve } from "node:path";

const EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mts",
  "mjs",
  "cts",
  "cjs",
];

/** Structured documentation returned by the {@linkcode doc} function. */
export interface Doc {
  /** Name of the documented symbol. */
  name: string;
  /** File location of the documented symbol. */
  location: Location;
  /** Export declaration of the symbol. */
  declarationKind: "private" | "export" | "declare";
  /** Kind of the documented symbol. */
  kind:
    | "moduleDoc"
    | "function"
    | "variable"
    | "enum"
    | "class"
    | "typeAlias"
    | "namespace"
    | "interface"
    | "import";
  /** JSDoc annotation of the documented symbol. */
  jsDoc?: {
    /** Documentation extracted from JSDoc. */
    doc: string;
    /** JSDoc tags. */
    tags: {
      /** Type of the tag. */
      kind: string;
      /** Name of the tag. */
      name?: string;
    }[];
  };
}

/** Code blocks returned by the {@linkcode blocks} function. */
export interface Block {
  /** Location of the code block in the source file. */
  location: Location;
  /**
   * Indentation of the code block.
   *
   * This is the characters in the code block before the actual content, such
   * as " * " for JSDoc comments.
   */
  indent: string;
  /** Language of the code block, if specified. */
  lang?: string;
  /** Content of the code block, without the leading indent in each line. */
  content: string;
}

/** Location of a symbol or code block in the source file. */
export interface Location {
  /** File URL of the containing file. */
  filename: URL;
  /** Line number (1-based). */
  line: number;
  /** Column number (0-based). */
  col: number;
  /** Byte index (0-based) in the file. */
  byteIndex: number;
}

/** Options for the {@linkcode doc} function. */
export interface DocOptions {
  /** Whether to run the linter on the files. */
  lint?: boolean;
}

/**
 * Generate documentation data from given files using
 * [`deno doc`](https://docs.deno.com/go/doc).
 */
export async function doc(
  files: string[],
  options?: DocOptions,
): Promise<Doc[]> {
  files = files.filter((x) => {
    const ext = extname(x).slice(1).toLowerCase();
    return EXTENSIONS.includes(ext);
  });
  if (files.length === 0) return [];
  const command = new Deno.Command("deno", {
    args: [
      "doc",
      "--quiet",
      "--json",
      ...options?.lint ? ["--lint"] : [],
      ...files,
    ],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await command.output();
  if (!success) {
    const errorString = new TextDecoder().decode(stderr);
    throw new Error(`Documentation failed\n\n${errorString}`);
  }
  const outputString = new TextDecoder().decode(stdout);
  const doc = JSON.parse(outputString) as { version?: number; nodes?: Doc[] };
  assertEquals(doc.version, 1, "Unsupported doc version");
  return (doc?.nodes ?? [])
    .filter((node) =>
      // https://github.com/denoland/deno/issues/30783
      node.kind === "moduleDoc" ||
      !node.jsDoc?.tags?.some((tag) => tag.kind === "module")
    );
}

/**
 * Extract code blocks from given files.
 *
 * Code blocks are identified by triple backticks (```) and may specify a
 * language after the opening backticks.
 */
export async function blocks(files: string[]): Promise<Block[]> {
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
          location: {
            filename: toFileUrl(resolve(Deno.cwd(), file)),
            line: fileContent.slice(0, m.index).split("\n").length,
            col: indent.length,
            byteIndex: m.index,
          },
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
