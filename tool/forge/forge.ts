// deno-lint-ignore-file no-console
/**
 * A monorepo tool for Deno workspaces.
 *
 * Roka “**forge**” is crafted for the community for managing Deno packages
 * developed on GitHub. It can compile binaries, calculate versions, and even
 * create GitHub releases. It works best with monorepos of multiple packages
 * published to JSR.
 *
 * ## Usage
 *
 * To get started, just run **forge** with `deno run -A jsr:@roka/forge` and
 * you’re all set! Or, you can install with `deno install -gA jsr:@roka/forge`,
 * and then run with `forge`. No need for any configuration.
 *
 * ## Packages
 *
 * The repository is treated as a list of Deno packages by **forge**. It
 * supports simple projects with a single package and monorepos that use
 * [Deno workspaces](https://docs.deno.com/runtime/fundamentals/workspaces/).
 *
 * ```sh
 * forge list
 * ```
 * ```
 * 📦 example @roka/example 1.2.3
 * 📦 testing @roka/testing 0.1.0
 * ```
 *
 * By default, every **forge** command applies to all packages in the
 * repository. However, you can filter packages by specifying a list of package
 * directories or using glob patterns.
 *
 * ```sh
 * forge list "exam*"
 * ```
 *
 * ## Versions
 *
 * Versioning in **forge** is only effective when the repository adheres to
 * {@link https://www.conventionalcommits.org | Conventional Commits}. Any bug
 * fix results in a patch version, while a new feature is introduced in a minor
 * version. Commits marked as _breaking changes_ trigger a new major version.
 *
 * A {@link https://semver.org | semantic version} is calculated for every
 * package at every commit. The new version begins with the latest release, or
 * "0.0.0" if the package has no releases. It then tracks the commits made
 * since that release.
 *
 * ```sh
 * forge changelog
 * ```
 * ```
 * 🏷️ example@2.0.0-pre.3+fedcba9
 *
 *   test(example): forgot unit-testing (#6)
 *   style(example): nicer code style (#5)
 *   fix(example)!: really fix bug with breaking change (#4)
 *   revert(example): revert bug fix, it broke something (#3)
 *   fix(example) fix bug (#2)
 *   feat(example): introduce new feature (#1)
 * ```
 *
 * The current package version will include a pre-release number, which is
 * calculated based on the number of commits that make a version change.
 * Additionally, the version will have a commit hash appended to it, which is
 * derived from the last commit that updated the package.
 *
 * If you’re working on just one package, you can skip the scopes altogether.
 * In this case, a commit summary like “_feat: feature_” will also trigger a
 * version change. But if you’re in a workspace with multiple packages, the
 * scope is needed to figure out which packages will update.
 *
 * You can update multiple packages with a single commit by listing their names
 * with a comma in between. But before you do that, maybe it’s time to think
 * about whether your pull requests can be smaller. 🤓

 *
 * ## Releases
 *
 * ### Bump the versions
 *
 * To start a new release, let’s first update the package versions in the
 * configuration files. We’re talking about the `version` field in `deno.json`.
 * If you change this version, it means a new release is coming, and **forge**
 * can help you with that.
 *
 * Let’s create a pull request on GitHub to increment our package version.
 * We’ll use the [GitHub CLI](https://cli.github.com) to get a token and pass
 * it to forge to identify the pull request creator. When our releases are
 * automated with workflows, authentication will be handled differently. More
 * to that later.
 *
 * ```sh
 * git checkout main
 * GITHUB_TOKEN=$(gh auth token) forge bump example --release --pr
 * ```
 *
 * The `--release` flag drops the pre-release and build
 * information from the current version, resulting in a version like _2.0.0_.
 * If we had omitted this flag, the release would have been a pre-release.
 *
 * The pull request generated by the `--pr` flag will include changes to the
 * configuration and changelog files. Review and merge these changes, and the
 * release will be ready to roll at the merged commit.
 *
 * Check out an [example pull request](https://github.com/withroka/roka/pull/181)
 * that updates multiple packages. Emojis are optional and enabled with the
 * `--emoji` flag to add some extra flair. 💅
 *
 * At this point, we are ready to publish the packages to JSR. However, before
 * that, let’s proceed to create a release on GitHub, which is the second step.
 *
 * ### Release on GitHub
 *
 * Great news! The version change is now merged, and GitHub knows the commit
 * hash. Let’s create a release right here!
 *
 * ```sh
 * git pull
 * GITHUB_TOKEN=$(gh auth token) forge release example --draft
 * ```
 *
 * The draft release created on GitHub will have the new version number,
 * the commit changelog, and a link to the documentation on JSR. This
 * [example release](https://github.com/withroka/roka/releases/tag/testing@0.2.0)
 * was created automatically when the the example pull request above was merged.
 *
 * At this point, you may want to add further details to your release summary.
 * If everything looks good, go ahead and publish it. This will create a new
 * release tag for the released package, like _example@2.0.0_.
 *
 * ### Publish to JSR
 *
 * Finally, at this tagged commit, we can publish our packages to JSR.
 *
 * ```sh
 * deno publish
 * ```
 *
 * Simply running this command will work, because the `deno.json` file is
 * up-to-date, and all our changes are committed.
 *
 * The command will guide you to authenticate with JSR and create any new
 * packages if necessary. Ideally, we link our packages to their GitHub
 * repositories and automate the publishing process with GitHub actions. See
 * [JSR documentation for publishing](https://jsr.io/docs/publishing-packages)
 * for this.
 *
 * ### Automate with Actions
 *
 * We’ve covered the three steps, _bump_, _release_, and _publish_, all of
 * which can be automated using GitHub workflows. In fact, it’s the recommended
 * way, so we are not slowed down by mistakes.
 *
 * For authentication, the convenient `GITHUB_TOKEN` works. However, this token
 * lacks the ability to initiate CI checks for newly created pull requests.
 * Additionally, your GitHub account can restrict this token from creating
 * pull requests, which is a wise practice. A better solution is to create a
 * personal access token with read and write permissions to _contents_ and
 * _pull requests_.
 *
 * The personal access token is linked to your personal account, and PRs will
 * be created by you. If this suits your needs, you’re all set. However, you
 * won’t be able to approve the bump requests yourself. For teams, it may be
 * preferable to create a bot account and use its personal access token instead.
 *
 * Check out the workflows in the [roka](https://github.com/withroka/roka)
 * repository to see how we can automate all steps. With **forge** taking care
 * of most of the work, we can either chill or find more time for coding. 💆‍♀️
 *
 * ## Assets
 *
 * _**WARNING**: This feature is highly experimental._
 *
 * The tool supports a non-standard `compile` extension in the `deno.json`
 * file. Any package with this field will generate release assets during a
 * release.
 *
 * ```json
 * {
 *   "name": "@roka/example",
 *   "version": "2.0.0",
 *   "compile": {
 *     "main": "example.ts"
 *   }
 * }
 * ```
 *
 * A package with the `compile` configuration will be compiled into a binary
 * for every supported Deno [target](https://docs.deno.com/go/compile). These
 * compiled binaries will be bundled and uploaded to the GitHub release as
 * assets.
 *
 * ```sh
 * forge release example
 * ```
 * ```
 * 🚀 Created release example@2.0.0
 *
 *   [https://github.com/withroka/example/releases/tag/example@2.0.0]
 *
 *   🏺 x86_64-unknown-linux-gnu.tar.gz
 *   🏺 aarch64-unknown-linux-gnu.tar.gz
 *   🏺 x86_64-pc-windows-msvc.zip
 *   🏺 x86_64-apple-darwin.tar.gz
 *   🏺 aarch64-apple-darwin.tar.gz
 *   🏺 sha256.txt
 * ```
 *
 * Magic! 🔮
 *
 * ## Modules
 *
 * This library also offers programmatic functionality through the following
 * modules:
 *
 *  -  {@link [bump]}: Bump package versions.
 *  -  {@link [changelog]}: Generate changelogs.
 *  -  {@link [compile]}: Create binary executables.
 *  -  {@link [package]}: Retrieve package information.
 *  -  {@link [release]}: Create GitHub releases.
 *  -  {@link [testing]}: Write tests for **forge**.
 *  -  {@link [version]}: Provide version from compiled binaries.
 *
 * @todo Add documentation for GitHub workflows.
 * @todo Gracefully handle errors in the CLI.
 * @todo Better output when we are on a pre-release tag.
 * @todo Make bump trigger CI on force push.
 *
 * @module forge
 */

import { Command, EnumType, ValidationError } from "@cliffy/command";
import { Table } from "@cliffy/table";
import { pool, pooled } from "@roka/async/pool";
import type { Repository } from "@roka/github";
import { bold } from "@std/fmt/colors";
import { join, relative } from "@std/path";
import { bump } from "./bump.ts";
import { changelog } from "./changelog.ts";
import { compile, targets } from "./compile.ts";
import { commits, type Package, releases, workspace } from "./package.ts";
import { release } from "./release.ts";
import { version } from "./version.ts";

const DESCRIPTION = `
  ${bold("🛠️ forge")}

  A Deno monorepo tool that manages packages on GitHub and JSR, including
  versioning, releases, and compilation. It works on a git repository using
  Conventional Commits.
`;

/**
 * Options for the {@link forge} function.
 *
 * These are used for testing.
 */
export interface ForgeOptions {
  /** GitHub repository to use. */
  repo: Repository;
}

/**
 * Run the `forge` tool with the given command-line arguments.
 *
 * @param args Command-line arguments.
 * @returns The exit code of the command.
 */
export async function forge(
  args: string[],
  options?: ForgeOptions,
): Promise<number> {
  let verbose = false;
  const cmd = new Command()
    .name("forge")
    .version(await version({ release: true, target: true }))
    .meta("deno", Deno.version.deno)
    .meta("v8", Deno.version.v8)
    .meta("typescript", Deno.version.typescript)
    .description(DESCRIPTION)
    .example("forge", "List all packages.")
    .example("forge list 'core/*'", "List packages in the 'core' directory.")
    .example("forge compile --install", "Compile and install all binaries.")
    .example("forge bump --pr", "Bump versions and create a bump PR.")
    .example("forge release --draft", "Create releases with compiled assets.")
    .usage("<command> [options] [packages...]")
    .option("--verbose", "Print additional information.", {
      hidden: true,
      global: true,
      action: () => verbose = true,
    })
    .noExit()
    .default("list")
    .command("list", listCommand(options))
    .command("changelog", changelogCommand(options))
    .command("compile", compileCommand(await targets(), options))
    .command("bump", bumpCommand(options))
    .command("release", releaseCommand(options));
  try {
    await cmd.parse(args);
  } catch (e: unknown) {
    if (e instanceof ValidationError) {
      cmd.showHelp();
      console.error(`❌ ${e.message}`);
      return 1;
    }
    const errors = (e instanceof AggregateError) ? e.errors : [e];
    for (const error of errors) {
      console.error(`❌ ${error.message}`);
      if (verbose) console.error(error);
      else if (error["cause"] && error["cause"]["error"]) {
        console.error(error.cause.error);
      }
    }
    return 2;
  }
  return 0;
}

function listCommand(context: ForgeOptions | undefined) {
  return new Command()
    .description("List packages and versions.")
    .example("forge list", "List all packages.")
    .example("forge list --modules", "List all modules.")
    .arguments("[packages...:file]")
    .option("--modules", "Print exported package modules.", { default: false })
    .action(async (options, ...filters) => {
      const packages = await filter(filters, context);
      Table.from([
        ...packages.map((pkg) => {
          return [packageRow(pkg), ...moduleRows(pkg, options)];
        }).flat(),
      ]).render();
    });
}

function packageRow(pkg: Package): string[] {
  const releasing = pkg.config.version !== undefined &&
    pkg.config.version !== (pkg.latest?.version ?? "0.0.0");
  return [
    `${releasing ? "🚨" : "📦"} ${pkg.config.name ?? pkg.name}`,
    pkg.config.version !== undefined
      ? (releasing
        ? `${pkg.latest?.version ?? "0.0.0"} 👉 ${pkg.config.version}`
        : pkg.version)
      : "",
  ];
}

function moduleRows(pkg: Package, { modules = false }): string[][] {
  if (!modules) return [];
  const exports = pkg.config.exports ?? {};
  const mapping = (typeof exports === "string") ? { ".": exports } : exports;
  const rows = Object.entries(mapping)
    .map(([name, path]) => [
      `  🧩 ${relative(".", name) || "(default)"}`,
      join(pkg.directory, path),
    ]);
  return [[], ...rows, []];
}

function changelogCommand(context: ForgeOptions | undefined) {
  return new Command()
    .description("Generate changelogs.")
    .example("forge changelog", "List unreleased changes.")
    .example("forge changelog --type feat --no-breaking", "List new features.")
    .example("forge changelog --markdown --all", "All releases in Markdown.")
    .arguments("[packages...:file]")
    .option("--all", "Generate changelog for all releases.")
    .option("--type=<type:string>", "Commit type.", { collect: true })
    .option("--breaking", "Only breaking changes.")
    .option("--no-breaking", "Skip breaking changes of filtered types.")
    .option("--emoji", "Use emoji for commit summaries.", { default: false })
    .option("--markdown", "Generate Markdown.", { default: false })
    .action(async (options, ...filters) => {
      const packages = await filter(filters, context);
      const commitOptions = {
        ...options.type !== undefined && { type: options.type },
        ...options.breaking !== undefined && { breaking: options.breaking },
      };
      const changelogOptions = {
        ...options.markdown
          ? {}
          : { markdown: { heading: "🏷️  ", bullet: "  " } },
        emoji: options.emoji,
      };
      async function* changelogs(pkg: Package) {
        const log = await commits(pkg, {
          ...commitOptions,
          ...pkg.latest?.range.to && { range: { from: pkg.latest.range.to } },
        });
        if (log.length) {
          yield changelog(log, {
            ...changelogOptions,
            title: `${pkg.name}@${pkg.version}`,
          });
        }
        if (!options.all) return;
        const releasesWithCommits = pooled(
          await releases(pkg),
          async (release) => ({
            ...release,
            commits: await commits(pkg, { ...changelogOptions, ...release }),
          }),
        );
        for await (const release of releasesWithCommits) {
          if (release.commits.length) {
            yield changelog(release.commits, {
              ...changelogOptions,
              title: `${pkg.name}@${release.version}`,
            });
          }
        }
      }
      for (const pkg of packages) {
        for await (let log of changelogs(pkg)) {
          if (Deno.stdout.isTerminal()) log = log.replace(/ ♻️ /g, " ♻️  ");
          console.log(log);
        }
      }
    });
}

function compileCommand(targets: string[], context: ForgeOptions | undefined) {
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
      const packages = (await filter(filters, context))
        .filter((pkg) => pkg.config.compile);
      await pool(
        packages,
        async (pkg) => {
          const artifacts = await compile(pkg, options);
          console.log(`📦 Compiled ${pkg.name}`);
          console.log();
          for (const artifact of artifacts) console.log(`  🏺 ${artifact}`);
          if (options.install) console.log(`  💾 Installed ${pkg.name}`);
          console.log();
        },
        options,
      );
    });
}

function bumpCommand(context: ForgeOptions | undefined) {
  return new Command()
    .description("Bump versions on package config files.")
    .example("forge bump", "Bump versions.")
    .example("forge bump --release", "Bump to the next release version.")
    .example("forge bump --release --pr", "Create a version bump PR.")
    .example("forge bump --changelog=CHANGELOG.md", "Update changelog file.")
    .arguments("[packages...:file]")
    .option("--release", "Bump to the next release.", { default: false })
    .option("--changelog=<file:string>", "Update changelog file.")
    .option("--pr", "Create a pull request.", { default: false })
    .option("--draft", "Create a draft pull request.", { default: false })
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
      const packages = (await filter(filters, context))
        .filter((pkg) => pkg.config.version !== undefined);
      if (!packages.length) console.log("📦 No packages to release");
      const pr = await bump(packages, {
        ...options,
        ...context?.repo && { repo: context.repo },
      });
      if (pr) {
        console.log(`🚀 Created bump pull request`);
        console.log();
        console.log(`  [${pr.url}]`);
        console.log();
      } else {
        console.log("📦 Bumped package versions");
      }
    });
}

function releaseCommand(context: ForgeOptions | undefined) {
  return new Command()
    .description("Creates releases for updated packages.")
    .example("forge release", "Create releases and tags for all updates.")
    .example("forge release --draft", "Create draft releases for all updates.")
    .arguments("[packages...:file]")
    .option("--draft", "Create a draft release.", { default: false })
    .option("--emoji", "Use emoji for commit summaries.", { default: false })
    .env(
      "GITHUB_TOKEN=<token:string>",
      "GitHub personal token for GitHub actions.",
      { prefix: "GITHUB_", required: true },
    )
    .action(async (options, ...filters) => {
      const packages = (await filter(filters, context)).filter((pkg) =>
        pkg.config.version !== undefined &&
        pkg.config.version !== (pkg.latest?.version ?? "0.0.0")
      );
      if (!packages.length) console.log("📦 No packages to release");
      await pool(packages, async (pkg) => {
        const [rls, assets] = await release(pkg, {
          ...options,
          ...context?.repo && { repo: context.repo },
        });
        console.log(`🚀 Created release ${pkg.name}@${pkg.version}`);
        console.log();
        console.log(`  [${rls.url}]`);
        console.log();
        if (assets.length) {
          assets.forEach((x) => console.log(`  🏺 ${x.name}`));
          console.log();
        }
      }, { concurrency: 1 });
    });
}

async function filter(
  filters: string[],
  options: ForgeOptions | undefined,
): Promise<Package[]> {
  return await workspace({
    ...options?.repo && { root: options?.repo.git.path() },
    filters,
  });
}

if (import.meta.main) Deno.exit(await forge(Deno.args));
