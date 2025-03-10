/**
 * This module provides the {@linkcode release} function that handles the
 * creation of GitHub releases for packages, including tagging, release note
 * generation, and asset uploading.
 *
 * ```ts
 * import { release } from "@roka/forge/release";
 * import { packageInfo } from "@roka/forge/package";
 * async function usage() {
 *   const pkg = await packageInfo();
 *   await release(pkg, { draft: true });
 * }
 * ```
 *
 * @module release
 */

import { pool } from "@roka/async/pool";
import { changelog } from "@roka/forge/changelog";
import { compile, targets } from "@roka/forge/compile";
import { type Package, PackageError } from "@roka/forge/package";
import { git } from "@roka/git";
import {
  github,
  type Release,
  type ReleaseAsset,
  type Repository,
} from "@roka/github";
import { assertExists } from "@std/assert";
import { parse as parseVersion } from "@std/semver";

/** Max concurrent calls to GitHub. */
const GITHUB_CONCURRENCY = { concurrency: 10 };

/** Options for the {@linkcode release} function. */
export interface ReleaseOptions {
  /** GitHub access token. */
  token?: string;
  /**
   * GitHub repository to use.
   *
   * If not defined, the repository is determined from the package directories.
   */
  repo?: Repository;
  /** Create a draft release. */
  draft?: boolean;
}

/**
 * Create a GitHub release from a package.
 *
 * If a release already exists for the same package and version, it will be
 * updated.
 *
 * @param pkg Package to release.
 * @returns The created release and its assets.
 * @throws {PackageError} If the package does not have a version.
 *
 * @todo Calculate changelog from the exact commit that introduced the version.
 */
export async function release(
  pkg: Package,
  options?: ReleaseOptions,
): Promise<[Release, ReleaseAsset[]]> {
  const { repo = await github(options).repos.get(), draft = false } = options ??
    {};
  const version = parseVersion(pkg.version);
  const name = `${pkg.name}@${pkg.version}`;
  let [release] = await repo.releases.list({ name, draft });
  const [head] = await git().commits.log();
  if (!head) throw new PackageError("Cannot determine current commit");
  const data = {
    name,
    tag: name,
    body: body(pkg, repo),
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

async function upload(pkg: Package, release: Release): Promise<ReleaseAsset[]> {
  // delete existing assets first
  const assets = await release.assets.list();
  await pool(assets, (asset) => asset.delete(), GITHUB_CONCURRENCY);
  const artifacts = pkg.config.compile
    ? await compile(pkg, {
      target: await targets(),
      bundle: true,
      checksum: true,
    })
    : [];
  return await pool(
    artifacts,
    (artifact) => release.assets.upload(artifact),
    GITHUB_CONCURRENCY,
  );
}

function body(pkg: Package, repo: Repository): string {
  assertExists(pkg.version, "Cannot release a package without version");
  const title = pkg.latest?.tag ? "Changelog" : "Initial release";
  const tag = `${pkg.name}@${pkg.version}`;
  const fullChangelogUrl = pkg?.latest?.tag
    ? `compare/${pkg.latest.tag.name}...${tag}`
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
