import { pool } from "@roka/async/pool";
import { compile, targets } from "@roka/forge//compile";
import { changelog } from "@roka/forge/changelog";
import { git } from "@roka/git";
import { github, type Release, type ReleaseAsset } from "@roka/github";
import { type Package, PackageError } from "@roka/package";
import { assert } from "@std/assert";
import { parse as parseVersion } from "@std/semver";

/** Max concurrent calls to GitHub. */
const GITHUB_CONCURRENCY = { concurrency: 10 };

/** Options for releasing a package. */
export interface ReleaseOptions {
  /** GitHub access token. */
  token?: string;
  /** Create a draft release. */
  draft?: boolean;
}

/** Create a GitHub release from package. */
export async function release(
  pkg: Package,
  options?: ReleaseOptions,
): Promise<[Release, ReleaseAsset[]]> {
  assert(pkg.config.version, "Cannot release a package without version");
  const repo = await github(options).repo();
  const version = parseVersion(pkg.config.version);
  const name = `${pkg.module}@${pkg.config.version}`;
  const isDraft = options?.draft ?? false;
  let [release] = await repo.releases.list({ name, isDraft });
  const [head] = await git().log();
  if (!head) throw new PackageError("Cannot determine current commit");
  const data = {
    name,
    tag: name,
    body: await body(pkg),
    isDraft,
    isPreRelease: !!version.prerelease?.length,
    commit: head.hash,
  };
  if (release) {
    release = await release.update(data);
  } else {
    release = await repo.releases.create(name, { ...data });
  }
  return [release, await upload(pkg, release)];
}

/**
 * Upload package compilation outputs to a release.
 *
 * Existing assets are deleted before uploading new ones.
 */
export async function upload(
  pkg: Package,
  release: Release,
): Promise<ReleaseAsset[]> {
  // delete existing assets first
  const assets = await release.assets.list();
  await pool(assets.map((asset) => asset.delete()), GITHUB_CONCURRENCY);
  const artifacts = pkg.config.compile
    ? await compile(pkg, {
      target: await targets(),
      release: true,
      bundle: true,
      checksum: true,
    })
    : [];
  return await pool(
    artifacts.map((artifact) => release.assets.upload(artifact)),
    GITHUB_CONCURRENCY,
  );
}

async function body(pkg: Package): Promise<string> {
  assert(pkg.version, "Cannot release a package without version");
  const title = pkg.release?.tag ? "Changelog" : "Initial release";
  const repo = await github().repo();
  const tag = `${pkg.module}@${pkg.version}`;
  const fullChangelogUrl = pkg?.release?.tag
    ? `compare/${pkg.release.tag.name}...${tag}`
    : `commits/${tag}/${pkg.directory}`;
  return [
    `## ${title}`,
    "",
    changelog(pkg),
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
    packages.map(async (pkg) => await getPackage({ directory: pkg.directory })),
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
  const [pr] = await repo.pulls.list({ title, isClosed: false });
  {
    // create or update version bump PR
    if (pr) {
      await repo.git.commits.push({ force: true, branch: BRANCH }); // can this be done without force?
      pr.update({ body });
      console.log(`🤖 Updated release PR ${pr.number} (${pr.url})`);
    } else {
      await repo.git.commits.push({ branch: BRANCH });
      const pr = await repo.pulls.create({ title, body, isDraft: true });
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
  for (const pkg of packages) {
    assert(pkg.config.version, "Cannot release a package without version");
    const version = parseVersion(pkg.config.version);
    const name = `${pkg.module}@${pkg.config.version}`;
    let [release] = await repo.releases.list({ name, isDraft: true });
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
        if (!release.isDraft) {
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
        const packages = await getWorkspace({ directories });
        const repo = await github({ token }).repo();
        output(packages, changelog);
        const author = { ...actor && { name: actor }, ...email && { email } };
        if (bump) await bumpVersions(repo, packages, author);
        if (release) await createReleases(repo, packages);
      },
    );
  await command.parse(args);
}

if (import.meta.main) await main(Deno.args);
