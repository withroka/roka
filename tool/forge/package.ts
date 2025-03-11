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
 *  - Package configuration (`deno.json`).
 *  - The latest package release from git tags.
 *  - {@link https://www.conventionalcommits.org | Conventional Commits} since
 *    the latest release.
 *  - Calculated {@link https://semver.org | semantic version}.
 *
 * Use the {@linkcode workspace} function to fetch all packages in a monorepo.
 *
 * ```ts
 * const packages = await workspace();
 * ```
 *
 * @module package
 */

import { git, GitError, type RevisionRange, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { assertExists } from "@std/assert";
import { slidingWindows } from "@std/collections";
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

/** An error thrown by the {@link [jsr:@roka/forge]} module. */
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
  /** Package directory. */
  directory: string;
  /** Package config from `deno.json`. */
  config: Config;
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
  /** Release tag. */
  tag: Tag;
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
  /** Package exports. */
  exports?: string | Record<string, string>;
  /** Configuration for compiling the package. */
  compile?: CompileConfig;
}

/**
 * Configuration for compiling the package with the {@linkcode compile}
 * function.
 */
export interface CompileConfig {
  /** Entry module for the package. */
  main?: string;
  /** Include patterns for additional files to bundle. */
  include?: string[];
  /** Enable unstable KV feature. */
  kv?: boolean;
  /** Allowed Deno runtime permissions. */
  permissions?: Permissions;
}

/**
 * Runtime permissions for a binary created with the {@linkcode compile}
 * function.
 */
export interface Permissions {
  /** Read file system permissions. */
  read?: PermissionDescriptor<Deno.ReadPermissionDescriptor["path"]>;
  /** Write file system permissions. */
  write?: PermissionDescriptor<Deno.WritePermissionDescriptor["path"]>;
  /** Network access permissions. */
  net?: PermissionDescriptor<Deno.NetPermissionDescriptor["host"]>;
  /** Environment access permissions. */
  env?: PermissionDescriptor<Deno.EnvPermissionDescriptor["variable"]>;
  /** Run subprocess permissions. */
  run?: PermissionDescriptor<Deno.RunPermissionDescriptor["command"]>;
  /** System access permissions. */
  sys?: PermissionDescriptor<Deno.SysPermissionDescriptor["kind"]>;
  /** Foreign function interface access permissions. */
  ffi?: PermissionDescriptor<Deno.FfiPermissionDescriptor["path"]>;
  /**
   * Prompt for permissions at runtime.
   * @default {false}
   */
  prompt?: boolean;
}

/** Permission descriptor for config from Deno type. */
export type PermissionDescriptor<T> =
  | boolean
  | NonNullable<T>
  | NonNullable<T[]>;

/** Options for the {@linkcode packageInfo} function. */
export interface PackageOptions {
  /**
   * Directory to return package from.
   *
   * If a directory is not defined, the package of the main module is returned.
   */
  directory?: string;
}

/** Options for the {@linkcode workspace} function. */
export interface WorkspaceOptions {
  /**
   * Directory to return packages from.
   * @default {["."]}
   */
  directory?: string;
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
   * Setting {@linkcode breaking} to `false` will skip these commits.
   */
  type?: string[];
  /**
   * If `true`, returns only breaking changes. If `false`, breaking changes are
   * subject to the {@linkcode type} filter.
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
  const directory = normalize(
    options?.directory ?? dirname(fromFileUrl(Deno.mainModule)),
  );
  const config = await readConfig(directory);
  const name = basename(config.name ?? directory);
  const pkg: Package = {
    directory,
    name,
    config,
    version: config.version ?? "0.0.0",
  };
  try {
    const [latest] = await releases(pkg);
    const changes = await commits(pkg, {
      type: ["feat", "fix"],
      ...latest && { range: { from: latest.tag } },
    });
    if (latest !== undefined) pkg.latest = latest;
    if (changes !== undefined) {
      pkg.changes = changes;
      pkg.version = calculateVersion(pkg.version, latest, changes);
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
  const { directory = ".", filters = [] } = options ?? {};
  const patterns = filters.map((f) => globToRegExp(f));
  const pkg = await packageInfo({ directory, ...options });
  const packages = pkg.config.workspace === undefined
    ? [pkg]
    : await Promise.all(pkg.config.workspace.map(async (child) => {
      return await packageInfo({ directory: join(pkg.directory, child) });
    }));
  return packages
    .filter((pkg) =>
      patterns.length === 0 ||
      patterns.some((p) =>
        pkg.name.match(p) ||
        relative(directory, pkg.directory).match(p)
      )
    );
}

/**
 * Returns all releases of a package based on its git tags.
 *
 * @example Retrieve all releases of a package.
 * ```ts
 * import { releases, packageInfo } from "@roka/forge/package";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   return await releases(pkg);
 * }
 * ```
 * @param pkg Package to search releases for.
 * @returns All releases for this package from git tags.
 * @throws {GitError} If git history is not available.
 */
export async function releases(pkg: Package): Promise<Release[]> {
  const tags = (await git({ cwd: pkg.directory }).tags
    .list({ name: `${pkg.name}@*`, sort: "version" }))
    .filter(parseTag);
  const windows = slidingWindows(tags, 2, { partial: true });
  const result = windows.map(
    ([tag, previous]) => {
      assertExists(tag, `Cannot use tag`);
      const version = parseTag(tag);
      assertExists(version, `Cannot parse version from tag`);
      return {
        version,
        tag,
        range: {
          ...previous && { from: previous.commit.hash },
          to: tag.commit.hash,
        },
      };
    },
  );
  return result;
}

/**
 * Returns the commits of a particular release.
 *
 * By default, only changes if the next release is returned. The
 * {@linkcode CommitOptions.release | release} option can be used to return
 * the commits of a specific release.
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
  const log = await git({ cwd: pkg.directory }).commits.log(
    options?.range ? { range: options?.range } : {},
  );
  return log
    .map((c) => conventional(c))
    .filter((c) => c.scopes.includes(pkg.name))
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
  version: string,
  latest: Release | undefined,
  log: ConventionalCommit[],
) {
  const current = parse(latest?.version ?? "0.0.0");
  const next = log?.length && log[0]
    ? {
      ...increment(current, updateType(current, log)),
      prerelease: [`pre.${log.length}`],
      build: [log[0].short],
    }
    : current;
  const coded = parse(version);
  return format(greaterThan(next, coded) ? next : coded);
}

function updateType(current: SemVer, changelog: ConventionalCommit[]) {
  const breaking = changelog.some((c) => c.breaking);
  if (current.major > 0 && breaking) return "major";
  const feature = changelog.some((c) => c.type === "feat");
  if (breaking || feature) return "minor";
  return "patch";
}
