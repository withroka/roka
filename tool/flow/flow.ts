// deno-lint-ignore-file no-console
import { Command } from "@cliffy/command";
import { version } from "@roka/forge/version";
import { find } from "@roka/fs/find";
import { git } from "@roka/git";
import { maybe } from "@roka/maybe";
import { intersect } from "@std/collections";
import { bold } from "@std/fmt/colors";
import { extname } from "@std/path";
import type { Problem } from "./deno.ts";
import { deno } from "./deno.ts";
import { docLint } from "./doc.ts";
import { fmt } from "./fmt.ts";

const DESCRIPTION = `
  ${bold("🍃 flow")}

  An assistant tool to eliminate chore work in your Deno projects. Current
  functionality is limited to extending "deno fmt".
`;

const SCRIPT_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mts",
  "mjs",
  "cts",
  "cjs",
];
const CODE_EXTENSIONS = [
  ...SCRIPT_EXTENSIONS,
  "md",
];
const SOURCE_EXTENSIONS = [
  ...CODE_EXTENSIONS,
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
 * Run the `flow` CLI tool.
 *
 * @returns The exit code of the command.
 */
export async function flow(): Promise<number> {
  let verbose = false;
  const cmd = new Command()
    .name("flow")
    .version(await version({ release: true, target: true }))
    .meta("deno", Deno.version.deno)
    .meta("v8", Deno.version.v8)
    .meta("typescript", Deno.version.typescript)
    .description(DESCRIPTION)
    .example("flow", "TODO")
    .example("forge doc", "Lint documentation.")
    .example("forge fmt", "Format code, including code blocks in docs.")
    .example("forge lint", "Lint code, including code blocks in docs.")
    .usage("<command> [options]")
    .option("--verbose", "Print additional information.", {
      hidden: true,
      global: true,
      action: () => verbose = true,
    })
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      const found = await files(paths);
      await process(found, SOURCE_EXTENSIONS, "Formatted", fmt);
      await process(
        found,
        SCRIPT_EXTENSIONS,
        "Linted documentation for",
        docLint,
      );
      await process(found, CODE_EXTENSIONS, "Linted", lint);
    })
    .command("doc", docCommand())
    .command("fmt", fmtCommand())
    .command("lint", lintCommand());
  const { errors } = await maybe(() => cmd.parse());
  for (const error of errors ?? []) {
    console.error(`❌ ${error.message}`);
    if (verbose) console.error(error);
  }
  return errors ? 1 : 0;
}

function docCommand() {
  return new Command()
    .description("Lint documentation.")
    .example("forge doc", "Lint documentation for all files.")
    .example("forge doc **/*.ts", "Lint JSDoc for all TypeScript files.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      await process(
        await files(paths),
        SCRIPT_EXTENSIONS,
        "Linted documentation for",
        docLint,
      );
    });
}

function fmtCommand() {
  return new Command()
    .description("Format code, including code blocks in JSDoc.")
    .example("forge fmt", "Format all files.")
    .example("forge fmt **/*.ts", "Format all TypeScript files.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      await process(await files(paths), SOURCE_EXTENSIONS, "Formatted", fmt);
    });
}

function lintCommand() {
  return new Command()
    .description("Lint code.")
    .example("forge lint", "Lint all files.")
    .example("forge lint **/*.ts", "Lint all TypeScript files.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      await process(await files(paths), CODE_EXTENSIONS, "Linted", lint);
    });
}

async function files(paths: string[]): Promise<string[]> {
  const explicit = paths.length > 0;
  let found = await Array.fromAsync(find(explicit ? paths : ["."], {
    type: "file",
    ignore: ["**/.git", "**/node_modules"],
  }));
  found = explicit ? found : intersect(
    found,
    await git().ignore.check(found, { matching: false }),
  );
  if (found.length === 0) throw new Error("No files found");
  return found;
}

async function* lint(files: string[]): AsyncIterableIterator<Problem> {
  yield* deno("lint", files, {
    args: ["--quiet", "--permit-no-files"],
    doc: true,
    ignore: [/^Error linting: .*$/],
  });
}

async function process(
  files: string[],
  extensions: string[],
  task: string,
  fn: (files: string[]) => AsyncIterableIterator<Problem>,
): Promise<void> {
  files = files
    .filter((x) =>
      extensions === undefined ||
      extensions.includes(extname(x).slice(1).toLowerCase())
    );
  const countText = (value: number, name: string) =>
    `${value} ${name}${value === 1 ? "" : "s"}`;
  const problems: Problem[] = [];
  for await (const problem of fn(files)) {
    problems.push(problem);
    console.error();
    console.error(problem.message);
    console.error();
  }
  if (problems.length === 0) {
    console.log(`✅ ${task} ${countText(files.length, "file")}.`);
  } else {
    console.error(
      `❌ ${task} ${countText(files.length, "file")},`,
      `found ${countText(problems.length, "problem")}.`,
    );
  }
}

if (import.meta.main) Deno.exit(await flow());
