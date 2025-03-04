/**
 * Command-line interface for the forge toolset.
 *
 * Provides a CLI for managing Deno packages and workspaces including:
 * - Listing packages and their versions
 * - Compiling packages to executables
 * - Bumping package versions
 * - Creating GitHub releases
 *
 * @module
 */

import { Command, EnumType } from "@cliffy/command";
import { Table } from "@cliffy/table";
import { pool } from "@roka/async/pool";
import { version } from "@roka/forge/app";
import { bump } from "@roka/forge/bump";
import { changelog as changelogText } from "@roka/forge/changelog";
import { compile, targets } from "@roka/forge/compile";
import { type Package, workspace } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { join, relative } from "@std/path";

function compileCommand(targets: string[]) {
  return new Command()
    .description("Compile packages into binary executables.")
    .arguments("[packages...:file]")
    .type("target", new EnumType(targets))
    .option("--target=<architecture:target>", "Target OS architecture.", {
      collect: true,
    })
    .option("--release", "Use new release version.", { default: false })
    .option("--bundle", "Zip and bundle artfifacts.", { default: false })
    .option("--checksum", "Create a checksum file.", { default: false })
    .option("--install=[directory:file]", "Install for local user.")
    .option("--concurrency=<number:number>", "Max concurrent compilations.")
    .action(async (options, ...filters) => {
      const packages = (await workspace({ filters }))
        .filter((pkg) => pkg.config.compile);
      await pool(
        packages,
        async (pkg) => {
          const artifacts = await compile(pkg, options);
          console.log(`📦 Compiled ${pkg.module}`);
          artifacts.forEach((artifact) => console.log("🏺", artifact));
        },
        options,
      );
    });
}

function bumpCommand() {
  return new Command()
    .description("Bump versions on package config files.")
    .arguments("[packages...:file]")
    .option("--pr", "Create a pull request.", { default: false })
    .env("GIT_NAME=<name:string>", "Git user name for the bump commit.", {
      prefix: "GIT_",
    })
    .env("GIT_EMAIL=<email:string>", "Git user e-mail for the bump commit.", {
      prefix: "GIT_",
    })
    .env(
      "GITHUB_TOKEN=<token:string>",
      "GitHub personal token for GitHub actions.",
      { prefix: "GITHUB_" },
    )
    .action(async (options, ...filters) => {
      const packages = (await workspace({ filters }))
        .filter((pkg) => pkg.update);
      const pr = await bump(packages, options);
      if (pr) console.log(`🚀 Created version bump pull request [${pr.url}]`);
      else console.log("📦 Bumped package versions");
    });
}

function releaseCommand() {
  return new Command()
    .description("Creates releases for updated packages.")
    .option("--draft", "Create a draft release.", { default: false })
    .arguments("[packages...:file]")
    .env(
      "GITHUB_TOKEN=<token:string>",
      "GitHub personal token for GitHub actions.",
      { prefix: "GITHUB_", required: true },
    )
    .action(async (options, ...filters) => {
      const packages = (await workspace({ filters }))
        .filter((pkg) => pkg.config.version !== pkg.release?.version);
      await pool(packages, async (pkg) => {
        const [rls, assets] = await release(pkg, options);
        console.log(`🚀 Released ${pkg.module} [${rls.url}]`);
        assets.forEach((x) => console.log(`🏺 ${x.name} [${x.url}]`));
      }, { concurrency: 1 });
    });
}

function listCommand() {
  return new Command()
    .description("List packages, versions, and changelogs.")
    .arguments("[packages...:file]")
    .option("--submodules", "Print package submodules.", { default: false })
    .option("--changelog", "Print package changelog.", { default: false })
    .action(async ({ submodules, changelog }, ...filters) => {
      const packages = await workspace({ filters });
      new Table().body(
        packages.map((pkg) => [
          "📦",
          pkg.directory,
          submodules ? submodulesText(pkg) : pkg.config.name,
          pkg.version,
          ...pkg.release?.version !== pkg.config.version
            ? ["🚨", pkg.release?.version, "👉", pkg.config.version]
            : [],
          changelog ? changelogText(pkg) : undefined,
        ]),
      ).render();
    });
}

function submodulesText(pkg: Package): string | undefined {
  const name = pkg.config.name;
  if (name === undefined) return undefined;
  const exports = pkg.config.exports ?? {};
  if (typeof exports === "string") return name;
  return Object.keys(exports)
    .map((key) => join(name, relative(".", key)))
    .join("\n");
}

if (import.meta.main) {
  await new Command()
    .name("forge")
    .description("Manage packages.")
    .usage("<command> [options] [packages...]")
    .version(await version({ build: true, deno: true }))
    .default("list")
    .command("list", listCommand())
    .command("compile", compileCommand(await targets()))
    .command("bump", bumpCommand())
    .command("release", releaseCommand())
    .parse();
}
