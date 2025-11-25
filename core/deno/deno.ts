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
 *   results.flatMap((r) => r.problem).forEach(console.error);
 * });
 * ```
 *
 * @module deno
 */

import { pool } from "@roka/async/pool";
import { type TempDirectory, tempDirectory } from "@roka/fs/temp";
import { maybe } from "@roka/maybe";
import { assert, assertExists } from "@std/assert";
import { firstNotNullishOf, omit, pick } from "@std/collections";
import { stripAnsiCode } from "@std/fmt/colors";
import { extname, fromFileUrl, join, resolve } from "@std/path";
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
  /** Returns the working directory, with optional relative children. */
  path(...parts: string[]): string;
  /**
   * Type check given files using [`deno check`](https://docs.deno.com/go/check).
   *
   * Code blocks in documentation are also linted.
   *
   * @param files List of files to type check.
   * @param options Options for formatting.
   * @returns Problems found type checking.
   * @throws {DenoError} If the command fails with no error message.
   */
  check(files: string[], options?: CheckOptions): Promise<FileResult[]>;
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
   * In {@linkcode TestOptions.update update} mode, all permissions are
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
  problem: Problem[];
  /** Informational messages from the file. */
  info: Info[];
}

/** An error report generated from `deno` */
export type Problem =
  | DenoProblem
  | CheckProblem
  | LintProblem
  | DiffProblem
  | TestProblem;

/** An info report generated from `deno` */
export type Info = TestInfo | OutputInfo;

/** A generic report from `deno`. */
export interface Report {
  /** Report kind. */
  kind: string;
  /** The user facing message of the report. */
  message: string;
  /** The file the report belongs to. */
  file?: string;
  /** The line number the report occurs at. */
  line?: number;
  /** The column number the report occurs at. */
  column?: number;
}

/** A generic error from `deno`. */
export interface DenoProblem extends Report {
  /** Error kind. */
  kind: "error";
  /** The reason for the error. */
  reason?: string;
}

/** A check error reported from `deno`. */
export interface CheckProblem extends Report {
  /** Check problem kind. */
  kind: "check";
  /** The type-check rule that generated the error. */
  rule: string;
  /** The reason for the problem. */
  reason: string;
}

/** A lint problem reported from `deno`. */
export interface LintProblem extends Report {
  /** Lint problem kind. */
  kind: "lint";
  /** The lint rule that generated the problem. */
  rule: string;
  /** The reason for the problem. */
  reason: string;
}

/** A diff problem reported from `deno fmt --check`. */
export interface DiffProblem extends Report {
  /** Diff problem kind. */
  kind: "diff";
}

/** A test problem reported from `deno`. */
export interface TestProblem extends Report {
  /** Test problem kind. */
  kind: "failure";
  /** The name of the test or step. */
  test: [string, ...string[]];
}

/** A test information reported from `deno`. */
export interface TestInfo extends Report {
  /** Test info kind. */
  kind: "test";
  /** The name of the test or step. */
  test: [string, ...string[]];
  /** Whether the test was successful. */
  success: boolean;
  /** Test status string from `deno`. */
  status: string;
  /** The output of the test, if generated. */
  output?: string;
  /** The time taken to run the test. */
  time?: string;
}

/** An overall output report from `deno`. */
export interface OutputInfo extends Report {
  /** Output info kind. */
  kind: "output";
  /** Output from the run. */
  output: string;
}

/** Callback options for `deno` commands. */
export interface DenoOptions {
  /**
   * Change the working directory for deno commands.
   * @default {"."}
   */
  cwd?: string;
  /** A function that is called for each problem message. */
  onProblem?: (problem: Problem) => unknown;
  /** A function that is called for each informational message. */
  onInfo?: (info: Info) => unknown;
  /** A function that is called for each debug message. */
  onDebug?: (debug: Report) => unknown;
  /** A function that is called for each partial problem message. */
  onPartialProblem?: (info: Partial<Problem>) => unknown;
  /** A function that is called for each partial informational message. */
  onPartialInfo?: (info: Partial<Info>) => unknown;
  /** A function that is called for each partial debug message. */
  onPartialDebug?: (info: Partial<Report>) => unknown;
}

/** Options for the {@linkcode Deno.check} function. */
export interface CheckOptions {
  /**
   * Do not fail on zero matching files.
   * @default {false}
   */
  permitNoFiles?: boolean;
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
  /**
   * Do not fail on zero matching files.
   * @default {false}
   */
  permitNoFiles?: boolean;
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
  /**
   * Do not fail on zero matching files.
   * @default {false}
   */
  permitNoFiles?: boolean;
}

/** Options for the {@linkcode Deno.lint} function. */
export interface LintOptions {
  /**
   * Fix any linting errors for rules that support it.
   * @default {false}
   */
  fix?: boolean;
  /**
   * Do not fail on zero matching files.
   * @default {false}
   */
  permitNoFiles?: boolean;
}

/** Options for the {@linkcode Deno.test} function. */
export interface TestOptions {
  /**
   * Run tests with this string or RegExp pattern in the test name.
   *
   * If a string is provided, it will not be regarded as a pattern even if it
   * is enclosed in slashes.
   */
  filter?: string | RegExp;
  /**
   * Whether to update snapshots and mocks.
   * @default {false}
   */
  update?: boolean;
  /**
   * Do not fail on zero matching files.
   * @default {false}
   */
  permitNoFiles?: boolean;
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
 *   results.flatMap((r) => r.problem).forEach(console.error);
 * });
 * ```
 *
 * @example Format files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().fmt(["file1.ts", "file2.md"], { check: true });
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.problem).forEach(console.error);
 * });
 * ```
 *
 * @example Lint files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().lint(["file1.ts", "file2.md"]);
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.problem).forEach(console.error);
 * });
 * ```
 *
 * @example Run tests in files and their code blocks.
 * ```ts
 * import { deno } from "@roka/deno";
 * (async () => {
 *   const results = await deno().test(["file1.ts", "file2.md"]);
 *   // deno-lint-ignore no-console
 *   results.flatMap((r) => r.problem).forEach(console.error);
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
 *   results.flatMap((r) => r.problem).forEach(console.error);
 * });
 * ```
 */
export function deno(options?: DenoOptions): DenoCommands {
  const {
    onProblem,
    onPartialProblem,
    onInfo,
    onPartialInfo,
    onDebug,
    onPartialDebug,
  } = options ?? {};
  const directory = resolve(options?.cwd ?? Deno.cwd());
  function reportFrom<Kind extends string>(
    kind: Kind,
    data: ReportData,
  ): Report & { kind: Kind } {
    assert(kind === data.kind, kind);
    const { message, file } = data;
    const line = Number(data.line);
    const column = Number(data.column);
    return {
      kind,
      message: message.trimEnd(),
      ...file && { file },
      ...Number.isFinite(line) && { line },
      ...Number.isFinite(column) && { column },
      ...data.reason !== undefined && { reason: data.reason },
    };
  }
  function debugReport(data: ReportData, done: boolean): Report[] {
    const debug = reportFrom("debug", data);
    (done ? onDebug : onPartialDebug)?.(debug);
    return [debug];
  }
  function errorReport(data: ReportData, done: boolean): DenoProblem[] {
    const { reason } = data;
    const report = reportFrom("error", data);
    const error: DenoProblem = {
      ...report,
      ...reason !== undefined && { reason },
    };
    (done ? onProblem : onPartialProblem)?.(error);
    return [error];
  }
  function checkReport(data: ReportData, done: boolean) {
    const { kind } = data;
    assert(kind === "check" || kind === "lint", kind);
    const report = reportFrom(kind, data);
    const error = {
      ...report,
      rule: data.rule ?? "<unknown>",
      reason: data.reason ?? "<unknown>",
    };
    (done ? onProblem : onPartialProblem)?.(error);
    return [error];
  }
  const parseErrorPattern =
    /\s+(?<reason>.*) at (?<file>file:\/\/.*):(?<line>\d+):(?<column>\d+)$/;
  return {
    path(...parts: string[]) {
      return join(directory, ...parts);
    },
    async check(files, options) {
      const { permitNoFiles = false } = options ?? {};
      return await new Runner(directory, "check", {
        extensions: [...TYPESCRIPT_EXTENSIONS, "md"],
        permitNoFiles,
        doc: { only: ["md"] },
        commonArgs: ["--quiet"],
        reporter: {
          problem(data, done) {
            if (data.kind === "error") return errorReport(data, done);
            return checkReport(data, done);
          },
          debug: debugReport,
        },
        parser: [{
          patterns: [
            /^error: Type checking failed.$/,
            /^Found \d+ errors.$/,
          ],
          report: "debug",
        }, {
          patterns: [
            /^(?<rule>TS\d+) \[.+?\]: (?<reason>Cannot find module) '(?<file>.*)'\.$/,
            new RegExp(
              /^error: The module's source code could not be parsed:/.source +
                parseErrorPattern.source,
            ),
          ],
          report: "error",
        }, {
          patterns: [/^(?<rule>TS\d+) \[.+?\]: (?<reason>.*)$/],
          report: "check",
        }, {
          states: ["check"],
          patterns: [
            /^\s+at (?<file>.*):(?<line>\d+):(?<column>\d+)(?:\n.*)*$/,
          ],
          next: "check-end",
        }, {
          states: ["error", "check"],
          patterns: [/^.?/],
        }, {
          patterns: [/^$/],
        }, {
          patterns: [/^error: /],
          report: "fatal",
        }, {
          states: ["fatal"],
          patterns: [/^\s/],
        }],
      }).run(files);
    },
    async fmt(files, options) {
      const { check = false, permitNoFiles = false } = options ?? {};
      return await new Runner(directory, "fmt", {
        extensions: FORMAT_EXTENSIONS,
        permitNoFiles,
        doc: { skip: ["md"] },
        commonArgs: [...(check ? ["--check"] : ["--quiet"])],
        reporter: {
          problem(data, done) {
            if (data.kind === "error") return errorReport(data, done);
            const problem = reportFrom("diff", data);
            (done ? onProblem : onPartialProblem)?.(problem);
            return [problem];
          },
          debug: debugReport,
        },
        parser: [{
          patterns: [
            /^error: Failed to format \d+ of \d+ checked files?$/,
            /^error: Found \d+ not formatted files? in \d+ files?$/,
            /^Checked \d+ files?$/,
          ],
          report: "debug",
        }, {
          patterns: [/^Error (?:formatting|checking): (?<file>.*)$/],
          report: "error",
        }, {
          states: ["error"],
          patterns: [
            parseErrorPattern,
            /^\s/,
          ],
        }, {
          patterns: [/^from (?<file>.*):$/],
          report: "diff",
        }, {
          states: ["diff"],
          patterns: [/^\s*\d+\s+\|/],
        }, {
          patterns: [/^error: /],
          report: "fatal",
        }, {
          states: ["fatal"],
          patterns: [/^\s/],
        }, {
          patterns: [/^$/],
        }],
      }).run(files);
    },
    async doc(files, options) {
      const { json = false, lint = false, permitNoFiles = false } = options ??
        {};
      return await new Runner(directory, "doc", {
        extensions: SCRIPT_EXTENSIONS,
        permitNoFiles,
        commonArgs: [
          "--quiet",
          ...json ? ["--json"] : [],
          ...lint ? ["--lint"] : [],
        ],
        reporter: {
          problem(data, done) {
            if (data.kind === "error") return errorReport(data, done);
            return checkReport(data, done);
          },
          debug: debugReport,
        },
        parser: [{
          patterns: [/^error: Found \d documentation lint errors?\.$/],
          report: "debug",
        }, {
          patterns: [
            /^error: (?<reason>Module not found) "(?<file>.*)"\.$/,
            new RegExp(
              /^error: The module's source code could not be parsed:/.source +
                parseErrorPattern.source,
            ),
          ],
          report: "error",
        }, {
          states: ["error"],
          patterns: [/^\s/],
        }, {
          patterns: [/^error\[(?<rule>.+?)\]: (?<reason>.*?)$/],
          report: "lint",
        }, {
          states: ["lint"],
          patterns: [
            /^\s+--> (?<file>.*):(?<line>\d+):(?<column>\d+)$/,
            /^\s*(?:\d+)?\s+\|/,
            /^\s+/,
          ],
        }, {
          patterns: [/^error: /],
          report: "fatal",
        }, {
          states: ["fatal"],
          patterns: [/^\s/],
        }, {
          patterns: [/^$/],
        }],
      }).run(files);
    },
    async lint(files, options) {
      const { fix = false, permitNoFiles = false } = options ?? {};
      return await new Runner(directory, "lint", {
        extensions: [...SCRIPT_EXTENSIONS, "md"],
        permitNoFiles,
        doc: { only: ["md"] },
        commonArgs: [
          "--quiet",
          ...(fix ? ["--fix"] : []),
        ],
        reporter: {
          problem(data, done) {
            if (data.kind === "error") return errorReport(data, done);
            return checkReport(data, done);
          },
          debug: debugReport,
        },
        parser: [{
          patterns: [/^Error linting: (?<file>.*)$/],
          report: "error",
        }, {
          states: ["error"],
          patterns: [
            parseErrorPattern,
            /^\s/,
          ],
        }, {
          patterns: [/^error\[(?<rule>.+?)\]: (?<reason>.*?)$/],
          report: "lint",
        }, {
          states: ["lint"],
          patterns: [
            /^\s+--> (?<file>.*):(?<line>\d+):(?<column>\d+)$/,
            /^\s*(?:\d+)?\s+\|/,
            /^\d+\s+\|/,
            /^\s/,
          ],
        }, {
          patterns: [/^error: /],
          report: "fatal",
        }, {
          states: ["fatal"],
          patterns: [/^\s/],
        }, {
          patterns: [
            /^Found \d+ problems?$/,
            /^Checked \d+ files?$/,
          ],
          report: "debug",
        }, {
          patterns: [/^$/],
        }],
      }).run(files);
    },
    async test(files, options) {
      const { filter = false, update = false, permitNoFiles = false } =
        options ?? {};
      let last: Partial<TestInfo> = {};
      const test: string[] = [];
      const testPattern = new RegExp(
        /^(?<step> *)(?<name>.*?) \.\.\./.source + "(?: " +
          /(?<status>FAILED|INCOMPLETE|ok|ignored)/.source +
          /(?: \(due to .*?\))?(?: .*?\((?<time>[^()]*?)\))?/.source + ")?",
      );
      return await new Runner(directory, "test", {
        extensions: [...SCRIPT_EXTENSIONS, "md"],
        permitNoFiles,
        commonArgs: [
          "--no-check",
          "--doc",
          ...(filter
            ? [
              "--filter",
              typeof filter === "string"
                ? `/${RegExp.escape(filter)}/`
                : filter.toString(),
            ]
            : []),
          update ? "--allow-all" : "--permission-set",
        ],
        codeArgs: ["--coverage"],
        scriptArgs: update ? ["--update"] : [],
        reporter: {
          problem(data, done) {
            if (data.kind === "error") return errorReport(data, done);
            const report = reportFrom("failure", data);
            const test = data.name?.split(" ... ");
            assertExists(test?.[0]);
            const failure: TestProblem = {
              ...report,
              line: report.line ?? -1,
              column: report.column ?? -1,
              test: [test[0], ...test.slice(1)],
            };
            (done ? onProblem : onPartialProblem)?.(failure);
            return [failure];
          },
          info(data, done) {
            if (data.kind === "output") {
              const { output } = data;
              if (output === undefined) return [];
              (done ? onInfo : onPartialInfo)?.({
                ...reportFrom("output", data),
                output,
              });
              return [];
            }
            const report = reportFrom("test", data);
            if (data.file !== undefined) {
              last = report;
              return [];
            }
            const { step, name, status, output = last.output, time } = data;
            if (output !== undefined) last.output = output;
            if (done) assertExists(name);
            else if (!name) return [];
            test.splice((step?.length ?? 0) / 2);
            test.push(name);
            if (last.test?.join(":") !== test.join(":")) {
              last = pick(last, ["file", "line"]);
              assertExists(test[0]);
              last.test = [test[0], ...test.slice(1)];
            }
            assertExists(test[0]);
            const info:
              & Omit<TestInfo, "status" | "success" | "time">
              & Partial<Pick<TestInfo, "status" | "success" | "time">> = {
                ...report,
                file: report.file ?? last.file ?? "<unknown>",
                test: [test[0], ...test.slice(1)],
                ...status &&
                  { success: status === "ok" || status === "ignored" },
                ...status !== undefined && { status },
                ...output !== undefined && { output },
                ...time !== undefined && { time },
              };
            if (!done) {
              onPartialInfo?.(info);
              return [];
            }
            if (done === (status === undefined)) return []; // test with steps
            const full: Info = {
              ...info,
              success: info.success ?? false,
              status: info.status ?? "INCOMPLETE",
            };
            onInfo?.(full);
            return [full];
          },
          debug: debugReport,
        },
        location: {
          kind: ["test", "failure"],
          lineOffset: -1,
          columnOffset: -4,
        },
        parser: [{
          patterns: [/^error: Test failed$/],
          ignore: true,
        }, {
          patterns: [/^\s+FAILURES\s*$/],
          report: "debug",
          next: "failures",
        }, {
          states: ["failures"],
          patterns: [/^(?:FAILED|ok) \| \d+ passed .*?\| \d+ failed /],
          report: "debug",
        }, {
          states: ["failures"],
          patterns: [/./],
          next: "failures",
        }, {
          patterns: [
            /^error: Import '(?<file>.*)' failed, not found\.$/,
            /^(?<file>.*?) \(uncaught error\)$/,
            new RegExp(/^error:/.source + parseErrorPattern.source),
          ],
          report: "error",
        }, {
          patterns: [
            /^(?<name>.*?) => (?<file>.*?):(?<line>\d+):(?<column>\d+)/,
          ],
          report: "failure",
        }, {
          states: ["failure", "error", "error-body"],
          patterns: [
            /^\s+at (?<file>.*):(?<line>\d+):(?<column>\d+)(?:\n.*)*$/,
            /^./,
          ],
          next: "error-body",
        }, {
          patterns: [
            /^Error generating coverage report: [\s\S]+$/,
            /^error: /,
          ],
          report: "fatal",
        }, {
          states: ["fatal"],
          patterns: [/^\s/],
        }, {
          patterns: [/^------- (?:pre|post)-test output -------$/],
          report: "output",
        }, {
          states: ["output"],
          patterns: [/^(?<output>.*)----- (?:pre|post)-test output end -----$/],
          aggregate: ["output"],
          next: "output-end",
        }, {
          patterns: [/^------- output -------$/],
          report: "test",
          next: "test-output",
        }, {
          states: ["test-output"],
          patterns: [/^(?<output>.*)----- output end -----$/],
          aggregate: ["output"],
          next: "test-output-end",
        }, {
          states: ["output", "test-output"],
          patterns: [/^(?<output>.*$)/],
          aggregate: ["output"],
        }, {
          states: ["test-output-end"],
          patterns: [testPattern],
          next: "test",
        }, {
          patterns: [
            /^running \d+ tests? from (?<file>.*)(?:\$(?<line>\d+)-\d+)?$/,
            testPattern,
          ],
          report: "test",
        }, {
          patterns: [
            /^Warning /,
            /^Download /,
          ],
          report: "debug",
        }, {
          states: ["coverage"],
          patterns: [
            /^\| [^|]+ \| [^|]+ \| [^|]+ \|$/,
            /^.* coverage report has been generated at /,
          ],
        }, {
          patterns: [/^\| [^|]+ \| [^|]+ \| [^|]+ \|$/],
          report: "debug",
          next: "coverage",
        }, {
          patterns: [/^$/],
        }],
      }).run(files);
    },
    async compile(script, options) {
      const { args = [], target, include, output } = options ?? {};
      return await new Runner(directory, "compile", {
        commonArgs: [
          "--quiet",
          "--no-check",
          "--permission-set",
          ...target ? ["--target", target] : [],
          ...include ? include.flatMap((i) => ["--include", i]) : [],
          ...output ? ["--output", output] : [],
        ],
        scriptArgs: args,
        parser: [{
          patterns: [/^error: /],
          report: "fatal",
        }, {
          states: ["fatal"],
          patterns: [/.?/],
        }],
      }).run([script]);
    },
  };
}

const TYPESCRIPT_EXTENSIONS = ["ts", "tsx"];
const SCRIPT_EXTENSIONS = [
  ...TYPESCRIPT_EXTENSIONS,
  ...["js", "jsx", "mts", "mjs", "cts", "cjs"],
];
const FORMAT_EXTENSIONS = [
  ...SCRIPT_EXTENSIONS,
  ...[
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
  ],
];

const REPORT_TYPES = {
  fatal: "fatal",
  error: "problem",
  debug: "debug",
  check: "problem",
  lint: "problem",
  diff: "problem",
  failure: "problem",
  test: "info",
  output: "info",
} satisfies Record<ReportData["type"], "fatal" | "problem" | "info" | "debug">;

interface RunOptions {
  cwd?: string;
  extensions?: string[];
  permitNoFiles?: boolean;
  doc?: boolean | {
    skip?: string[];
    only?: string[];
  };
  commonArgs?: string[];
  codeArgs?: string[];
  scriptArgs?: string[];
  reporter?: {
    fatal?: (data: ReportData, done: boolean) => Report[];
    problem?: (data: ReportData, done: boolean) => Problem[];
    info?: (data: ReportData, done: boolean) => Info[];
    debug?: (data: ReportData, done: boolean) => Report[];
  };
  location?: {
    kind?: string[];
    lineOffset?: number;
    columnOffset?: number;
  };
  parser?: {
    states?: string[];
    patterns: RegExp[];
    aggregate?: string[];
    report?: keyof typeof REPORT_TYPES;
    next?: string;
    ignore?: boolean;
  }[];
}

interface LineData {
  source: "stdout" | "stderr";
  line: string;
  done: boolean;
}

interface ReportData {
  readonly kind: Problem["kind"] | Info["kind"] | "fatal" | "debug";
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
  private results: Map<string, FileResult> = new Map();
  private report: {
    state: string | undefined;
    data: ReportData | undefined;
    done: boolean;
  } = { state: undefined, data: undefined, done: false };

  constructor(
    private readonly directory: string,
    private readonly command: string,
    private readonly options?: RunOptions,
  ) {}

  async run(files: string[]): Promise<FileResult[]> {
    const {
      extensions,
      permitNoFiles,
      commonArgs = [],
      codeArgs = [],
      scriptArgs = [],
      doc = false,
    } = this.options ?? {};
    const docOnly = typeof doc === "object" && doc.only ? doc.only : [];
    if (extensions !== undefined) {
      files = files
        .filter((x) => extensions.includes(extname(x).slice(1).toLowerCase()));
    }
    if (files.length === 0 && !permitNoFiles) {
      throw new DenoError("No target files found");
    }
    for (const file of files) {
      this.results.set(file, { file, problem: [], info: [] });
    }
    this.filesByPath = new Map(files.map((file) => [resolve(file), file]));
    if (doc) this.blocksDir = await tempDirectory();
    this.blocksByPath = await this.blockFiles(files);
    files = files.filter((x) =>
      !docOnly.includes(extname(x).slice(1).toLowerCase())
    );
    if (files.length === 0 && Object.keys(this.blocksByPath).length === 0) {
      return this.results.values().toArray();
    }
    const cwd = this.directory;
    const args = [
      this.command,
      ...commonArgs,
      ...files.filter((x) =>
          SCRIPT_EXTENSIONS.includes(extname(x).slice(1).toLowerCase())
        ).length > 0
        ? codeArgs
        : [],
      ...files,
      ...this.blocksDir &&
          Object.keys(this.blocksByPath).length > 0
        ? [this.blocksDir.path()]
        : [],
      ...scriptArgs.length ? ["--", ...scriptArgs] : [],
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
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const sourced = (
      stream: typeof process.stdout,
      source: LineData["source"],
    ) => {
      let last: string | undefined = undefined;
      return stream
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(
          new TransformStream<string, LineData>({
            transform(chunk, controller) {
              const lines = ((last ?? "") + chunk).split("\n");
              last = lines.pop();
              for (const line of lines) {
                controller.enqueue({ source, line, done: true });
              }
              if (last !== undefined) {
                controller.enqueue({ source, line: last, done: false });
              }
            },
            flush(controller) {
              if (last === undefined) return;
              controller.enqueue({ source, line: last, done: true });
            },
          }),
        );
    };
    const errors = await Array.fromAsync(
      mergeReadableStreams(
        sourced(process.stdout, "stdout"),
        sourced(process.stderr, "stderr"),
      ).pipeThrough(new TransformStream(this)).values(),
    );
    const { code } = await process.status;
    if (errors.length > 0) {
      throw new DenoError(
        [
          `Error running deno ${this.command}`,
          ...errors.map(stripAnsiCode),
        ].join("\n\n"),
        { cause: { command: "deno", cwd, args, code } },
      );
    }
    await this.updateBlocks();
    return this.results.values().toArray();
  }

  transform(
    data: LineData,
    controller: TransformStreamDefaultController<string>,
  ) {
    const { source, line, done } = data;
    const { parser = [] } = this.options ?? {};
    const found = firstNotNullishOf(
      parser.filter((state) => (state.states === undefined ||
        (this.report.state !== undefined &&
          state.states.includes(this.report.state)))
      ),
      (state) => {
        const match = firstNotNullishOf(
          state.patterns,
          (pattern) => stripAnsiCode(line).match(pattern),
        );
        return match ? [state, match] as const : undefined;
      },
    );
    if (!found) {
      if (done && source === "stderr") {
        controller.enqueue(line);
        // deno-lint-ignore no-console
        console.warn(
          `Unhandled error from deno ${this.command}: ${stripAnsiCode(line)}`,
        );
      }
      return;
    }
    const [state, match] = found;
    if (state.ignore) return;
    if (state.report) {
      this.flush(controller, this.report.done);
      this.report = {
        state: state.next ?? state.report,
        data: { ...match.groups, kind: state.report, message: line },
        done,
      };
    } else if (this.report.data) {
      const aggregate = state.aggregate ?? [];
      this.report.data = {
        ...this.report.data,
        ...omit(match.groups ?? {}, aggregate),
        ...done && { message: this.report.data.message + "\n" + line },
      };
      if (done) {
        const aggregate = pick(match.groups ?? {}, state.aggregate ?? []);
        for (const [key, value] of Object.entries(aggregate)) {
          if (this.report.data[key]) this.report.data[key] += "\n" + value;
          else this.report.data[key] = value;
        }
      }
    } else if (this.report.state) {
      if (done && source === "stderr") {
        controller.enqueue(line);
        // deno-lint-ignore no-console
        console.warn(
          `Unhandled error from deno ${this.command}: ${stripAnsiCode(line)}`,
        );
      }
      return;
    }
    this.flush(controller, false);
    if (done) {
      this.report.state = state.next ?? state.report ?? this.report.state;
    }
  }

  flush(
    controller: TransformStreamDefaultController<string>,
    done: boolean = true,
  ) {
    const result = (report: Info | Problem) => {
      const { file } = report;
      if (!file) return;
      let result = this.results.get(file);
      if (!result) {
        result = { file, problem: [], info: [] };
        this.results.set(file, result);
      }
      return result;
    };
    const { reporter } = this.options ?? {};
    if (!this.report.data) return;
    const data = {
      ...this.report.data,
      message: this.report.data.message.replace(/\n+$/, ""),
    };
    if (data.file !== undefined) {
      if (data.file.startsWith("file://")) {
        data.file = fromFileUrl(data.file);
      }
      const block = this.resolveBlock(data);
      if (block === undefined) this.resolveLocation(data);
      data.file = data.file.replace(/\$\d+-\d+(\.\w+)?$/, "");
      this.resolveShifts(data, block);
      if (this.filesByPath?.has(resolve(data.file))) {
        data.file = this.filesByPath?.get(resolve(data.file)) ??
          data.file;
      }
    }
    const type = REPORT_TYPES[data.kind];
    if (type === "fatal") {
      if (reporter?.fatal) reporter?.fatal(data, done);
      if (done) controller.enqueue(data.message);
    }
    if (type === "problem" && reporter?.problem) {
      const errors = reporter.problem(data, done);
      if (done) {
        for (const error of errors) result(error)?.problem.push(error);
      }
    }
    if (type === "info" && reporter?.info) {
      const infos = reporter.info(data, done);
      if (done) {
        for (const info of infos) result(info)?.info.push(info);
      }
    }
    if (type === "debug" && reporter?.debug) {
      reporter?.debug(data, done);
    }
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
    const { location } = this.options ?? {};
    const { lineOffset = 0, columnOffset = 0 } =
      location?.kind?.includes(data.kind) ? location : {};
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
    const { location } = this.options ?? {};
    const { lineOffset = 0, columnOffset = 0 } =
      location?.kind?.includes(data.kind) ? location : {};
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
      let { url, file, bline, a1, a2, a3, a4, a5, al, c } = match.groups ??
        {};
      assertExists(url, `Cannot parse (url): ${data.message}`);
      assertExists(file, `Cannot parse (file): ${data.message}`);
      assertExists(bline, `Cannot parse (bl): ${data.message}`);
      file = stripAnsiCode(file);
      if (al !== undefined && c !== undefined) {
        const isCurrent = data.file && resolve(file) === resolve(data.file);
        const isJSDoc = isCurrent && extname(file) !== ".md";
        const line = Number(al) + Number(bline) +
          (block ? 0 : lineOffset);
        const column = Number(c) +
          (block ? block.column - 1 : columnOffset + (isJSDoc ? 3 : 0));
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
