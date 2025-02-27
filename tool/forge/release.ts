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
  const repo = await github(options).repos.get();
  const version = parseVersion(pkg.config.version);
  const name = `${pkg.module}@${pkg.config.version}`;
  const draft = options?.draft ?? false;
  let [release] = await repo.releases.list({ name, draft });
  const [head] = await git().commits.log();
  if (!head) throw new PackageError("Cannot determine current commit");
  const data = {
    name,
    tag: name,
    body: await body(pkg),
    draft,
    preRelease: !!version.prerelease?.length,
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
  const repo = await github().repos.get();
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
