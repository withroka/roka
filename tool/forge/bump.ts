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
 * created with the updated version information on GitHub. Once this pull
 * request is merged, a release can be created using the {@linkcode [release]}
 * module.
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
import { assertExists } from "@std/assert";
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
  /** Bump to the next release version, instead of a pre-release of it. */
  release?: boolean;
  /**
   * Update given file with the generated changelog.
   *
   * If a relative path is provided, the path will be resolved from the current
   * working directory.
   */
  changelog?: string;
  /** Create a pull request. */
  pr?: boolean;
  /** Use emoji in commit summaries. */
  emoji?: boolean;
}

/**
 * Updates the version numbers on package configuration files (`deno.json`).
 *
 * The version for the package is calculated using the latest release tag and
 * the {@link https://www.conventionalcommits.org | Conventional Commits} for
 * the package since that release. If the changelog is not empty, the version
 * will be a pre-release version. If {@linkcode BumpOptions.release | release}
 * is set, the version of the next release will be written, dropping prerelase
 * and build information from the version string.
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
  packages = await pool(bumps, ({ pkg, bump }) => updateConfig(pkg, bump));
  if (packages.length === 0) throw new PackageError("No packages to bump");
  if (options?.changelog) await updateChangelog(packages, options);
  if (!options?.pr) return undefined;
  return createPullRequest(packages, options);
}

async function updateConfig(pkg: Package, version: string) {
  const config = { ...pkg.config, version };
  await Deno.writeTextFile(
    join(pkg.directory, "deno.json"),
    JSON.stringify(config, undefined, 2) + "\n",
  );
  pkg.version = version;
  pkg.config.version = version;
  return pkg;
}

async function updateChangelog(packages: Package[], options?: BumpOptions) {
  assertExists(options?.changelog, "Changelog file was not passed");
  const prepend = packages.map((pkg) =>
    changelog(pkg.changes ?? [], {
      ...options,
      title: `${pkg.name}@${pkg.version}`,
    })
  ).join("\n");
  let existing = "";
  try {
    existing = await Deno.readTextFile(options?.changelog);
  } catch (e: unknown) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.writeTextFile(
    options?.changelog,
    [prepend, ...existing && [existing]].join("\n"),
  );
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
  const body = packages.map((pkg) =>
    changelog(pkg.changes ?? [], {
      ...options,
      title: `${pkg.name}@${pkg.version}`,
    })
  ).join("\n");
  await repo.git.branches.checkout({ new: BUMP_BRANCH });
  await repo.git.config.set({ ...user && { user } });
  await repo.git.index.add([
    ...packages.map((pkg) => join(pkg.directory, "deno.json")),
    ...options?.changelog ? [options?.changelog] : [],
  ]);
  await repo.git.commits.create(title, { body });
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
