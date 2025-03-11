/**
 * This module provides the {@linkcode release} function that handles the
 * creation of GitHub releases for packages, including tagging, release note
 * generation, and asset uploading.
 *
 * The release is created for the configuration version (`deno.json`) of the
 * package. The {@link [bump]} module updates the configuration version using
 * {@link https://www.conventionalcommits.org | Conventional Commits} since
 * the last release.
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
import { lessOrEqual, parse } from "@std/semver";

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
  /** Use emoji in commit summaries. */
  emoji?: boolean;
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
  if (!pkg.config.version) {
    throw new PackageError(
      `Cannot release without configuration version: ${pkg.name}`,
    );
  }
  const version = parse(pkg.config.version);
  const latest = parse(pkg.latest?.version ?? "0.0.0");
  if (lessOrEqual(version, latest)) {
    throw new PackageError(`Release version not newer: ${pkg.name}`, {
      cause: { version: pkg.config.version, latest: pkg.latest?.version },
    });
  }
  const name = `${pkg.name}@${pkg.config.version}`;
  let [release] = await repo.releases.list({ name, draft });
  const [head] = await git().commits.log();
  if (!head) throw new PackageError("Cannot determine current commit");
  const data = {
    name,
    tag: name,
    body: body(pkg, repo, options),
    draft,
    prerelease: !!version.prerelease?.length,
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

function body(
  pkg: Package,
  repo: Repository,
  options: ReleaseOptions | undefined,
): string {
  assertExists(pkg.config.version, "Cannot release a package without version");
  const title = pkg.latest?.tag ? "Changes" : "Initial release";
  const tag = `${pkg.name}@${pkg.config.version}`;
  const fullChangelogUrl = pkg?.latest?.tag
    ? `compare/${pkg.latest.tag.name}...${tag}`
    : `commits/${tag}/${pkg.directory}`;
  return changelog(pkg.changes ?? [], {
    ...options,
    title,
    footer: {
      title: "Details",
      items: [
        `- [Full changelog](${repo.url}/${fullChangelogUrl})`,
        `- [Documentation](https://jsr.io/${pkg.config.name}@${pkg.config.version})`,
      ],
    },
    markdown: {
      bullet: "",
    },
  });
}
