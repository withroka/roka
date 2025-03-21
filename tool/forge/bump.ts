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
 * @todo Check if configuration files are dirty before modifying them.
 *
 * @module bump
 */

import { pool } from "@roka/async/pool";
import { github, type PullRequest, type Repository } from "@roka/github";
import { assertExists } from "@std/assert";
import { pick } from "@std/collections";
import { common, dirname, join } from "@std/path";
import { format, parse } from "@std/semver";
import { changelog } from "./changelog.ts";
import { type Package, PackageError } from "./package.ts";

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
  /** Name of the git user. */
  name?: string;
  /** Email of the git user. */
  email?: string;
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
  /**
   * Make the newly created pull request a draft.
   *
   * Requires {@linkcode BumpOptions.pr | pr} to be set.
   *
   * If a pull request already exists, this flag won't affect it.
   * @default {false}
   */
  draft?: boolean;
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

async function updateChangelog(
  packages: Package[],
  options: BumpOptions | undefined,
) {
  assertExists(options?.changelog, "Changelog file was not passed");
  const prepend = packages.map((pkg) =>
    changelog(pkg.changes ?? [], {
      content: { title: `${pkg.name}@${pkg.version}` },
      commit: {
        sort: "importance",
        ...options?.emoji && { emoji: options?.emoji },
      },
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
  // best effort to format the changelog file
  try {
    const command = new Deno.Command("deno", {
      cwd: dirname(options?.changelog),
      args: ["fmt", options?.changelog],
    });
    await command.output();
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotFound) return;
    throw e;
  }
}

async function createPullRequest(
  packages: Package[],
  options: BumpOptions | undefined,
): Promise<PullRequest> {
  if (packages.length === 0) throw new PackageError("No packages to bump");
  const directory = common(packages.map((pkg) => pkg.root));
  const { repo = await github(options).repos.get({ directory }) } = options ??
    {};
  const base = await repo.git.branches.current();
  const head = packages.length === 1
    ? `${BUMP_BRANCH}-${packages[0]?.name}`
    : BUMP_BRANCH;
  if (!base) throw new PackageError("Cannot determine base branch");
  const title = packages.length === 1
    ? `chore: bump ${packages[0]?.name} to ${packages[0]?.version}`
    : "chore: bump versions";
  const commitOptions = {
    sort: "importance",
    emoji: options?.emoji ?? false,
    hash: true,
  } as const;
  const commitBody = packages.map((pkg) =>
    changelog(pkg.changes ?? [], {
      content: { title: `${pkg.name}@${pkg.version}` },
      commit: commitOptions,
    })
  ).join("\n");
  const prBody = packages.map((pkg) =>
    changelog(pkg.changes ?? [], {
      content: { title: `${pkg.name}@${pkg.version}` },
      commit: { ...commitOptions, github: true },
    })
  ).join("\n");
  try {
    await repo.git.branches.checkout({ new: head });
    await repo.git.config.set({ user: pick(options ?? {}, ["name", "email"]) });
    await repo.git.index.add([
      ...packages.map((pkg) => join(pkg.directory, "deno.json")),
      ...options?.changelog ? [options?.changelog] : [],
    ]);
    await repo.git.commits.create(title, { body: commitBody });
    let [pr] = await repo.pulls.list({ base, head, closed: false });
    if (pr) {
      await repo.git.commits.push({ force: true, branch: head });
      pr.update({ title, body: prBody });
    } else {
      await repo.git.commits.push({ branch: head });
      pr = await repo.pulls.create({
        base,
        head,
        title,
        body: prBody,
        draft: options?.draft ?? false,
      });
    }
    return pr;
  } finally {
    await repo.git.branches.checkout({ target: base });
    await repo.git.branches.delete(head, { force: true });
  }
}
