/**
 * This module provides the {@linkcode bump} function, which updates the
 * version string in package configuration file (`deno.json`). The version is
 * calculated based on the
 * {@link https://www.conventionalcommits.org | Conventional Commits} since
 * the last release and {@link https://semver.org | semantic versioning}.
 *
 * If the {@linkcode BumpOptions.release | release} option is set, the next
 * release version is written to the package configuration. Otherwise, the
 * current pre-release version is written.
 *
 * If the {@linkcode BumpOptions.pr | pr} option is set, a pull request is
 * created with the updated version information on GitHub.
 *
 * ```ts
 * import { bump } from "@roka/forge/bump";
 * import { workspace } from "@roka/forge/package";
 * async function usage() {
 *   const packages = await workspace();
 *   await bump(packages, { pr: true });
 * }
 * ```
 *
 * @module bump
 */

import { pool } from "@roka/async/pool";
import { changelog } from "@roka/forge/changelog";
import { type Package, PackageError } from "@roka/forge/package";
import { github, type PullRequest, type Repository } from "@roka/github";
import { common, join } from "@std/path";
import { difference, format, parse } from "@std/semver";

const BUMP_BRANCH = "automated/bump";

/** Options for the {@linkcode bump} function. */
export interface BumpOptions {
  /** GitHub access token. */
  token?: string;
  /**
   * GitHub repository to use.
   *
   * If not defined, the repository is determined from the package directories.
   */
  repo?: Repository;
  /** Git user for the bump commit. */
  user?: {
    /** Name of the user. */
    name?: string;
    /** Email of the user. */
    email?: string;
  };
  /** Bump to a release version, instead of a prerelease. */
  release?: boolean;
  /** Create a pull request. */
  pr?: boolean;
}

/**
 * Updates the version numbers on package configuration files (`deno.json`).
 *
 * The version for the package is calculated using the latest release tag and
 * the {@link https://www.conventionalcommits.org | Conventional Commits} for
 * the package since that release. If the changelog is not empty, the version
 * will be a pre-release version. If {@linkcode BumpOptions.release} is set,
 * the version of the next release will be written, dropping prerelase and
 * build information from the version string.
 *
 * When working with pull requests, if there is an open PR, it will be updated
 * with the new version information.
 *
 * @param pkg Package to bump.
 * @throws {PackageError} If the package does not have an update.
 *
 * @todo Recalculate versions when the bump PR is rebased.
 */
export async function bump(
  packages: Package[],
  options?: BumpOptions,
): Promise<PullRequest | undefined> {
  const bumps = packages
    .map((pkg) => ({
      pkg,
      bump: format({
        ...parse(pkg.version),
        ...options?.release ? { prerelease: [], build: [] } : {},
      }),
    }))
    .filter(({ pkg, bump }) => pkg.config.version !== bump);
  packages = await pool(bumps, ({ pkg, bump }) => update(pkg, bump));
  if (!options?.pr) return undefined;
  return createPullRequest(packages, options);
}

async function update(pkg: Package, version: string) {
  const config = { ...pkg.config, version };
  await Deno.writeTextFile(
    join(pkg.directory, "deno.json"),
    JSON.stringify(config, undefined, 2) + "\n",
  );
  pkg.version = version;
  pkg.config.version = version;
  return pkg;
}

async function createPullRequest(
  packages: Package[],
  options?: BumpOptions,
): Promise<PullRequest> {
  if (packages.length === 0) throw new PackageError("No packages to bump");
  const directory = common(packages.map((pkg) => pkg.directory));
  const { repo = await github(options).repos.get({ directory }), user } =
    options ?? {};
  const title = packages.length === 1
    ? `chore: bump ${packages[0]?.name} version`
    : "chore: bump versions";
  const body = prBody(packages);
  await repo.git.branches.checkout({ new: BUMP_BRANCH });
  await repo.git.config.set({ ...user && { user } });
  await repo.git.commits.create(title, { body, all: true });
  let [pr] = await repo.pulls.list({ title, closed: false });
  if (pr) {
    await repo.git.commits.push({ force: true, branch: BUMP_BRANCH });
    pr.update({ body });
  } else {
    await repo.git.commits.push({ branch: BUMP_BRANCH });
    pr = await repo.pulls.create({ title, body, draft: true });
  }
  return pr;
}

function prBody(packages: Package[]): string {
  return packages.map((pkg) => [
    `## ${pkg.name}@${pkg.version} [${
      difference(
        parse(pkg.latest?.version ?? "0.0.0"),
        parse(pkg.version),
      )
    }]`,
    changelog(pkg),
  ]).flat().join("\n\n");
}
