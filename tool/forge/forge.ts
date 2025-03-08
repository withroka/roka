/**
 * A monorepo tool for Deno workspaces.
 *
 * Roka "**forge**" is a tool for managing Deno packages hosted on GitHub. It
 * can compile binaries, calculate versions, and create GitHub releases.
 *
 * Run the tool with `deno run -A jsr:@roka/forge`.
 *
 * ## Usage
 *
 * List all packages.
 *
 * ```sh
 * > forge list
 * 📦 app/example
 * 📦 core/testing @roka/testing 0.2.0
 * 📦 tool/forge   @roka/forge   0.1.0
 * ```
 *
 * Compile a package into a binary.
 *
 * ```sh
 * > forge compile example
 * 📦 Compiled example
 * 🏺 dist/example/aarch64-apple-darwin/example
 * ```
 *
 * Compile and install binary for the user.
 *
 * ```sh
 * > forge compile example --install=$HOME/.local/bin
 * 📦 Compiled example
 * 🏺 dist/example/aarch64-apple-darwin/example
 * 🧩 Installed example
 * ```
 *
 * Compile a package into a release package.
 *
 * ```sh
 * > forge compile example --release --bundle --checksum
 * 📦 Compiled example
 * 🏺 dist/example/aarch64-apple-darwin/example
 * ```
 *
 * Bump package versions and create a pull request.
 *
 * ```sh
 * > forge bump --pr
 * 📦 Bumped package versions
 * 🚀 Created version bump pull request
 * ```
 *
 * Create a GitHub release.
 *
 * ```sh
 * > forge release example --draft
 * 🚀 Released example
 * ```
 *
 * ## Modules
 *
 * Functionality of `forge` is available programmatically through the following
 * modules.
 *
 *  -  {@link [bump]}: Bump package versions using
 *     {@link https://semver.org | semantic versioning}.
 *  -  {@link [changelog]}: Generate changelogs.
 *  -  {@link [compile]}: Create binary executables.
 *  -  {@link [package]}: Diagnose packages programmatically.
 *  -  {@link [release]}: Create GitHub releases.
 *  -  {@link [version]}: Provide version from compiled binaries.
 *
 * @todo Add documentation for GitHub workflows.
 *
 * @module forge
 */

import { Command, EnumType } from "@cliffy/command";
import { Table } from "@cliffy/table";
import { pool } from "@roka/async/pool";
import { bump } from "@roka/forge/bump";
import { changelog as changelogText } from "@roka/forge/changelog";
import { compile, targets } from "@roka/forge/compile";
import { type Package, workspace } from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { version } from "@roka/forge/version";
import { join, relative } from "@std/path";

function listCommand() {
  return new Command()
    .description("List packages, versions, and changelogs.")
    .example("forge list", "List all packages.")
    .example("forge list --modules", "List all modules.")
    .example("forge list --changelog", "Display package changelogs.")
    .arguments("[packages...:file]")
    .option("--modules", "Print exported package modules.", { default: false })
    .option("--changelog", "Print package changelog.", { default: false })
    .action(async ({ modules, changelog }, ...filters) => {
      const packages = await workspace({ filters });
      new Table().body(
        packages.map((pkg) => [
          "📦",
          pkg.directory,
          modules ? modulesText(pkg) : pkg.config.name,
          pkg.version,
          ...(pkg.release?.version !== pkg.config.version)
            ? ["🚨", pkg.release?.version, "👉", pkg.config.version]
            : [],
          changelog ? changelogText(pkg) : undefined,
        ]),
      ).render();
    });
}

function modulesText(pkg: Package): string | undefined {
  const name = pkg.config.name;
  if (name === undefined) return undefined;
  const exports = pkg.config.exports ?? {};
  if (typeof exports === "string") return name;
  return Object.keys(exports)
    .map((key) => join(name, relative(".", key)))
    .join("\n");
}

function compileCommand(targets: string[]) {
  return new Command()
    .description("Compile packages into binary executables.")
    .example("forge compile", "Compile packages.")
    .example("forge compile --install", "Install binaries.")
    .example(
      "forge compile --release --bundle --checksum",
      "Create release assets.",
    )
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
          console.log(`📦 Compiled ${pkg.name}`);
          artifacts.forEach((artifact) => console.log("🏺", artifact));
          if (options.install) console.log(`🧩 Installed ${pkg.name}`);
        },
        options,
      );
    });
}

function bumpCommand() {
  return new Command()
    .description("Bump versions on package config files.")
    .example("forge bump", "Bump versions.")
    .example("forge bump --pr", "Create a version bump PR.")
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
    .example("forge release", "Create releases and tags for all updates.")
    .example("forge release --draft", "Create draft releases for all updates.")
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
        console.log(`🚀 Released ${pkg.name} [${rls.url}]`);
        assets.forEach((x) => console.log(`🏺 ${x.name} [${x.url}]`));
      }, { concurrency: 1 });
    });
}

if (import.meta.main) {
  await new Command()
    .name("forge")
    .description("Manage packages.")
    .example("forge", "List all packages.")
    .example("forge list 'core/*'", "List packages in the 'core' directory.")
    .example("forge compile --install", "Compile and install all binaries.")
    .example("forge bump --pr", "Bump versions and create a bump PR.")
    .example("forge release --draft", "Create releases with compiled assets.")
    .usage("<command> [options] [packages...]")
    .version(await version({ build: true, deno: true }))
    .default("list")
    .command("list", listCommand())
    .command("compile", compileCommand(await targets()))
    .command("bump", bumpCommand())
    .command("release", releaseCommand())
    .parse();
}
