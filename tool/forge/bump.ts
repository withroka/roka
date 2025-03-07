/**
 * This module provides the {@linkcode bump} function, which updates the
 * version string in package configuration file (`deno.json`). The version is
 * calculated based on the
 * {@link https://www.conventionalcommits.org | Conventional Commits} since
 * the last release and {@link https://semver.org | semantic versioning}.
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

import { changelog } from "@roka/forge/changelog";
import { type Package, PackageError, packageInfo } from "@roka/forge/package";
import { github, type PullRequest, type Repository } from "@roka/github";
import { assertEquals } from "@std/assert";
import { common, join } from "@std/path";
import { format, parse } from "@std/semver";

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
  /** Create a pull request. */
  pr?: boolean;
}

/**
 * Updates the version numbers on package configuration files (`deno.json`).
 *
 * The calculated version is based on {@linkcode Package.update}, dropping
 * pre-release and build information.
 *
 * When working with pull requests, if there is an open one for a bump, it will
 * be updated with the new version information.
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
  packages = await Promise.all(packages.map((pkg) => updateVersion(pkg)));
  if (!options?.pr || packages.length === 0) return undefined;
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

async function updateVersion(pkg: Package): Promise<Package> {
  if (pkg.update === undefined) {
    throw new PackageError("Cannot bump a package without update");
  }
  const version = format({
    ...parse(pkg.update.version),
    prerelease: [],
    build: [],
  });
  pkg.config.version = version;
  await Deno.mkdir(pkg.directory, { recursive: true });
  await Deno.writeTextFile(
    join(pkg.directory, "deno.json"),
    JSON.stringify(pkg.config, undefined, 2) + "\n",
  );
  pkg = await packageInfo({ directory: pkg.directory });
  assertEquals(pkg.version, version, "Failed to update package version");
  return pkg;
}

function prBody(packages: Package[]): string {
  return packages.map((pkg) => [
    `## ${pkg.name}@${pkg.version} [${pkg.update?.type}]`,
    changelog(pkg),
  ]).flat().join("\n\n");
}
