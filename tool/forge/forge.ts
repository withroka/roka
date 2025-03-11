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
 * 📦 example      @roka/example 1.2.3+pre.3+fedcba9
 * 📦 testing      @roka/testing 0.1.0
 * ```
 *
 * Generate changelogs.
 *
 * ```sh
 * > forge changelog --emoji
 * 🏷️ example@1.2.3+pre.3+fedcba9
 *
 *  🧪 forgot unit-testing (#6)
 *  🎨 nicer code style (#5)
 *  🐛 really fix bug with breaking change (#4) 💥
 *  ⏪ revert bug fix, it broke something (#3)
 *  🐛 fix bug (#2)
 *  ✨ introduce new feature (#1)
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
 * > forge compile example --bundle --checksum
 * 📦 Compiled example
 * 🏺 dist/example/aarch64-apple-darwin/example
 * ```
 *
 * Bump package versions and create a pull request.
 *
 * ```sh
 * > forge bump --next --changelog=CHANGELOG.md --pr
 * 📦 Bumped package versions
 * 🚀 Created bump PR
 * ```
 *
 * Create a GitHub release.
 *
 * ```sh
 * > forge release example --draft
 * 🚀 Created release example@1.2.3
 * ```
 *
 * ## Modules
 *
 * Functionality of `forge` is available programmatically through the following
 * modules.
 *
 *  -  {@link [package]}: Diagnose packages programmatically.
 *  -  {@link [changelog]}: Generate changelogs.
 *  -  {@link [compile]}: Create binary executables.
 *  -  {@link [bump]}: Bump package versions using
 *     {@link https://semver.org | semantic versioning}.
 *  -  {@link [release]}: Create GitHub releases.
 *  -  {@link [version]}: Provide version from compiled binaries.
 *  -  {@link [testing]}: Testing utilities for the library.
 *
 * @todo Add documentation for GitHub workflows.
 * @todo Gracefully handle errors in the CLI.
 *
 * @module forge
 */

import { Command, EnumType } from "@cliffy/command";
import { Table } from "@cliffy/table";
import { pool, pooled } from "@roka/async/pool";
import { bump } from "@roka/forge/bump";
import { changelog } from "@roka/forge/changelog";
import { compile, targets } from "@roka/forge/compile";
import {
  commits,
  type Package,
  releases,
  workspace,
} from "@roka/forge/package";
import { release } from "@roka/forge/release";
import { version } from "@roka/forge/version";
import { join, relative } from "@std/path";

function listCommand() {
  return new Command()
    .description("List packages and versions.")
    .example("forge list", "List all packages.")
    .example("forge list --modules", "List all modules.")
    .arguments("[packages...:file]")
    .option("--modules", "Print exported package modules.", { default: false })
    .action(async ({ modules }, ...filters) => {
      const packages = await workspace({ filters });
      new Table().body(
        packages.map((pkg) => [
          "📦",
          pkg.directory,
          modules ? modulesText(pkg) : pkg.config.name,
          pkg.config.version !== undefined ? pkg.version : undefined,
          ...(pkg.latest?.version !== pkg.config.version)
            ? ["🚨", pkg.latest?.version, "👉", pkg.config.version]
            : [],
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

function changelogCommand() {
  return new Command()
    .description("Generate changelogs.")
    .example("forge changelog", "List unreleased changes.")
    .example("forge changelog --type feat --no-breaking", "List new features.")
    .example("forge changelog --markdown --all", "All releases in Markdown.")
    .option("--all", "Generate changelog for all releases.")
    .option("--type=<type:string>", "Commit type.", { collect: true })
    .option("--breaking", "Only breaking changes.")
    .option("--no-breaking", "Skip breaking changes of filtered types.")
    .option("--emoji", "Use emoji for commit summaries.", { default: false })
    .option("--markdown", "Generate Markdown.", { default: false })
    .arguments("[packages...:file]")
    .action(async ({ all, type, breaking, emoji, markdown }, ...filters) => {
      const packages = await workspace({ filters });
      const options = {
        ...type && { type },
        ...breaking !== undefined && { breaking },
        ...markdown ? {} : { markdown: { heading: "🏷️  ", bullet: " " } },
        emoji,
      };
      async function* changelogs(pkg: Package) {
        const log = await commits(pkg, {
          ...options,
          ...pkg.latest && { range: { from: pkg.latest.tag } },
        });
        if (log.length) {
          yield changelog(log, {
            ...options,
            title: `${pkg.name}@${pkg.version}`,
          });
        }
        if (!all) return;
        const releasesWithCommits = pooled(
          await releases(pkg),
          async (release) => ({
            ...release,
            commits: await commits(pkg, { ...options, ...release }),
          }),
        );
        for await (const release of releasesWithCommits) {
          if (release.commits.length) {
            yield changelog(release.commits, {
              ...options,
              title: `${pkg.name}@${release.tag.name}`,
            });
          }
        }
      }
      for (const pkg of packages) {
        for await (const log of changelogs(pkg)) {
          console.log(log.replace(/ ♻️ /g, " ♻️  "));
        }
      }
    });
}

function compileCommand(targets: string[]) {
  return new Command()
    .description("Compile packages into binary executables.")
    .example("forge compile", "Compile packages.")
    .example("forge compile --install", "Install binaries.")
    .arguments("[packages...:file]")
    .type("target", new EnumType(targets))
    .option("--target=<architecture:target>", "Target OS architecture.", {
      collect: true,
    })
    .option("--bundle", "Zip and bundle artifacts.", { default: false })
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
    .example("forge bump --next", "Bump to the next release version.")
    .example("forge bump --next --pr", "Create a version bump PR.")
    .example("forge bump --changelog=CHANGELOG.md", "Update changelog file.")
    .arguments("[packages...:file]")
    .option("--next", "Bump to the next release version.", { default: false })
    .option("--changelog=<file:string>", "Update changelog file.")
    .option("--pr", "Create a pull request.", { default: false })
    .option("--emoji", "Use emoji for commit changelog.", { default: false })
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
      const packages = (await workspace({ filters })).filter(
        (pkg) => pkg.config.version !== undefined,
      );
      const pr = await bump(packages, options);
      if (pr) console.log(`🚀 Created bump PR [${pr.url}]`);
      else console.log("📦 Bumped package versions");
    });
}

function releaseCommand() {
  return new Command()
    .description("Creates releases for updated packages.")
    .example("forge release", "Create releases and tags for all updates.")
    .example("forge release --draft", "Create draft releases for all updates.")
    .option("--draft", "Create a draft release.", { default: false })
    .option("--emoji", "Use emoji for commit summaries.", { default: false })
    .arguments("[packages...:file]")
    .env(
      "GITHUB_TOKEN=<token:string>",
      "GitHub personal token for GitHub actions.",
      { prefix: "GITHUB_", required: true },
    )
    .action(async (options, ...filters) => {
      const packages = (await workspace({ filters }))
        .filter((pkg) => pkg.version !== pkg.latest?.version);
      await pool(packages, async (pkg) => {
        const [rls, assets] = await release(pkg, options);
        console.log(
          `🚀 Created release ${pkg.name}@${pkg.version} [${rls.url}]`,
        );
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
    .command("changelog", changelogCommand())
    .command("compile", compileCommand(await targets()))
    .command("bump", bumpCommand())
    .command("release", releaseCommand())
    .parse();
}
