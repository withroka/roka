import { Command, EnumType } from "@cliffy/command";
import { Table } from "@cliffy/table";
import { pool } from "@roka/async/pool";
import { version } from "@roka/cli/version";
import { bump } from "@roka/forge/bump";
import { compile, targets } from "@roka/forge/compile";
import { release } from "@roka/forge/release";
import { workspace } from "@roka/package";
import { common } from "@std/path/common";
import { resolve } from "@std/path/resolve";
import { changelog as changelogText } from "./changelog.ts";

async function filter(packages: string[]) {
  return (await workspace())
    .filter((pkg) => pkg.directory !== ".")
    .filter((pkg) =>
      packages.length === 0 ||
      packages.includes(pkg.module) ||
      packages.map((f) => resolve(f)).some((path) =>
        common([resolve(pkg.directory), path]) === path
      )
    );
}

function compileCommand(targets: string[]) {
  return new Command()
    .description("Compile a package.")
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
    .action(async (options, ...names) => {
      const packages = (await filter(names)).filter((pkg) =>
        pkg.config.compile
      );
      await pool(packages.map(async (pkg) => {
        const artifacts = await compile(pkg, options);
        console.log(`📦 Compiled ${pkg.module}`);
        artifacts.forEach((artifact) => console.log("🏺", artifact));
      }, options));
    });
}

function bumpCommand() {
  return new Command()
    .description("Bump package versions.")
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
    .action(async (options, ...names) => {
      const packages = (await filter(names)).filter((pkg) => pkg.update);
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
    .action(async (options, ...names) => {
      const packages = await filter(names);
      await pool(packages.map(async (pkg) => {
        const [rls, assets] = await release(pkg, options);
        console.log(`🚀 Released ${pkg.module} [${rls.url}]`);
        assets.forEach((x) => console.log(`🏺 ${x.name} [${x.url}]`));
      }));
    });
}

async function list(names: string[], changelog: boolean) {
  const packages = await filter(names);
  new Table().body(
    packages.map((pkg) => [
      "📦",
      pkg.directory,
      pkg.config.name,
      pkg.version,
      ...pkg.release?.version !== pkg.config.version
        ? ["🚨", pkg.release?.version, "👉", pkg.config.version]
        : [],
      changelog ? changelogText(pkg) : undefined,
    ]),
  ).render();
}

if (import.meta.main) {
  await new Command()
    .name("forge")
    .description("Manage packages.")
    .version(await version())
    .arguments("[packages...:file]")
    .option("--changelog", "Print changelog of updated packages.", {
      default: false,
    })
    .action(({ changelog }, ...names) => list(names, changelog))
    .command("compile", compileCommand(await targets()))
    .command("bump", bumpCommand())
    .command("release", releaseCommand())
    .parse();
}
