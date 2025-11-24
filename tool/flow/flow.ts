// deno-lint-ignore-file no-console
/**
 * A fast feedback development tool.
 *
 * Roka “**flow**” eliminates chore work in Deno projects by providing fast,
 * comprehensive code quality checks. The tool uses Deno to format, type-check,
 * lint, and test code, including example code in documentation.
 *
 * ## Usage
 *
 * Run **flow** with `deno run -A jsr:@roka/flow`. You can also install with
 * `deno install -gA jsr:@roka/flow` and run with the flow.
 *
 * ```sh
 * flow
 * ```
 *
 * This command formats, type-checks, lints, and tests all project files in
 * directories that have been modified in the current branch. It compares these
 * changes against the default branch of the repository, which is likely “main”.
 *
 * The default behavior verifies changes to the repository. If a path is
 * provided to **flow**, it will check all matching files instead.
 *
 * ```sh
 * flow core   # check all files in the core directory
 * flow .      # check all project files
 * ```
 *
 * Individual checks can be run with subcommands.
 *
 * ```sh
 * flow fmt    # format code
 * flow check  # type-check code
 * flow lint   # lint code
 * flow test   # run tests, and generate coverage report
 * ```
 *
 * {@link https://docs.deno.com/go/config/#formatting Formatting} and
 * {@link https://docs.deno.com/go/config/#linting linting} are configured
 * in `deno.json`. The
 * {@link https://docs.deno.com/go/doc/#linting documentation linter} runs
 * when run at the project root with no arguments.
 *
 * Tests use {@link https://docs.deno.com/go/config/#permissions permissions}
 * from the `deno.json` file. {@link https://jsr.io/@roka/testing/doc/mock Mocks}
 * and {@link https://jsr.io/@std/testing/doc/snapshot snapshots} are
 * generated with all permissions enabled when `--update` is passed.
 *
 * ```sh
 * flow test --update
 * ```
 *
 * _**WARNING**: This tool serves the Roka project. Feel free to make
 * contributions if it is useful to you. The interface is unstable and may
 * change._
 *
 * @todo Determine affected files based on module graph.
 * @todo Respect `include` and `exclude` lists in `deno.json`.
 *
 * @module flow
 */
import { Command } from "@cliffy/command";
import { pool } from "@roka/async/pool";
import {
  deno,
  type DenoCommands,
  type DenoOptions,
  type FileResult,
  type TestInfo,
} from "@roka/deno";
import { version } from "@roka/forge/version";
import { find } from "@roka/fs/find";
import { tempDirectory } from "@roka/fs/temp";
import { git } from "@roka/git";
import { maybe } from "@roka/maybe";
import { assertExists } from "@std/assert";
import {
  moveCursorUp,
  RESTORE_CURSOR,
  SAVE_CURSOR,
} from "@std/cli/unstable-ansi";
import {
  associateBy,
  deepMerge,
  distinct,
  intersect,
  sumOf,
} from "@std/collections";
import { bold, dim, green, red, yellow } from "@std/fmt/colors";
import { basename, dirname, toFileUrl } from "@std/path";
import { toText } from "@std/streams";

const DESCRIPTION = `
  ${bold("🍃 flow")}

  An assistant tool for Deno projects that formats, type-checks,
  lints, and tests code.
`;

let verbose = false;

/**
 * Run the `flow` CLI tool.
 *
 * @returns The exit code of the command.
 */
export async function flow(): Promise<number> {
  const cmd = new Command()
    .name("flow")
    .version(await version({ release: true, target: true }))
    .meta("deno", Deno.version.deno)
    .meta("v8", Deno.version.v8)
    .meta("typescript", Deno.version.typescript)
    .description(DESCRIPTION)
    .example("flow", "Format code and run all checks for modified files.")
    .example("flow --check", "Check for problems without making changes.")
    .example("flow .", "Format code and run all checks for all files.")
    .example("flow core/", "Format and check files in the core directory.")
    .example("flow check", "Type-check code.")
    .example("flow fmt", "Format code.")
    .example("flow lint", "Lint code.")
    .example("flow test", "Run tests.")
    .example("flow test --filter name", "Only run tests with 'name'.")
    .usage("<command> [options]")
    .arguments("[paths...:file]")
    .option("--check", "Check for problems only.", { default: false })
    .option("--doc", "Check for doc lint problems.", { default: false })
    .option("--verbose", "Print additional information.", {
      hidden: true,
      global: true,
      action: () => verbose = true,
    })
    .action(async ({ check, doc }, ...paths) => {
      const fix = !check;
      const found = await files(paths);
      if (found.length === 0) return;
      await run(found, [
        (deno, files) => deno.fmt(files, { check, permitNoFiles: true }),
        (deno, files) => deno.check(files, { permitNoFiles: true }),
        (deno, files) => deno.lint(files, { fix, permitNoFiles: true }),
        async (deno, files) =>
          doc && await deno.doc(files, { lint: true, permitNoFiles: true }),
      ], {
        prefix: "Checked",
      });
      await run(found, [
        (deno, files) => deno.test(files, { permitNoFiles: true }),
      ], {
        test: true,
      });
    })
    .command("fmt", fmtCommand())
    .command("check", checkCommand())
    .command("lint", lintCommand())
    .command("test", testCommand());
  const { errors } = await maybe(() => cmd.parse());
  for (const error of errors ?? []) {
    console.error(`❌`, error.message);
    if (verbose) console.error(error);
  }
  return errors ? 1 : 0;
}

function fmtCommand() {
  return new Command()
    .description("Format code, including code blocks in JSDoc.")
    .example("flow fmt", "Format modified files.")
    .example("flow fmt --check", "Only check if files are formatted.")
    .example("flow fmt .", "Format all files.")
    .example("flow fmt **/*.ts", "Format all TypeScript files.")
    .example("flow fmt core/", "Format files in the core directory.")
    .example("flow fmt --stdin=json", "Format input assuming JSON content.")
    .arguments("[paths...:file]")
    .option("--check", "Check if files are formatted.", { default: false })
    .option("--stdin=[filename]", "Pass content to format from stdin.", {
      equalsSign: true,
    })
    .action(async ({ check, stdin = false }, ...paths) => {
      const found = await files(paths, { stdin });
      if (!stdin && found.length === 0) return;
      await run(found, [
        (deno, files) => deno.fmt(files, { check }),
      ], {
        prefix: check ? "Checked formatting in" : "Formatted",
        stdin,
      });
    });
}

function checkCommand() {
  return new Command()
    .description("Type-check code.")
    .example("flow check", "Type-check modified files.")
    .example("flow check .", "Type-check all files.")
    .example("flow check **/*.ts", "Type-check all TypeScript files.")
    .example("flow check core/", "Type-check files in the core directory.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      const found = await files(paths);
      if (found.length === 0) return;
      await run(found, [
        (deno, files) => deno.check(files),
      ], {
        prefix: "Type-checked",
      });
    });
}

function lintCommand() {
  return new Command()
    .description("Lint code.")
    .example("flow lint", "Lint modified files.")
    .example("flow lint --doc", "Check also for doc lint problems.")
    .example("flow lint --fix", "Fix any fixable linting problems.")
    .example("flow lint .", "Lint all files.")
    .example("flow lint **/*.ts", "Lint all TypeScript files.")
    .example("flow lint core/", "Lint files in the core directory.")
    .arguments("[paths...:file]")
    .option("--doc", "Check for doc lint problems.", { default: false })
    .option("--fix", "Fix any fixable linting errors.", { default: false })
    .action(async ({ doc, fix }, ...paths) => {
      const found = await files(paths);
      if (found.length === 0) return;
      await run(found, [
        async (deno, files) => doc && await deno.doc(files, { lint: true }),
        async (deno, files) => await deno.lint(files, { fix }),
      ], {
        prefix: "Linted",
      });
    });
}

function testCommand() {
  return new Command()
    .description("Run tests using Deno's built-in test runner.")
    .example("flow test", "Run tests for modified files.")
    .example("flow test .", "Run all tests.")
    .example("flow test **/*.test.ts", "Run tests in TypeScript test files.")
    .example("flow test core/", "Run tests in the core directory.")
    .example("flow test --filter name", "Only run tests with 'name'.")
    .example("flow test --update", "Run tests and update snapshots and mocks.")
    .option("--filter <filter:string>", "Run only tests with matching names.")
    .option("--update", "Update snapshots and mocks.", { default: false })
    .arguments("[paths...:file]")
    .action(async ({ filter, update }, ...paths) => {
      const found = await files(paths);
      const regexMatch = filter?.match(/^\/(.*)(?<!\\)\/$/);
      const regexFilter = regexMatch?.[1] && new RegExp(regexMatch[1]);
      if (found.length === 0) return;
      await run(found, [
        (deno, files) =>
          deno.test(files, {
            ...filter ? { filter: regexFilter ?? filter } : {},
            update,
          }),
      ], {
        test: true,
      });
    });
}

interface InputOptions {
  stdin?: boolean | string;
}

interface MessageOptions {
  prefix?: string;
  test?: boolean;
}

type RunOptions = InputOptions & MessageOptions;

function denoOptions(): DenoOptions {
  let reported = false;
  function testLine(report: Partial<TestInfo>) {
    assertExists(report.test);
    const pad = "   ".repeat(report.test.length - 1);
    let line = `${pad}${report.test.at(-1)} ...`;
    if (report.success !== undefined) {
      assertExists(report.status);
      assertExists(report.time);
      const color = report.status === "ok"
        ? green
        : report.success
        ? yellow
        : red;
      line += ` ${color(report.status)} ${dim(`(${report.time})`)}`;
    }
    return line;
  }
  return {
    onError({ message }) {
      console.error();
      console.error(message);
      console.error();
    },
    onDebug({ message }) {
      if (!verbose) return;
      if (!reported) console.log();
      reported = true;
      console.debug(message.split("\n").map((l) => `   ${dim(l)}`).join("\n"));
    },
    onPartialInfo(report) {
      if (!Deno.stdout.isTerminal()) return;
      if (report.kind !== "test" || report.test === undefined) return;
      if (!reported) console.log();
      reported = true;
      console.log(
        SAVE_CURSOR + testLine(report) + RESTORE_CURSOR + moveCursorUp(),
      );
    },
    onInfo(report) {
      if (report.kind !== "test") return;
      if (!reported) console.log();
      reported = true;
      (report.success ? console.log : console.warn)(testLine(report));
    },
  };
}

async function files(
  paths: string[],
  options?: InputOptions,
): Promise<string[]> {
  if (options?.stdin) {
    if (paths.length > 0) {
      throw new Error("Cannot specify paths when reading from stdin");
    }
    return [];
  }
  if (paths.length === 0) {
    // determine modified directories if in a Git repository
    const { value } = await maybe(async () => {
      const repo = git();
      const remote = await repo.remote.current();
      assertExists(remote);
      const target = await repo.remote.head(remote);
      const diff = await repo.diff.status({ target });
      return distinct(diff.map((f) => dirname(f.path)));
    });
    if (value?.length === 0) {
      console.warn("🧽 No files modified");
      return [];
    }
    // run on all files if not in a Git repository
    paths = value ? value : ["."];
  }
  let found = await Array.fromAsync(find(paths, {
    type: "file",
    ignore: ["**/.git", "**/node_modules", "**/__testdata__"],
  }));
  const { value: unignored } = await maybe(() => git().ignore.omit(found));
  if (unignored !== undefined) {
    // exclude ignored paths, except for those explicitly provided
    found = intersect(found, unignored.concat(paths));
  }
  if (found.length === 0) throw new Error(`No files found: ${paths.join(" ")}`);
  return found;
}

async function run(
  files: string[],
  fns:
    ((deno: DenoCommands, files: string[]) => Promise<FileResult[] | false>)[],
  options?: RunOptions,
): Promise<void> {
  await using stdinFile = await fileFromStdin(options);
  if (stdinFile) files = [stdinFile.path()];
  const commands = deno(denoOptions());
  const { error, errors } = await maybe(async () => {
    const results = Object.values(
      (await pool(fns, (fn) => fn(commands, files), { concurrency: 1 }))
        .filter((r): r is FileResult[] => Array.isArray(r))
        .map((r) => associateBy(r, (f) => f.file))
        .reduce((a, b) => deepMerge(a, b)),
    );
    const output = message(results, options);
    if (stdinFile) {
      const content = await Deno.readTextFile(stdinFile.path());
      console.log(content.trimEnd());
    } else {
      console.log("✅", output);
    }
  });
  if (stdinFile && errors) {
    for (const error of errors) {
      error.message = error.message
        .replaceAll(toFileUrl(stdinFile.path()).toString(), "")
        .replaceAll(stdinFile.path(), "");
    }
  }
  if (error) throw error;
}

async function fileFromStdin(options?: InputOptions) {
  const { stdin } = options ?? {};
  if (!stdin) return undefined;
  const directory = await tempDirectory();
  const name = typeof stdin === "string"
    ? `stdin.${basename(stdin)}`
    : "stdin.ts";
  const file = directory.path(name);
  await Deno.writeTextFile(file, await toText(Deno.stdin.readable));
  return {
    path: () => file,
    [Symbol.asyncDispose]: directory[Symbol.asyncDispose],
  };
}

function message(
  results: FileResult[],
  options?: MessageOptions,
): string | undefined {
  let { prefix, test } = options ?? {};
  const count = (value: number, name: string) =>
    `${value} ${name}${value === 1 ? "" : "s"}`;
  const tests = results.flatMap((r) => r.info)
    .filter((i) => i.kind === "test")
    .filter((t) => t.test.length === 1);
  if (test) {
    prefix = tests.length
      ? `Ran ${count(tests.length, "test")} from`
      : "Found no tests in";
  }
  const errorCount = sumOf(results, (r) => r.error.length);
  let message = errorCount === 0
    ? `${prefix} ${count(results.length, "file")}`
    : `${prefix} ${count(results.length, "file")}, found ${
      count(errorCount, "problem")
    }`;
  if (tests.length > 0) {
    console.log();
    const passingTests = tests.filter((t) => t.success === true).length;
    const failingTests = tests.filter((t) => t.success === false).length;
    message = `${message} ${
      dim(`(${passingTests} passed, ` + `${failingTests} failed)`)
    }`;
  }
  if (errorCount === 0) return message;
  throw new Error(message);
}

if (import.meta.main) Deno.exit(await flow());
