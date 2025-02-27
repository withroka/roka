import { Command } from "@cliffy/command";
import { Table } from "@cliffy/table";
import { pool } from "@roka/async/pool";
import { git, type User } from "@roka/git";
import { github, type Repository } from "@roka/github";
import {
  type Package,
  PackageError,
  packageInfo,
  workspace,
} from "@roka/package";
import { assert } from "@std/assert";
import { format as formatBytes } from "@std/fmt/bytes";
import { join } from "@std/path";
import { format as formatVersion, parse as parseVersion } from "@std/semver";
import { compile, compileTargets } from "./compile.ts";

const BRANCH = "automated/bump";

function changelogText(pkg: Package): string {
  return pkg.update?.changelog?.map((c) => ` * ${c.summary}`).join("\n") ?? "";
}

async function releaseBody(pkg: Package): Promise<string> {
  assert(pkg.version, "Cannot release a package without version");
  const title = pkg.release?.tag ? "Changelog" : "Initial release";
  const repo = await github().repos.get();
  const tag = `${pkg.module}@${pkg.version}`;
  const fullChangelogUrl = pkg?.release?.tag
    ? `compare/${pkg.release.tag.name}...${tag}`
    : `commits/${tag}/${pkg.directory}`;
  return [
    `## ${title}`,
    "",
    changelogText(pkg),
    "",
    "## Details",
    "",
    ` * [Full changelog](${repo.url}/${fullChangelogUrl})`,
    ` * [Documentation](https://jsr.io/${pkg.config.name}@${pkg.version})`,
  ]
    .join("\n");
}

async function writeConfig(pkg: Package): Promise<void> {
  await Deno.mkdir(pkg.directory, { recursive: true });
  await Deno.writeTextFile(
    join(pkg.directory, "deno.json"),
    JSON.stringify(pkg.config, undefined, 2) + "\n",
  );
}

async function bumpVersions(
  repo: Repository,
  packages: Package[],
  user: Partial<User>,
) {
  packages = packages.filter((pkg) => pkg.update);
  if (!packages.length) {
    console.log("🚫 No packages to bump.");
    return;
  }
  await Promise.all(packages.map(async (pkg) => {
    // update config versions
    assert(pkg.update, "Cannot bump a package without update");
    pkg.config.version = formatVersion({
      ...parseVersion(pkg.update.version),
      prerelease: [],
      build: [],
    });
    await writeConfig(pkg);
  }));
  packages = await Promise.all(
    packages.map(async (p) => await packageInfo({ directory: p.directory })),
  );
  const title = "chore: release";
  const body = packages
    .map((
      pkg,
    ) => [
      `## ${pkg.module}@${pkg.version} [${pkg.update?.type}]`,
      changelogText(pkg),
    ])
    .flat()
    .join("\n\n");
  {
    // commit version bump changes
    await repo.git.branches.checkout({ new: BRANCH });
    await repo.git.config.set({ user });
    await repo.git.commits.create(title, { body, all: true });
  }
  const [pr] = await repo.pulls.list({ title, closed: false });
  {
    // create or update version bump PR
    if (pr) {
      await repo.git.commits.push({ force: true, branch: BRANCH }); // can this be done without force?
      pr.update({ body });
      console.log(`🤖 Updated release PR ${pr.number} (${pr.url})`);
    } else {
      await repo.git.commits.push({ branch: BRANCH });
      const pr = await repo.pulls.create({ title, body, draft: true });
      console.log(`🤖 Created release PR ${pr.number} (${pr.url})`);
    }
  }
}

async function createReleases(
  repo: Repository,
  packages: Package[],
) {
  packages = packages.filter((pkg) =>
    pkg.config.version && pkg.release?.version !== pkg.config.version
  );
  if (!packages.length) {
    console.log("🚫 No packages to release.");
    return;
  }
  await pool(packages.map((pkg) => createRelease(repo, pkg)), {
    concurrency: 1,
  });
}

async function createRelease(repo: Repository, pkg: Package) {
  assert(pkg.config.version, "Cannot release a package without version");
  const version = parseVersion(pkg.config.version);
  const name = `${pkg.module}@${pkg.config.version}`;
  let [release] = await repo.releases.list({ name, draft: true });
  {
    // create or update release
    const head = await git().commits.head();
    const data = {
      name,
      tag: name,
      body: await releaseBody(pkg),
      isDraft: true,
      isPreRelease: !!version.prerelease?.length,
      commit: head.hash,
    };
    if (release) {
      if (!release.draft) {
        throw new PackageError("Cannot update a published release");
      }
      release = await release.update(data);
      console.log(`🚀 Updated release ${release.name} (${release.url})`);
    } else {
      release = await repo.releases.create(name, { ...data });
      console.log(`🚀 Created release ${release.name} (${release.url})`);
    }
  }
  // delete existing assets
  const assets = await release.assets.list();
  await Promise.all(assets.map((asset) => asset.delete()));
  if (pkg.config.compile) {
    const artifacts = await compile(pkg, {
      target: await compileTargets(),
      release: true,
      bundle: true,
      checksum: true,
      // https://github.com/denoland/deno/issues/27988
      concurrency: 1,
    });
    await pool(
      artifacts.flat().map(async (artifact) => {
        const asset = await release.assets.upload(artifact);
        console.log(
          `🏺 Uploaded ${asset.name} (${
            formatBytes(asset.size)
          }) to release ${release.name} `,
        );
      }),
      { concurrency: 10 },
    );
  }
}

function output(packages: Package[], changelog: boolean) {
  new Table().body(
    packages.map((pkg) => [
      "📦",
      pkg.directory,
      pkg.config.name,
      pkg.version,
      ...pkg.release?.version !== pkg.config.version
        ? ["🚨", pkg.release?.version, "👉", pkg.config.version]
        : [],
    ]),
  ).render();
  if (changelog) {
    if (packages.some((pkg) => pkg.update)) console.log();
    for (const pkg of packages) {
      if (pkg.update) {
        console.log(`📝 ${pkg.config.name} [${pkg.version}]`);
        console.log();
        for (const commit of pkg.update.changelog ?? []) {
          console.log(`     ${commit.short} ${commit.summary}`);
        }
        console.log();
      }
    }
  }
}

async function main(args: string[]) {
  const command = new Command()
    .name("version")
    .description("Manage workspace package versions.")
    // .version(await displayVersion())
    .arguments("[directories...:file]")
    .option("--changelog", "Prints changelog for updated packages.", {
      default: false,
    })
    .option("--bump", "Updates packages versions, and creates a release PR.", {
      default: false,
    })
    .option("--release", "Creates draft releases for updated packages.", {
      default: false,
    })
    .env(
      "GITHUB_ACTOR=<actor:string>",
      "GitHub user that triggered the bump or release.",
      { prefix: "GITHUB_" },
    )
    .env(
      "GITHUB_EMAIL=<email:string>",
      "E-mail of GitHub user that triggered the bump or release.",
      { prefix: "GITHUB_" },
    )
    .env(
      "GITHUB_TOKEN=<token:string>",
      "GitHub personal token for GitHub actions.",
      { required: true, prefix: "GITHUB_" },
    )
    .action(
      async (
        { changelog, bump, release, actor, email, token },
        ...directories
      ) => {
        if (directories.length === 0) directories = ["."];
        const packages = await workspace({ directories });
        const repo = await github({ token }).repos.get();
        output(packages, changelog);
        const author = { ...actor && { name: actor }, ...email && { email } };
        if (bump) await bumpVersions(repo, packages, author);
        if (release) await createReleases(repo, packages);
      },
    );
  await command.parse(args);
}

if (import.meta.main) await main(Deno.args);
