/**
 * A library for running Deno commands.
 *
 * This package provides the {@linkcode deno} function for running
 * {@link https://docs.deno.com/runtime/ deno} commands.
 *
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().check(["file1.ts", "file2.md"]);
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.error).forEach(console.error);
 * });
 * ```
 *
 * @module deno
 */

import { pool } from "@roka/async/pool";
import { type TempDirectory, tempDirectory } from "@roka/fs/temp";
import { maybe } from "@roka/maybe";
import { assertExists } from "@std/assert";
import { omit } from "@std/collections";
import { stripAnsiCode } from "@std/fmt/colors";
import { extname, fromFileUrl, resolve } from "@std/path";
import { mergeReadableStreams } from "@std/streams";

/**
 * An error thrown by the `deno` command.
 *
 * If the error is from running a `deno` command, the message will include the
 * command, the exit code, and the command output.
 */
export class DenoError extends Error {
  /** Construct DenoError. */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DenoError";
  }
}

/** Functionality returned by the {@linkcode deno} function. */
export interface DenoCommands {
  /**
   * Type check given files using [`deno check`](https://docs.deno.com/go/check).
   *
   * Code blocks in documentation are also linted.
   *
   * @param files List of files to type check.
   * @returns Problems found type checking.
   * @throws {DenoError} If the command fails with no error message.
   */
  check(files: string[]): Promise<FileResult[]>;
  /**
   * Format given files using [`deno fmt`](https://docs.deno.com/go/fmt).
   *
   * Code blocks in documentation are also formatted.
   *
   * @param files List of files to format.
   * @param options Options for formatting.
   * @returns Problems found formatting.
   * @throws {DenoError} If the command fails with no error message.
   */
  fmt(files: string[], options?: FmtOptions): Promise<FileResult[]>;
  /**
   * Generate documentation data from given files using
   * [`deno doc`](https://docs.deno.com/go/doc).
   *
   * @param files List of files to generate documentation from.
   * @param options Options for documentation generation.
   * @returns Problems found generating documentation or linting JSDoc comments.
   * @throws {DenoError} If the command fails with no error message.
   */
  doc(files: string[], options?: DocOptions): Promise<FileResult[]>;
  /**
   * Lints given files using [`deno lint`](https://docs.deno.com/go/lint).
   *
   * Code blocks in documentation are also linted.
   *
   * @param files List of files to lint.
   * @param options Options for linting.
   * @returns Problems found linting.
   * @throws {DenoError} If the command fails with no error message.
   */
  lint(files: string[], options?: LintOptions): Promise<FileResult[]>;
  /**
   * Runs tests in files using [`deno test`](https://docs.deno.com/go/test).
   *
   * Code blocks in documentation are also tested.
   *
   * Test permissions need to be specified in the `deno.json` configuration
   * file, as they are not passed through from this function.
   *
   * In {@linkcode TestOptions.update | update} mode, all permissions are
   * granted.
   *
   * @param files List of files to run tests from.
   * @param options Options for testing.
   * @returns Problems found testing.
   * @throws {DenoError} If the command fails with no error message.
   */
  test(files: string[], options?: TestOptions): Promise<FileResult[]>;
  /**
   * Compiles the given script into a self contained executable.
   *
   * Runtime permissions need to be specified in the `deno.json` configuration
   * file, as they are not passed through from this function.
   *
   * @param script Script file to compile.
   * @param options Options for compilation.
   * @returns Problems found during compilation.
   * @throws {DenoError} If the command fails with no error message.
   */
  compile(script: string, options?: CompileOptions): Promise<FileResult[]>;
}

/** The result of running a `deno` command for a single file. */
export interface FileResult {
  /** The file the results belong to. */
  file: string;
  /** Errors messages from the file. */
  error: Error[];
  /** Informational messages from the file. */
  info: Info[];
}

/** A generic report from `deno`. */
export interface Report {
  /** The user facing message of the report. */
  message: string;
}

/** A problem reported from `deno`. */
export type Info =
  & Report
  & {
    /** Test info kind. */
    kind: "test";
    /** The name of the test or step. */
    test: [string, ...string[]];
    /** The file the test belongs to. */
    file: string;
    /** The line number of a documentation test in its file. */
    line?: number;
    /** Whether the test was successful. */
    success: boolean;
    /** Test status string from `deno`. */
    status: string;
    /** The time taken to run the test. */
    time?: string;
  };

/** A problem reported from `deno`. */
export type Error =
  & Report
  & (
    | {
      /** Error kind. */
      kind: "check" | "lint" | "test";
      /** The file the error belongs to. */
      file: string;
      /** The line number the error occurs at. */
      line: number;
      /** The column number the error occurs at. */
      column: number;
      /** The lint rule that generated the problem. */
      rule: string;
      /** The reason for the problem. */
      reason: string;
    }
    | {
      /** Test error kind. */
      kind: "test";
      /** The name of the test or step. */
      test: [string, ...string[]];
      /** The file the error belongs to. */
      file: string;
      /** The line number the error occurs at. */
      line: number;
      /** The column number the error occurs at. */
      column: number;
    }
    | {
      /** Format error kind. */
      kind: "fmt";
      /** The file the error belongs to. */
      file: string;
    }
  );

/** Callback options for `deno` commands. */
export interface DenoOptions {
  /** The current working directory to run the commands in. */
  cwd?: string;
  /** A function that is called for each error message. */
  onError?: (error: Error) => unknown;
  /** A function that is called for each informational message. */
  onInfo?: (info: Info) => unknown;
  /** A function that is called for each debug message. */
  onDebug?: (debug: Report) => unknown;
  /** A function that is called for each partial error message. */
  onPartialError?: (info: Partial<Error>) => unknown;
  /** A function that is called for each partial informational message. */
  onPartialInfo?: (info: Partial<Info>) => unknown;
  /** A function that is called for each partial debug message. */
  onPartialDebug?: (info: Partial<Report>) => unknown;
}

/** Options for the {@linkcode Deno.doc} function. */
export interface DocOptions {
  /**
   * Output documentation in JSON format.
   * @default {false}
   */
  json?: boolean;
  /**
   * Whether to run the linter on the files.
   *
   * If set to `true`, no documentation is generated. Instead, any issues with
   * the JSDoc comments will be reported.
   *
   * @default {false}
   */
  lint?: boolean;
}

/** Options for the {@linkcode Deno.fmt} function. */
export interface FmtOptions {
  /**
   * Check if the source files are formatted.
   *
   * If set to `true`, no actual formatting will be done. Instead, any files
   * that are not properly formatted will be reported as problems.
   *
   * @default {false}
   */
  check?: boolean;
}

/** Options for the {@linkcode Deno.lint} function. */
export interface LintOptions {
  /**
   * Fix any linting errors for rules that support it.
   * @default {false}
   */
  fix?: boolean;
}

/** Options for the {@linkcode Deno.test} function. */
export interface TestOptions {
  /**
   * Whether to update snapshots and mocks.
   * @default {false}
   */
  update?: boolean;
}

/** Options for the {@linkcode Deno.compile} function. */
export interface CompileOptions {
  /**
   * Script arguments.
   * @default {[]}
   */
  args?: string[];
  /**
   * Target OS architectures.
   * @default {[Deno.build.target]}
   */
  target?: string;
  /**
   * Additional modules or files/directories in the compiled executable.
   * @default {[]}
   */
  include?: string[];
  /**
   * Output file.
   * @default {"$PWD/<inferred-name>"}
   */
  output?: string;
}

/**
 * Creates a new {@linkcode DenoCommands} instance for running `deno` commands.
 *
 * @example Type-check files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().check(["file1.ts", "file2.md"]);
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.error).forEach(console.error);
 * });
 * ```
 *
 * @example Format files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().fmt(["file1.ts", "file2.md"], { check: true });
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.error).forEach(console.error);
 * });
 * ```
 *
 * @example Lint files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().lint(["file1.ts", "file2.md"]);
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.error).forEach(console.error);
 * });
 * ```
 *
 * @example Run tests in files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().test(["file1.ts", "file2.md"]);
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.error).forEach(console.error);
 * });
 * ```
 *
 * @example Compile a script into a self contained executable.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().compile("script.ts", {
 *     target: "x86_64-unknown-linux-gnu",
 *     include: ["lib/", "config.json"],
 *     output: "my-tool",
 *   });
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.error).forEach(console.error);
 * });
 * ```
 */
export function deno(options?: DenoOptions): DenoCommands {
  const {
    cwd,
    onError,
    onPartialError,
    onInfo,
    onPartialInfo,
    onDebug,
    onPartialDebug,
  } = options ?? {};
  function debugTransform(data: ReportData, done: boolean): Report[] {
    const error = {
      message: data.message.trimEnd(),
      file: data.file ? fromFileUrl(data.file) : "<unknown>",
      line: Number.isNaN(Number(data.line)) ? -1 : Number(data.line),
      column: Number.isNaN(Number(data.column)) ? -1 : Number(data.column),
      ...omit(data, ["message", "file", "line", "column"]),
    };
    (done ? onDebug : onPartialDebug)?.(error);
    return [error];
  }
  return {
    async check(files) {
      return await new Runner("check", {
        ...cwd && { cwd },
        extensions: [...TYPESCRIPT_EXTENSIONS, "md"],
        doc: { only: ["md"] },
        args: ["--quiet"],
        parse: { delimiter: /(?:^\n+)|(?:\n{2,})/ },
        report: {
          error: {
            patterns: [
              /^(?<rule>TS\d+) \[.+?\]: (?<reason>.*)\n.*\n.*\n *at (?<file>.*):(?<line>\d+):(?<column>\d+)(?:\n.*)*$/,
            ],
            transform({ message, file, line, column, rule, reason }, done) {
              const error = {
                kind: "check" as const,
                message,
                file: file ?? "<unknown>",
                line: Number.isNaN(Number(line)) ? -1 : Number(line),
                column: Number.isNaN(Number(column)) ? -1 : Number(column),
                rule: rule ?? "<unknown>",
                reason: reason ?? "<unknown>",
              };
              (done ? onError : onPartialError)?.(error);
              return [error];
            },
          },
          debug: {
            patterns: [
              /^Found \d+ errors.$/,
              /^error: Type checking failed.$/,
            ],
            transform: debugTransform,
          },
        },
      }).run(files);
    },
    async fmt(files, options) {
      const { check = false } = options ?? {};
      return await new Runner("fmt", {
        ...cwd && { cwd },
        doc: { skip: ["md"] },
        args: [...(check ? ["--check"] : ["--quiet"])],
        parse: { delimiter: /(?:^\n+)|(?:\n{2,})/ },
        report: {
          error: {
            patterns: [/^from (?<file>.*):\n[\s\S]+$/],
            transform({ message, file }, done) {
              const error = {
                kind: "fmt" as const,
                message,
                file: file ?? "<unknown>",
              };
              (done ? onError : onPartialError)?.(error);
              return [error];
            },
          },
          debug: {
            patterns: [/^error: Found \d+ not formatted files? in \d+ files?$/],
            transform: debugTransform,
          },
        },
      }).run(files);
    },
    async doc(files, options) {
      const { json = false, lint = false } = options ?? {};
      return await new Runner("doc", {
        ...cwd && { cwd },
        extensions: SCRIPT_EXTENSIONS,
        args: [
          "--quiet",
          ...json ? ["--json"] : [],
          ...lint ? ["--lint"] : [],
        ],
        parse: {
          stdout: lint ? "null" : "inherit",
          delimiter: /(?:^\n+)|(?:\n{3,})/,
        },
        report: {
          ...lint && {
            error: {
              patterns: [
                /^error\[(?<rule>.+?)\]: (?<reason>.*?)\n *--> *(?<file>.*):(?<line>\d+):(?<column>\d+)\n[\s\S]+?$/,
              ],
              transform({ message, file, line, column, rule, reason }, done) {
                const error = {
                  kind: "lint" as const,
                  message,
                  file: file ?? "<unknown>",
                  line: Number.isNaN(Number(line)) ? -1 : Number(line),
                  column: Number.isNaN(Number(column)) ? -1 : Number(column),
                  rule: rule ?? "<unknown>",
                  reason: reason ?? "<unknown>",
                };
                (done ? onError : onPartialError)?.(error);
                return [error];
              },
            },
          },
          debug: {
            patterns: [/^error: Found \d+ documentation lint errors?\.$/],
            transform: debugTransform,
          },
        },
      }).run(files);
    },
    async lint(files, options) {
      const { fix = false } = options ?? {};
      return await new Runner("lint", {
        ...cwd && { cwd },
        extensions: [...SCRIPT_EXTENSIONS, "md"],
        doc: { only: ["md"] },
        args: [
          "--quiet",
          ...(fix ? ["--fix"] : []),
        ],
        parse: { delimiter: /(?:^\n+)|(?:\n{3,})/ },
        report: {
          error: {
            patterns: [
              /^error\[(?<rule>.+?)\]: (?<reason>.*?)\n *--> *(?<file>.*):(?<line>\d+):(?<column>\d+)\n[\s\S]+?$/,
            ],
            transform({ message, file, line, column, rule, reason }, done) {
              const error = {
                kind: "lint" as const,
                message,
                file: file ?? "<unknown>",
                line: Number.isNaN(Number(line)) ? -1 : Number(line),
                column: Number.isNaN(Number(column)) ? -1 : Number(column),
                rule: rule ?? "<unknown>",
                reason: reason ?? "<unknown>",
              };
              (done ? onError : onPartialError)?.(error);
              return [error];
            },
          },
        },
      }).run(files);
    },
    async test(files, options) {
      const { update = false } = options ?? {};
      let lastFile: Partial<Info> = {};
      const test: string[] = [];
      return await new Runner("test", {
        ...cwd && { cwd },
        extensions: [...SCRIPT_EXTENSIONS, "md"],
        args: [
          "--quiet",
          "--permit-no-files",
          "--no-check",
          "--doc",
          "--coverage",
          update ? "--allow-all" : "--permission-set",
        ],
        scriptArgs: update ? ["--", "--update"] : [],
        parse: {
          stdout: "piped",
          delimiter: new RegExp(
            /(?:\n+(?:[^ ]*(?: (?:ERRORS|FAILURES) |(?:FAILED|ok)[^ ]* \| \d+ passed .*?\| \d+ failed ).*)\n+)/
              .source +
              "|" +
              /(?:(?:^|\n+)(?=.*running \d+ tests? from|.+? \.\.\.(?:$| [^ ]*?(?:FAILED|INCOMPLETE|ok|ignored)[^ ]*? .*\n)?|.*=> .*:\d+:\d+[^ ]+\n))/
                .source,
          ),
        },
        report: {
          error: {
            patterns: [
              /^(?<name>.*?) => (?<file>.*?):(?<line>\d+):(?<column>\d+)\nerror: [\s\S]+?$/,
            ],
            transform({ message, name, file, line, column }, done) {
              const test = name?.split(" ... ");
              assertExists(test);
              assertExists(test[0]);
              const error: Error = {
                kind: "test" as const,
                message,
                test: [test[0], ...test.slice(1)],
                file: file ?? "<unknown>",
                line: Number.isNaN(Number(line)) ? -1 : Number(line),
                column: Number.isNaN(Number(column)) ? -1 : Number(column),
              };
              (done ? onError : onPartialError)?.(error);
              return [error];
            },
          },
          info: {
            patterns: [
              /^running \d+ tests? from (?<file>.*)(?:\$(?<line>\d+)-\d+)?$/,
              /^(?<step> *)(?<name>.*?) \.\.\.(?: (?<status>FAILED|INCOMPLETE|ok|ignored)(?: .*?\((?<time>[^()]*?)\))?)?$/,
            ],
            transform({ message, file, line, name, step, status, time }, done) {
              if (file !== undefined) {
                lastFile = {
                  file,
                  ...!Number.isNaN(Number(line)) && { line: Number(line) + 1 },
                };
                return [];
              }
              assertExists(name);
              test.splice((step?.length ?? 0) / 2);
              test.push(name);
              assertExists(test[0]);
              if (done === (status === undefined)) return [];
              const info:
                & Omit<Info, "status" | "success" | "time">
                & Partial<Pick<Info, "status" | "success" | "time">> = {
                  kind: "test" as const,
                  message,
                  test: [test[0], ...test.slice(1)],
                  file: lastFile.file ?? "<unknown>",
                  ...lastFile.line && { line: lastFile.line },
                  ...status &&
                    { success: status === "ok" || status === "ignored" },
                  ...status && { status },
                  ...time && { time },
                };
              if (!done) {
                onPartialInfo?.(info);
                return [];
              }
              const full: Info = {
                ...info,
                success: info.success ?? false,
                status: info.status ?? "INCOMPLETE",
              };
              onInfo?.(full);
              return [full];
            },
          },
          debug: {
            patterns: [
              /^running 0 tests from .*$/,
              /^.* => .*$/,
              /^(\|( [^|]* \|)+)(?:\n\|( [^|]* \|)+)*$/,
              /^error: Test failed$/,
            ],
            transform: debugTransform,
          },
          location: {
            lineOffset: -1,
            columnOffset: -5,
            columnShiftOffset: -4,
          },
        },
      }).run(files);
    },
    async compile(script, options) {
      const { args = [], target, include, output } = options ?? {};
      return await new Runner("compile", {
        ...cwd && { cwd },
        args: [
          "--quiet",
          "--permission-set",
          ...target ? ["--target", target] : [],
          ...include ? include.flatMap((i) => ["--include", i]) : [],
          ...output ? ["--output", output] : [],
        ],
        scriptArgs: args,
      }).run([script]);
    },
  };
}

const TYPESCRIPT_EXTENSIONS = ["ts", "tsx"];
const SCRIPT_EXTENSIONS = [
  ...TYPESCRIPT_EXTENSIONS,
  ...["js", "jsx", "mts", "mjs", "cts", "cjs"],
];

interface RunOptions {
  cwd?: string;
  allowNone?: boolean;
  extensions?: string[];
  doc?: boolean | {
    skip?: string[];
    only?: string[];
  };
  args?: string[];
  scriptArgs?: string[];
  parse?: {
    stdout?: "piped" | "inherit" | "null";
    delimiter?: RegExp;
  };
  report?: {
    done?: () => unknown;
    error?: {
      patterns: RegExp[];
      transform: (data: ReportData, done: boolean) => Error[];
    };
    info?: {
      patterns: RegExp[];
      transform: (data: ReportData, done: boolean) => Info[];
    };
    debug?: {
      patterns: RegExp[];
      transform: (data: ReportData, done: boolean) => Report[];
    };
    location?: {
      lineOffset?: number;
      columnOffset?: number;
      columnShiftOffset?: number;
    };
  };
}

interface ReportData {
  message: string;
  file?: string;
  line?: string;
  column?: string;
  [key: string]: string;
}

interface Block {
  file: string;
  line: number;
  count: number;
  column: number;
  indent: string;
  lang?: string;
  content: string;
}

class Runner implements AsyncDisposable {
  private filesByPath?: Map<string, string>;
  private blocksDir?: TempDirectory & AsyncDisposable;
  private blocksByPath: Record<string, Block & { path: string }> = {};

  constructor(
    private readonly command: string,
    private readonly options?: RunOptions,
  ) {}

  async run(files: string[]): Promise<FileResult[]> {
    const {
      cwd = Deno.cwd(),
      allowNone,
      extensions,
      scriptArgs = [],
      doc = false,
      parse,
      report,
    } = this.options ?? {};
    const docOnly = typeof doc === "object" && doc.only ? doc.only : [];
    const results = new Map<string, FileResult>(
      files.map((file) => [file, { file, error: [], info: [] }]),
    );
    if (extensions !== undefined) {
      files = files
        .filter((x) => extensions.includes(extname(x).slice(1).toLowerCase()));
    }
    if (files.length === 0 && !allowNone) {
      throw new DenoError("No target files found");
    }
    this.filesByPath = new Map(files.map((file) => [resolve(file), file]));
    if (doc) this.blocksDir = await tempDirectory();
    this.blocksByPath = await this.blockFiles(files);
    files = files.filter((x) =>
      !docOnly.includes(extname(x).slice(1).toLowerCase())
    );
    if (files.length === 0 && Object.keys(this.blocksByPath).length === 0) {
      return results.values().toArray();
    }
    const args = [
      this.command,
      ...this.options?.args ?? [],
      ...files,
      ...this.blocksDir &&
          Object.keys(this.blocksByPath).length > 0
        ? [this.blocksDir.path()]
        : [],
      ...scriptArgs,
    ];
    const process = new Deno.Command("deno", {
      cwd,
      args,
      // passthrough for testing
      env: {
        NO_COLOR: Deno.env.get("NO_COLOR") ?? "",
        FORCE_COLOR: Deno.env.get("FORCE_COLOR") ?? "",
      },
      stdin: "null",
      stdout: parse?.stdout ?? "null",
      stderr: "piped",
    }).spawn();
    const errors: string[] = [];
    let stream =
      (parse?.stdout === "piped"
        ? mergeReadableStreams(process.stdout, process.stderr)
        : process.stderr)
        .pipeThrough(new TextDecoderStream());
    if (parse?.delimiter) {
      let output = "";
      const generateReports = this.generateReports.bind(this, results);
      stream = stream.pipeThrough(
        new TransformStream<string>({
          transform(chunk, controller) {
            output += chunk;
            assertExists(parse.delimiter);
            const parts = output.split(parse.delimiter);
            output = parts.pop() ?? "";
            for (const part of parts) {
              const trimmed = part.trimEnd().replace(/^\n+/, "");
              if (!trimmed) continue;
              if (generateReports(trimmed, true)) continue;
              controller.enqueue(trimmed);
            }
            generateReports(output.trimEnd(), false);
          },
          flush(controller) {
            const trimmed = output.trimEnd().replace(/^\n+/, "");
            if (!trimmed) return;
            if (generateReports(trimmed, true)) return;
            controller.enqueue(trimmed);
          },
        }),
      );
    }
    for await (const output of stream.values()) {
      errors.push(stripAnsiCode(output));
    }
    const { success, code } = await process.status;
    report?.done?.();
    if (!success) {
      if (errors.length > 0) {
        throw new DenoError(
          `Error running deno command: ${this.command}:\n\n${
            errors.join("\n\n")
          }`,
          { cause: { command: "deno", cwd, args, code } },
        );
      }
    }
    await this.updateBlocks();
    return results.values().toArray();
  }

  async blockFiles(
    files: string[],
  ): Promise<Record<string, Block & { path: string }>> {
    if (this.blocksDir === undefined) return {};
    return Object.fromEntries(
      await pool(
        (await this.blocks(files)).filter((x) => x.lang),
        async (block) => {
          assertExists(this.blocksDir);
          const path = await Deno.makeTempFile({
            dir: this.blocksDir.path(),
            suffix: `$${block.line}-${block.line + block.count - 1}` +
              `.${block.lang}`,
          });
          await Deno.writeTextFile(path, block.content);
          return [path, { ...block, path }];
        },
      ),
    );
  }

  async blocks(files: string[]): Promise<Block[]> {
    const skipDoc = typeof this.options?.doc === "object" &&
        this.options?.doc.skip
      ? this.options.doc.skip
      : [];
    assertExists(this.blocksDir);
    const blocks = await pool(
      files.filter((x) => !skipDoc.includes(extname(x).slice(1).toLowerCase())),
      async (file) => {
        const { value: fileContent, error } = await maybe(() =>
          Deno.readTextFile(file)
        );
        if (error instanceof Deno.errors.NotFound) return undefined;
        if (error) throw error;
        return Array.from(
          fileContent.matchAll(
            /(?<=^|\n)(?<indent>(?<begin>.*?) *)```(?<lang>\w+)? *\n(?<content>(?:\k<begin>.*\n)*?)\k<indent>``` *\n/g,
          ).map((m) => {
            if (!m[0] || !m.groups) return undefined;
            const { indent, lang, content } = m.groups;
            assertExists(indent);
            assertExists(content);
            return {
              file: resolve(file),
              line: fileContent.slice(0, m.index).split("\n").length,
              count: content.split("\n").length,
              column: indent.length + 1,
              indent,
              ...lang && { lang },
              content: content
                .split("\n")
                .map((l) => l.slice(indent.length))
                .join("\n"),
            };
          }),
        );
      },
      { concurrency: 10 },
    );
    return blocks.flat().filter((x) => x !== undefined);
  }

  async updateBlocks() {
    const updatedBlocks =
      (await pool(Object.values(this.blocksByPath), async (block) => {
        const formatted = await Deno.readTextFile(block.path);
        if (block.content === formatted) return undefined;
        return { ...block, formatted };
      })).filter((x) => x !== undefined);
    await pool(
      Object.entries(Object.groupBy(updatedBlocks, (b) => b.file)),
      async ([file, blocks]) => {
        if (blocks === undefined) return;
        const content = blocks.reduce(
          (content, block) => {
            // file may have been formatted, and line numbers may have changed
            return content.replaceAll(
              [
                "```" + block.lang,
                ...block.content.trimEnd().split("\n"),
                "```",
              ].map((l) => (block.indent + l).trimEnd()).join("\n"),
              [
                "```" + block.lang,
                ...block.formatted.trimEnd().split("\n"),
                "```",
              ].map((l) => (block.indent + l).trimEnd()).join("\n"),
            );
          },
          await Deno.readTextFile(file),
        );
        await Deno.writeTextFile(file, content);
      },
      { concurrency: 4 },
    );
  }

  generateReports(
    results: Map<string, FileResult>,
    output: string,
    done: boolean,
  ): boolean {
    const { report } = this.options ?? {};
    if (!output) return false;
    const debugReports = this.matchReport(report?.debug, output, done);
    if (debugReports !== undefined) return true;
    const errorReports = this.matchReport(report?.error, output, done);
    if (done) {
      for (const report of errorReports ?? []) {
        const file = report.file;
        if (!results.has(file)) {
          results.set(file, { file, error: [report], info: [] });
        } else {
          results.get(file)?.error.push(report);
        }
      }
    }
    if (errorReports !== undefined) return true;
    const infoReports = this.matchReport(report?.info, output, done);
    if (done) {
      for (const report of infoReports ?? []) {
        const file = report.file;
        if (!results.has(file)) {
          results.set(file, { file, error: [], info: [report] });
        } else {
          results.get(file)?.info.push(report);
        }
      }
    }
    if (infoReports !== undefined) return true;
    return false;
  }

  matchReport<R extends Report>(
    target: {
      patterns: RegExp[];
      transform(data: ReportData, done: boolean): R[];
    } | undefined,
    output: string,
    done: boolean,
  ): R[] | undefined {
    if (target === undefined) return undefined;
    const { patterns, transform } = target;
    for (const pattern of patterns ?? []) {
      const match = stripAnsiCode(output).match(pattern);
      if (!match) continue;
      const data: ReportData = { message: output, ...match?.groups };
      if (data.file !== undefined) {
        if (data.file.startsWith("file://")) data.file = fromFileUrl(data.file);
        const block = this.resolveBlock(data);
        if (block === undefined) this.resolveLocation(data);
        data.file = data.file.replace(/\$\d+-\d+(\.\w+)?$/, "");
        this.resolveShifts(data, block);
        if (this.filesByPath?.has(resolve(data.file))) {
          data.file = this.filesByPath?.get(resolve(data.file)) ??
            "<unknown>";
        }
      }
      return transform(data, done);
    }
    return undefined;
  }

  resolveBlock(data: ReportData): Block | undefined {
    if (this.blocksDir === undefined) return undefined;
    if (!data.file?.startsWith(this.blocksDir.path())) return undefined;
    const block = this.blocksByPath[data.file];
    assertExists(block, `Cannot parse (block): ${data.message}`);
    if (data.line && data.column) {
      data.message = data.message.replaceAll(
        data.file,
        `${block.file}$${block.line}-${block.count}`,
      );
      data.column = `${Number(data.column) + block.column - 1}`;
      data.line = `${Number(data.line) + block.line}`;
    } else {
      data.message = data.message.replaceAll(
        data.file,
        `${block.file}:${block.line}:${block.column}`,
      );
    }
    data.file = block.file;
    return block;
  }

  resolveLocation(data: ReportData): void {
    const { lineOffset = 0, columnOffset = 0 } =
      this.options?.report?.location ?? {};
    const match = data.file?.match(
      /(?<file>\/.*?)\$(?<bline>\d+)-\d+(?:\.\w+)?/,
    );
    const { file, bline } = match?.groups ?? {};
    if (file === undefined || bline === undefined) return;
    const isJSDoc = extname(file) !== ".md";
    data.line = `${Number(data.line ?? 0) + Number(bline) + lineOffset}`;
    if (data.column !== undefined) {
      data.column = `${Number(data.column) + columnOffset + (isJSDoc ? 3 : 0)}`;
    }
  }

  resolveShifts(data: ReportData, block: Block | undefined): void {
    const { lineOffset = 0, columnShiftOffset = 0 } =
      this.options?.report?.location ?? {};
    const matches = data.message.matchAll(
      new RegExp(
        /(?<url>(?:file:\/\/)?(?<file>\/.*?))/.source +
          /\$(?<bline>\d+)-\d+(?:\.\w+)?(?<a1>\S*?)/.source +
          /:(?<a2>\S*?)(?<al>(?<![0-9[])\d+)(?<a3>\S*?)/.source +
          /:(?<a4>\S*?)(?<c>(?<![0-9[])\d+)(?<a5>\S*?)/.source,
        "g",
      ),
    );
    for (const match of matches) {
      const { url, file, bline, a1, a2, a3, a4, a5, al, c } = match.groups ??
        {};
      assertExists(url, `Cannot parse (url): ${data.message}`);
      assertExists(file, `Cannot parse (file): ${data.message}`);
      assertExists(bline, `Cannot parse (bl): ${data.message}`);
      if (al !== undefined && c !== undefined) {
        const isCurrent = data.file && resolve(file) === resolve(data.file);
        const isJSDoc = isCurrent && extname(file) !== ".md";
        const line = Number(al) + Number(bline) +
          (block ? 0 : lineOffset);
        const column = Number(c) +
          (block ? block.column - 1 : columnShiftOffset + (isJSDoc ? 3 : 0));
        data.message = data.message.replaceAll(
          match[0],
          `${url}${a1}:${a2}${line}${a3}:${a4}${column}${a5}`,
        );
      }
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.blocksDir) await this.blocksDir[Symbol.asyncDispose]();
  }
}
