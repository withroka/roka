/**
 * This module provides the {@linkcode doc} function to retrieve structured
 * JSDoc from source files and code blocks in documentation.
 *
 * ```ts
 * import { doc } from "@roka/flow/doc";
 * (async () => {
 *   const docs = await doc(["file1.ts", "file2.ts"], { lint: true });
 *   return docs.filter((x) => x.kind === "function").map((x) => x.name);
 * });
 * ```
 *
 * @module doc
 */

import { assertEquals } from "@std/assert";
import { extname } from "@std/path/extname";

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
  location: {
    /** File URL of the containing file. */
    filename: URL;
    /** Line number (1-based). */
    line: number;
    /** Column number (0-based). */
    col: number;
    /** Byte index (0-based) in the file. */
    byteIndex: number;
  };
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
