/**
 * This module provides functions to work with workspaces and packages.
 *
 * The {@linkcode workspace} function is used to fetch all the workspace
 * packages in a monorepo.
 *
 * ```ts
 * import { workspace } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const packages = await workspace();
 *   return { packages };
 * });
 * ```
 *
 * The {@linkcode packageInfo} function returns information for a single
 * package.
 *
 * ```ts
 * import { packageInfo } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const pkg = await packageInfo({
 *     directory: import.meta.dirname ?? ".",
 *   });
 *   return { pkg };
 * });
 * ```
 *
 * The returned {@linkcode Package} object holds the following information.
 *
 *  - Package name and directory
 *  - Whether the package is a
 *    [Deno workspace](https://docs.deno.com/runtime/fundamentals/workspaces/)
 *    member
 *  - Package configuration (`deno.json`)
 *  - The latest package release from Git tags
 *  - {@link https://www.conventionalcommits.org Conventional Commits} since
 *    the latest release
 *  - Calculated {@link https://semver.org semantic version}
 *
 * Commits are only attributed to a workspace member if they explicitly list
 * the package name. For example, a commit with a subject of "_feat: new_" will
 * not be in included in a workspace package changelog, but "_feat(pkg): new_"
 * will be. However, both will be attributed to a simple (non-workspace)
 * package.
 *
 * @module workspace
 * @internal
 */

import { pool } from "@roka/async/pool";
import { type Commit, git, GitError, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { maybe } from "@roka/maybe";
import { assertExists } from "@std/assert";
import { distinct } from "@std/collections";
import { mapKeys } from "@std/collections/map-keys";
import { expandGlob } from "@std/fs";
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
  /** Constructs PackageError. */
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
   * {@link https://www.conventionalcommits.org Conventional Commits} for
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
   * {@linkcode PackageOptions.root root} option.
   *
   * The {@linkcode workspace} function will set this to the workspace root.
   */
  root: string;
  /** Package config from `deno.json`. */
  config: Config;
  /** Latest release of this package. */
  latest?: Release;
  /**
   * Commits since the latest release.
   *
   * This will be calculated only if the Git history is available.
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
  /** Release tag. */
  tag?: string;
  /** Commit range. */
  range: { from?: string; to: string };
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

/** Options for the {@linkcode workspace} function. */
export interface WorkspaceOptions {
  /**
   * Directory to return packages from.
   *
   * This can be a string path or a file URL.
   *
   * @default {["."]}
   */
  root?: string | URL;
  /**
   * Filters packages by name or directory.
   *
   * Each filter is a glob pattern that matches the name or the directory of
   * the package relative to root. For example, either `"forge"` or
   * `"tool/forge"` filters would match a package named `@roka/forge` in the
   * `tool/forge` directory.
   *
   * Any match will include the package in the result. If no filters are
   * provided, all packages in the workspace will be returned.
   *
   * @default {[]}
   */
  filter?: string[];
  /**
   * Max concurrent package processing.
   * @default {4}
   */
  concurrency?: number;
}

/** Options for the {@linkcode packageInfo} function. */
export interface PackageOptions {
  /**
   * Directory to return package from.
   *
   * This can be a string path or a file URL.
   *
   * If a directory is not defined, the package of the main module is used.
   */
  directory?: string | URL;
  /**
   * Root directory of the package.
   *
   * This can be a string path or a file URL.
   *
   * If this is different than the package directory, the package is considered
   * a workspace member.
   *
   * If not set, the root defaults to the value of the
   * {@linkcode Package.directory directory} of the package.
   */
  root?: string | URL;
}

/** Options for the {@linkcode releases} function. */
export interface ReleaseOptions {
  /**
   * Maximum number of releases to return.
   *
   * This option can be used to return only the most recent releases.
   *
   * If not defined, all releases are returned.
   */
  limit?: number;
  /**
   * Includes pre-release versions.
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
  range?: { from?: string; to?: string };
  /**
   * Commit types to include in the changelog.
   *
   * All types are returned by default.
   *
   * Breaking changes whose types are not included are returned by default.
   * Setting the {@linkcode CommitOptions.breaking breaking} option to `false`
   * will skip these commits.
   */
  types?: string[];
  /**
   * If `true`, returns only breaking changes. If `false`, breaking changes are
   * subject to the {@linkcode CommitOptions.types types} filter.
   */
  breaking?: boolean;
}

/** Options for the {@linkcode scopes} function. */
export interface ScopeOptions {
  /**
   * If `true`, additionally matches module names in the scopes of a commit.
   *
   * For example, if a commit has a scope of `pkg/module`, it will match a
   * package named `pkg` only if the package has an exported module named
   * `module`.
   *
   * @default {false}
   */
  strict?: boolean;
}

/**
 * Returns all packages for a workspace.
 *
 * If a directory is a monorepo, distinguished with the `workspace` field in
 * its configuration, this function will return all packages in that monorepo,
 * excluding its root. If the directory is not a monorepo, the function will
 * return the package in the directory.
 *
 * @example List all packages in a workspace
 * ```ts
 * import { workspace } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const packages = await workspace();
 *   return packages.map((pkg) => pkg.name);
 * });
 * ```
 *
 * @example Filter packages by name
 * ```ts
 * import { workspace } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const packages = await workspace({ filter: ["my-package"] });
 *   return { packages };
 * });
 * ```
 */
export async function workspace(
  options?: WorkspaceOptions,
): Promise<Package[]> {
  const { root = ".", filter: filters = [], concurrency = 4 } = options ?? {};
  const patterns = filters.map((f) => globToRegExp(f));
  const rootPackage = await packageInfo({ directory: root, ...options });
  const packages = rootPackage.config.workspace === undefined
    ? [rootPackage]
    : await pool(
      distinct(
        (await pool(
          rootPackage.config.workspace,
          (path) => Array.fromAsync(expandGlob(join(root, path, "deno.json"))),
          { concurrency },
        )).flat().map((file) => dirname(file.path)),
      ),
      (path) =>
        packageInfo({
          directory: path,
          root,
        }),
      { concurrency },
    );
  return packages
    .filter((pkg) =>
      patterns.length === 0 ||
      patterns.some((p) =>
        pkg.name.match(p) ||
        relative(normalize(root), normalize(pkg.directory)).match(p)
      )
    );
}

/**
 * Returns information about a package.
 *
 * @example Get information about the current package
 * ```ts
 * import { packageInfo } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const pkg = await packageInfo();
 *   return { name: pkg.name, version: pkg.version };
 * });
 * ```
 *
 * @throws {PackageError} If the package configuration was malformed or release
 *                        versions could not be parsed from Git tags
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
  const [config, permission] = await Promise.all([
    readConfig(directory),
    Deno.permissions.query({ name: "run", command: "git" }),
  ]);
  const name = basename(config.name ?? directory);
  const pkg: Package = {
    name,
    version: config.version ?? "0.0.0",
    directory,
    root: normalize(options?.root ?? directory),
    config,
  };
  if (!canParse(pkg.version)) {
    throw new PackageError(`Cannot parse version: ${pkg.version}`, {
      cause: pkg,
    });
  }
  if (permission.state !== "granted") return pkg;
  try {
    const [all, headMaybe] = await Promise.all([
      releases(pkg, { limit: 1 }),
      maybe(() => git({ directory: pkg.root }).commit.head()),
    ]);
    const [latest] = all;
    const { value: head } = headMaybe;
    const changes = await commits(pkg, {
      types: ["feat", "fix"],
      ...head && latest?.range.to &&
        { range: { from: latest.range.to, to: head.hash } },
    });
    if (latest) pkg.latest = latest;
    if (changes !== undefined) {
      pkg.changes = changes;
      pkg.version = calculateVersion(pkg, latest, changes, head);
    }
  } catch (e: unknown) {
    // git will fail on non-repository
    if (!(e instanceof GitError)) throw e;
  }
  return pkg;
}

/**
 * Returns the modules of a package based on its exports.
 *
 * @example Get modules of a package
 * ```ts
 * import { modules, packageInfo } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const pkg = await packageInfo();
 *   return modules(pkg);
 * });
 * ```
 */
export function modules(pkg: Package): Record<string, string> {
  const exports = typeof pkg.config.exports === "string"
    ? { "": pkg.config.exports }
    : pkg.config.exports;
  if (exports === undefined) return {};
  return mapKeys(exports, (key) => key.replace(/^\.($|\/)/, ""));
}

/**
 * Returns releases of a package.
 *
 * Releases are found first by using Git tags in the "name@version" format,
 * then by searching Git history beyond the first tag for config file changes.
 * This captures all releases, regardless of when tagging started as a release
 * practice.
 *
 * Pre-release versions are not included by default. Use the
 * {@linkcode ReleaseOptions.prerelease prerelease} option to include them.
 *
 * @example Retrieve all releases of a package
 * ```ts
 * import { packageInfo, releases } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const pkg = await packageInfo();
 *   return await releases(pkg, { prerelease: true });
 * });
 * ```
 *
 * @param pkg Package to search releases for
 * @param options Options for fetching releases
 * @returns All releases for this package
 * @throws {GitError} If Git history is not available
 */
export async function releases(
  pkg: Package,
  options?: ReleaseOptions,
): Promise<Release[]> {
  const { limit, prerelease } = options ?? {};
  if (limit && limit < 0) throw RangeError("limit must be non-negative");
  const tags = (await git({
    directory: pkg.directory,
    config: { "versionsort.suffix": ["-pre"] },
  }).tag
    .list({ name: `${pkg.name}@*`, sort: "version" }))
    .filter(parseTag)
    .map((tag) => {
      const version = parseTag(tag);
      assertExists(version, "Cannot parse version from tag");
      const semver = parse(version);
      return { version: parseTag(tag), semver, tag };
    })
    .filter((v) => prerelease || !v.semver.prerelease?.length);
  const releases = tags.map(({ version, tag }, index): Release => {
    assertExists(version, "Cannot parse version from tag");
    const previous = tags.slice(index + 1).find((v) =>
      !v.semver.prerelease?.length
    );
    return {
      version,
      tag: tag.name,
      range: {
        ...previous && { from: previous.tag.name },
        to: tag.name,
      },
    };
  });
  let last = releases.at(-1);
  let seenPrerelease = false;
  for await (const release of historical(pkg, last?.range.to)) {
    if (last?.version === release.version) continue;
    if (!prerelease && parse(release.version).prerelease?.length) {
      seenPrerelease = true;
      continue;
    }
    if (last) last.range.from = release.range.to;
    releases.push(release);
    last = release;
    if (limit !== undefined && releases.length >= limit + 1) break;
  }
  // edge case: single untagged release is indistinguishable from first release
  if (!seenPrerelease && releases.length === 1 && !releases[0]?.tag) return [];
  return releases.slice(0, limit);
}

async function* historical(
  pkg: Package,
  before: string | undefined,
): AsyncIterable<Release> {
  const repo = git({ directory: pkg.root });
  const path = relative(pkg.root, join(pkg.directory, "deno.json"));
  while (true) {
    // deno-lint-ignore no-await-in-loop
    const log = (await repo.commit.log({
      ...before && { to: before },
      path,
      pickaxe: { pattern: "version", updated: true },
      limit: 4,
    })).filter((commit) => commit.hash !== before);
    if (log.length === 0) return;
    before = log.at(-1)?.hash;
    // deno-lint-ignore no-await-in-loop
    const releases = await pool(log, async (commit) => {
      const { value: config, error } = await maybe(() =>
        repo.file.json<Config>(path, { source: commit.hash })
      );
      if (error instanceof Deno.errors.NotFound) return;
      if (error instanceof SyntaxError) return;
      if (error) throw error;
      if (typeof config.version !== "string") return;
      if (config.version === "0.0.0") return;
      if (!canParse(config.version)) return;
      return { version: config.version, range: { to: commit.hash } };
    });
    for (const release of releases) {
      if (release) yield release;
    }
  }
}

/**
 * Returns the commits for a particular release.
 *
 * By default, commits from the entire Git history are returned. The
 * {@linkcode CommitOptions.range range} option can be used to return
 * the commits of a specific range.
 *
 * @example Get commits since the last release
 * ```ts
 * import { commits, packageInfo } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const pkg = await packageInfo();
 *   return await commits(pkg, { types: ["feat", "fix"] });
 * });
 * ```
 *
 * @example Get commits for a specific release
 * ```ts
 * import { commits, packageInfo } from "@roka/forge/workspace";
 *
 * (async () => {
 *   const pkg = await packageInfo();
 *   return await commits(pkg, {
 *     ...pkg.latest ? { range: pkg.latest.range } : {},
 *   });
 * });
 * ```
 *
 * @param pkg Package to generate changelog for
 * @param options Options for generating the changelog
 * @returns Matched commits
 * @throws {GitError} If Git history is not available
 */
export async function commits(
  pkg: Package,
  options?: CommitOptions,
): Promise<ConventionalCommit[]> {
  const log = await git({ directory: pkg.root }).commit.log(options?.range);
  return log
    .map((c) => conventional(c))
    // match scope only on workspaces
    .filter((c) =>
      pkg.root === pkg.directory || scopes(pkg, c.scopes).length > 0
    )
    .filter((c) => options?.breaking !== true || c.breaking)
    .filter((c) =>
      options?.types !== undefined
        ? c.type && options.types.includes(c.type) ||
          (options?.breaking === undefined && c.breaking)
        : true
    );
}

/**
 * Returns matching scope strings against a package.
 *
 * If the package is not a workspace member, non-scoped titles also match.
 *
 * @example Get scopes for a commit
 * ```ts
 * import { packageInfo, scopes } from "@roka/forge/workspace";
 * import { conventional } from "@roka/git/conventional";
 * import { assertEquals } from "@std/assert";
 *
 * (async () => {
 *   const pkg = await packageInfo();
 *   const commit = conventional({ subject: "fix(name,other,*): bugfix" });
 *   assertEquals(scopes(pkg, commit.scopes), ["name", "*"]);
 * });
 * ```
 */
export function scopes(
  pkg: Package,
  scopes: string[] | undefined,
  options?: ScopeOptions,
): string[] {
  const { strict = false } = options ?? {};
  const submodules = strict
    ? [
      `${pkg.name}/unstable`,
      ...Object.keys(modules(pkg)).filter((m) => m).map((m) =>
        `${pkg.name}/${m}`
      ),
    ]
    : [];
  const single = pkg.root === pkg.directory;
  if (single && !scopes?.length) return [""];
  return scopes?.filter((s) =>
    s === "*" ||
    s === pkg.name ||
    (s.startsWith("*/") || s.startsWith(`${pkg.name}/`)) &&
      (!strict || submodules.includes(s.replace(/^\*\//, `${pkg.name}/`))) ||
    (single && s === "unstable")
  ) ?? [];
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
  head: Commit | undefined,
) {
  const current = parse(latest?.version ?? "0.0.0");
  const next = log?.length && log[0]
    ? {
      ...increment(current, updateType(current, pkg, log)),
      prerelease: ["pre", log.length],
      build: [head?.short ?? log[0].short],
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

function isUnstable(pkg: Package, commit: ConventionalCommit) {
  if (!commit.scopes) return false;
  const matched = scopes(pkg, commit.scopes);
  return matched.length > 0 &&
    matched.every((s) => (s === "unstable") || s.endsWith("/unstable"));
}
