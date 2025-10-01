/**
 * This module provides functions and types to work with packages.
 *
 * The {@linkcode packageInfo} function returns information for a single
 * package.
 *
 * ```ts
 * import { packageInfo } from "@roka/forge/package";
 * const pkg = await packageInfo({
 *   directory: import.meta.dirname ?? ".",
 * });
 * ```
 *
 * The returned {@linkcode Package} object holds the following information:
 *
 *  - Package name and directory.
 *  - Whether the package is a
 *    [Deno workspace](https://docs.deno.com/runtime/fundamentals/workspaces/)
 *    member.
 *  - Package configuration (`deno.json`).
 *  - The latest package release from git tags.
 *  - {@link https://www.conventionalcommits.org | Conventional Commits} since
 *    the latest release.
 *  - Calculated {@link https://semver.org | semantic version}.
 *
 * Use the {@linkcode workspace} function to fetch all the workspace packages
 * in a monorepo.
 *
 * ```ts
 * const packages = await workspace();
 * ```
 *
 * Commits are only attributed to a workspace member if they explicitly list
 * the package name. For example, a commit with a summary of "_feat: new_" will
 * not be in included in a workspace package changelog, but "_feat(pkg): new_"
 * will be. However, both will be attributed to a simple (non-workspace)
 * package.
 *
 * @module package
 */

import { pool } from "@roka/async/pool";
import { git, GitError, type RevisionRange, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { maybe } from "@roka/maybe";
import { assertExists } from "@std/assert";
import { distinct } from "@std/collections";
import { expandGlob } from "@std/fs/expand-glob";
import {
  basename,
  dirname,
  fromFileUrl,
  globToRegExp,
  join,
  normalize,
  relative,
} from "@std/path";
import {
  canParse,
  format,
  greaterThan,
  increment,
  parse,
  type SemVer,
} from "@std/semver";

/** An error thrown by the `forge` package. */
export class PackageError extends Error {
  /** Construct PackageError. */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PackageError";
  }
}

/**
 * A package in the repository returned by the {@linkcode packageInfo} or
 * {@linkcode workspace} functions.
 */
export interface Package {
  /**
   * Package name.
   *
   * If the package has a name in the configuration, this will be based on that
   * but without the package scope. Otherwise, it will be the name of the
   * package directory.
   */
  name: string;
  /**
   * Current package version.
   *
   * The semantic version of the package calculated from the latest release.
   * The release tag version is incremented based on the
   * {@link https://www.conventionalcommits.org | Conventional Commits} for
   * this package since the latest release. If there was no release for this
   * package, the version will start from `0.0.0`.
   *
   * If the calculated version is lower than the version defined in the
   * configuration, the package version will be the one defined in the
   * configuration. This allows for manual versioning of the package.
   */
  version: string;
  /** Package directory. */
  directory: string;
  /**
   * Root directory of the package.
   *
   * This will be the workspace directory, if the package is a workspace
   * member, otherwise it will be the package directory.
   *
   * When the package is retrieved with the {@linkcode packageInfo} function,
   * this will be the package directory, unless it is set with the
   * {@linkcode PackageOptions.root | root} option.
   *
   * The {@linkcode workspace} function will set this to the workspace root.
   */
  root: string;
  /** Package config from `deno.json`. */
  config: Config;
  /**
   * Latest release of this package.
   *
   * This will be calculated only if the git history is available.
   */
  latest?: Release;
  /**
   * Commits since the latest release.
   *
   * This will be calculated only if the git history is available.
   */
  changes?: ConventionalCommit[];
}

/**
 * Release information for a package returned by the {@linkcode packageInfo} or
 * {@linkcode workspace} functions.
 */
export interface Release {
  /** Release version. */
  version: string;
  /** Commit range. */
  range: RevisionRange;
}

/**
 * Configuration for a package from `deno.json` returned by the
 * {@linkcode packageInfo} or {@linkcode workspace} functions.
 */
export interface Config {
  /** Package name. */
  name?: string;
  /** Workspace packages. */
  workspace?: string[];
  /** Package version. */
  version?: string;
  /** Package imports. */
  imports?: Record<string, string>;
  /** Package exports. */
  exports?: string | Record<string, string>;
  /** Custom configuration for **forge**. */
  forge?: ForgeConfig;
}

/**
 * Configuration specific to **forge** and defined in `deno.json`.
 *
 * This is used to customize the behavior of compilation and release of the
 * package.
 */
export interface ForgeConfig {
  /** Entry module for the package for compiled binaries. */
  main?: string;
  /** Include patterns for additional files to bundle in compilation. */
  include?: string[];
  /** List of target OS architectures to compile for during release. */
  target?: string[];
}

/** Options for the {@linkcode packageInfo} function. */
export interface PackageOptions {
  /**
   * Directory to return package from.
   *
   * If a directory is not defined, the package of the main module is used.
   */
  directory?: string;
  /**
   * Root directory of the package.
   *
   * If this is different than the package directory, the package is considered
   * a workspace member.
   *
   * If not set, the root defaults to the value of
   * {@linkcode Package.directory | directory}.
   */
  root?: string;
}

/** Options for the {@linkcode workspace} function. */
export interface WorkspaceOptions {
  /**
   * Directory to return packages from.
   * @default {["."]}
   */
  root?: string;
  /**
   * Filter packages by name or directory.
   *
   * Each filter is a glob pattern that matches the name or the directory of
   * the package relative to root. For example, either `"forge"` or the
   * `"tool/forge"` filters would match a package named `@roka/forge` in the
   * `tool/forge` directory.
   *
   * Any match will include the package in the result. If no filters are
   * provided, all packages in the workspace will be returned.
   *
   * @default {[]}
   */
  filters?: string[];
}

/** Options for the {@linkcode releases} function. */
export interface ReleaseOptions {
  /**
   * Include pre-release versions.
   * @default {false}
   */
  prerelease?: boolean;
}

/** Options for the {@linkcode commits} function. */
export interface CommitOptions {
  /**
   * Range of commits to include in the changelog.
   *
   * If not defined, all commits for the package are returned.
   */
  range?: RevisionRange;
  /**
   * Commit types to include in the changelog.
   *
   * All types are returned by default.
   *
   * Breaking changes whose types are not included are returned by default.
   * Setting {@linkcode CommitOptions.breaking | breaking} to `false` will skip
   * these commits.
   */
  type?: string[];
  /**
   * If `true`, returns only breaking changes. If `false`, breaking changes are
   * subject to the {@linkcode CommitOptions.type | type} filter.
   */
  breaking?: boolean;
}

/**
 * Returns information about a package.
 *
 * @throws {PackageError} If the package configuration was malformed or release
 *                        versions could not be parsed from git tags.
 */
export async function packageInfo(options?: PackageOptions): Promise<Package> {
  let directory = options?.directory;
  if (!directory) {
    ({ value: directory } = maybe(() => dirname(fromFileUrl(Deno.mainModule))));
    if (!directory) {
      throw new PackageError("Cannot determine package directory");
    }
  }
  directory = normalize(directory);
  const config = await readConfig(directory);
  const name = basename(config.name ?? directory);
  const pkg: Package = {
    name,
    version: config.version ?? "0.0.0",
    directory,
    root: options?.root ?? directory,
    config,
  };
  if (!canParse(pkg.version)) {
    throw new PackageError(`Cannot parse version: ${pkg.version}`, {
      cause: pkg,
    });
  }
  try {
    const [latest] = await releases(pkg);
    const changes = await commits(pkg, {
      type: ["feat", "fix"],
      ...latest?.range.to && { range: { from: latest.range.to } },
    });
    if (latest !== undefined) pkg.latest = latest;
    if (changes !== undefined) {
      pkg.changes = changes;
      pkg.version = calculateVersion(pkg, latest, changes);
    }
  } catch (e: unknown) {
    // git will fail on non-repository or uninitialized repository
    if (!(e instanceof GitError)) throw e;
  }
  return pkg;
}

/**
 * Returns all packages for a workspace.
 *
 * If a directory is a monorepo, distinguished with the `workspace` field in
 * its configuration, this function will return all packages in that monorepo,
 * excluding its root. If the directory is not a monorepo, the function will
 * return the package in the directory.
 */
export async function workspace(
  options?: WorkspaceOptions,
): Promise<Package[]> {
  const { root = ".", filters = [] } = options ?? {};
  const patterns = filters.map((f) => globToRegExp(f));
  const rootPackage = await packageInfo({ directory: root, ...options });
  const packages = rootPackage.config.workspace === undefined
    ? [rootPackage]
    : await pool(
      distinct(
        (await pool(
          rootPackage.config.workspace,
          (path) => Array.fromAsync(expandGlob(join(root, path, "deno.json"))),
        )).flat().map((file) => dirname(file.path)),
      ),
      (path) =>
        packageInfo({
          directory: path,
          root,
        }),
    );
  return packages
    .filter((pkg) =>
      patterns.length === 0 ||
      patterns.some((p) =>
        pkg.name.match(p) || relative(root, pkg.directory).match(p)
      )
    );
}

/**
 * Returns releases of a package based on its git tags.
 *
 * Pre-release versions are not included by default. Use the
 * {@linkcode ReleaseOptions.prerelease | prerelease} option to include them.
 *
 * @example Retrieve all releases of a package.
 * ```ts
 * import { packageInfo, releases } from "@roka/forge/package";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   return await releases(pkg, { prerelease: true });
 * }
 * ```
 *
 * @param pkg Package to search releases for.
 * @param options Options for fetching releases.
 * @returns All releases for this package from git tags.
 * @throws {GitError} If git history is not available.
 */
export async function releases(
  pkg: Package,
  options?: ReleaseOptions,
): Promise<Release[]> {
  const versions = (await git({
    cwd: pkg.directory,
    config: { versionsort: { suffix: ["-pre"] } },
  }).tags
    .list({ name: `${pkg.name}@*`, sort: "version" }))
    .filter(parseTag)
    .map((tag) => {
      const version = parseTag(tag);
      assertExists(version, `Cannot parse version from tag`);
      const semver = parse(version);
      return { version: parseTag(tag), semver, tag };
    })
    .filter((v) => options?.prerelease || !v.semver.prerelease?.length);
  return versions.map(({ version, tag }, index) => {
    assertExists(version, `Cannot parse version from tag`);
    const previous = versions.slice(index + 1).find((v) =>
      !v.semver.prerelease?.length
    );
    return {
      version,
      range: {
        ...previous && { from: previous.tag.name },
        to: tag.name,
      },
    };
  });
}

/**
 * Returns the commits for a particular release.
 *
 * By default, commits from the entire git history are returned. The
 * {@linkcode CommitOptions.range | range} option can be used to return
 * the commits of a specific range.
 *
 * @example Get commits since the last release.
 * ```ts
 * import { commits, packageInfo } from "@roka/forge/package";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   return await commits(pkg, { type: ["feat", "fix"] });
 * }
 * ```
 *
 * @example Get commits for a specific release.
 * ```ts
 * import { commits, packageInfo } from "@roka/forge/package";
 * import { assertExists } from "@std/assert";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   return await commits(pkg, {
 *     ...pkg.latest ? { range: pkg.latest.range } : {},
 *   });
 * }
 * ```
 *
 * @param pkg Package to generate changelog for.
 * @param options Options for generating the changelog.
 * @returns Matched commits.
 * @throws {GitError} If git history is not available.
 */
export async function commits(
  pkg: Package,
  options?: CommitOptions,
): Promise<ConventionalCommit[]> {
  const log = await git({ cwd: pkg.root }).commits.log(
    options?.range ? { range: options?.range } : {},
  );
  return log
    .map((c) => conventional(c))
    // match scope only on workspaces
    .filter((c) => pkg.root === pkg.directory || matchesScope(pkg, c))
    .filter((c) => options?.breaking !== true || c.breaking)
    .filter((c) =>
      options?.type !== undefined
        ? c.type && options.type.includes(c.type) ||
          (options?.breaking === undefined && c.breaking)
        : true
    );
}

function parseTag(tag: Tag): string | undefined {
  const version = tag.name?.split("@")[1];
  if (!version || !canParse(version)) return undefined;
  return version;
}

async function readConfig(directory: string): Promise<Config> {
  const configFile = join(directory, "deno.json");
  try {
    const data = await Deno.readTextFile(configFile);
    return (JSON.parse(data)) as Config;
  } catch (e: unknown) {
    throw new PackageError(`Cannot read package config: ${configFile}`, {
      cause: e,
    });
  }
}

function calculateVersion(
  pkg: Package,
  latest: Release | undefined,
  log: ConventionalCommit[],
) {
  const current = parse(latest?.version ?? "0.0.0");
  const next = log?.length && log[0]
    ? {
      ...increment(current, updateType(current, pkg, log)),
      prerelease: ["pre", log.length],
      build: [log[0].short],
    }
    : current;
  const coded = parse(pkg.version);
  return format(greaterThan(next, coded) ? next : coded);
}

function updateType(
  current: SemVer,
  pkg: Package,
  changelog: ConventionalCommit[],
) {
  const breaking = changelog.some((c) => c.breaking);
  if (current.major > 0 && breaking) return "major";
  const feature = changelog
    .some((c) => c.type === "feat" && !isUnstable(pkg, c));
  if (breaking || feature) return "minor";
  return "patch";
}

function matchesScope(pkg: Package, commit: ConventionalCommit) {
  return commit.scopes.some((s) =>
    s === pkg.name || s.startsWith(`${pkg.name}/`)
  );
}

function isUnstable(pkg: Package, commit: ConventionalCommit) {
  const single = pkg.root === pkg.directory;
  const scopes = commit.scopes
    .filter((s) => single || s === pkg.name || s.startsWith(`${pkg.name}/`));
  return scopes.length > 0 && scopes
    .every((s) => (single && s === "unstable") || s.endsWith("/unstable"));
}
