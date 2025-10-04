// deno-lint-ignore-file no-console
import { Command } from "@cliffy/command";
import { version } from "@roka/forge/version";
import { find } from "@roka/fs/find";
import { git } from "@roka/git";
import { maybe } from "@roka/maybe";
import { intersect } from "@std/collections";
import { bold } from "@std/fmt/colors";
import { Problem } from "./deno.ts";
import { doc } from "./doc.ts";
import { fmt } from "./fmt.ts";
import { lint } from "./lint.ts";

const DESCRIPTION = `
  ${bold("🍃 flow")}

  An assistant tool to eliminate chore work in your Deno projects. Current
  functionality is limited to extending "deno fmt".
`;

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
    .example("forge fmt", "Format code, including code blocks in JSDoc.")
    .example("forge lint", "Lint code.")
    .usage("<command> [options]")
    .option("--verbose", "Print additional information.", {
      hidden: true,
      global: true,
      action: () => verbose = true,
    })
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      const found = await files(paths);
      console.log(`✅ Formatted ${await fmt(found)} files.`);
      if (paths.length === 0) {
        await doc(found, { lint: true });
      }
      console.log(`✅ Linted ${await lint(found)} files.`);
    })
    .command("fmt", fmtCommand())
    .command("lint", lintCommand());
  const { errors } = await maybe(() => cmd.parse());
  for (const error of errors ?? []) {
    console.error(`❌ ${error.message}`);
    if (verbose) console.error(error);
  }
  return errors ? 1 : 0;
}

function fmtCommand() {
  return new Command()
    .description("Format code, including code blocks in JSDoc.")
    .example("forge fmt", "Format all files.")
    .example("forge fmt **/*.ts", "Format all TypeScript files.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      const found = await files(paths);
      console.log(`✅ Formatted ${await fmt(found)} files.`);
    });
}

function lintCommand() {
  return new Command()
    .description("Lint code.")
    .example("forge lint", "Lint all files.")
    .example("forge lint **/*.ts", "Lint all TypeScript files.")
    .arguments("[paths...:file]")
    .action(async (_, ...paths) => {
      const found = await files(paths);
      if (paths.length === 0) {
        await doc(found, { lint: true });
      }
      await process(found, lint);
      console.log(`✅ Linted ${2} files.`);
    });
}

async function files(paths: string[]): Promise<string[]> {
  const explicit = paths.length > 0;
  const found = await Array.fromAsync(find(explicit ? paths : ["."], {
    type: "file",
    ignore: ["**/.git", "**/node_modules"],
  }));
  return explicit ? found : intersect(
    found,
    await git().ignore.check(found, { matching: false }),
  );
}

async function process(
  files: string[],
  fn: (files: string[]) => AsyncIterableIterator<Problem>,
): Promise<void> {
  const problems: Problem[] = [];
  try {
    for await (const problem of fn(files)) {
      problems.push(problem);
      console.error();
      console.error(problem.error);
      console.error();
    }
  } finally {
    console.error(`✅ Found ${problems.length} problems.`);
    console.error(`✅ Processed ${files.length} files.`);
  }
}

if (import.meta.main) Deno.exit(await flow());
