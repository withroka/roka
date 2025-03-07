/**
 * This module provides functions and types to work with packages.
 *
 * The {@linkcode packageInfo} function returns information for a single
 * package.
 *
 * ```ts
 * import { packageInfo } from "@roka/forge/package";
 * const pkg = await packageInfo({ directory: "tool/forge" });
 * ```
 *
 * The returned {@linkcode Package} object holds the following information:
 *
 *  - Package name and directory.
 *  - Package configuration (`deno.json`).
 *  - The latest package release from git tags.
 *  - Updates using
 *    {@link https://www.conventionalcommits.org | Conventional Commits} since
 *    the last release.
 *  - Calculated {@link https://semver.org | semantic version}.
 *
 * For monorepos, the {@linkcode workspace} function can be used to fetch all
 * packages in the workspace.
 *
 * ```ts
 * const packages = await workspace();
 * ```
 *
 * @module package
 */

import { git, GitError, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { assert } from "@std/assert";
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
  canParse as canParseVersion,
  format as formatVersion,
  increment as incrementVersion,
  lessThan,
  parse as parseVersion,
} from "@std/semver";

/** An error thrown by the {@link [jsr:@roka/forge]} module. */
export class PackageError extends Error {
  /**
   * Construct PackageError.
   *
   * @param message The error message to be associated with this error.
   * @param options.cause The cause of the error.
   */
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
   * Calculated package version, which might be different from the config
   * version.
   */
  version?: string;
  /** Latest release of this package. */
  release?: Release;
  /** Changes over the last release. */
  update?: Update;
}

/**
 * Release information for a package returned by the {@linkcode packageInfo} or
 * {@linkcode workspace} functions.
 */
export interface Release {
  /**
   * Release version.
   *
   * If there was no tag release, this will be "0.0.0".
   */
  version: string;
  /** Latest release tag. */
  tag?: Tag;
}

/** Semantic version update type. */
export type UpdateType = "major" | "minor" | "patch";

/**
 * Update information for a package returned by the
 * {@linkcode packageInfo} or {@linkcode workspace} functions.
 */
export interface Update {
  /** Type of the update. */
  type?: UpdateType;
  /** Updated version, if the package would be released at this state. */
  version: string;
  /** Changes in this update. */
  changelog: ConventionalCommit[];
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

/**
 * Returns information about a package.
 *
 * @throws {PackageError} If the package configuration was malformed, release
 *                        versions could not be parsed from git tags.
 */
export async function packageInfo(options?: PackageOptions): Promise<Package> {
  const directory = normalize(
    options?.directory ?? dirname(fromFileUrl(Deno.mainModule)),
  );
  const config = await readConfig(directory);
  const pkg: Package = {
    directory,
    name: basename(config.name ?? directory),
    config: config,
  };
  if (pkg.config.version === undefined) return pkg;
  try {
    // this works if we are in a git repository
    const release = await findRelease(pkg);
    if (release) pkg.release = release;
    const update = await calculateUpdate(pkg);
    if (update) pkg.update = update;
  } catch (e: unknown) {
    if (!(e instanceof GitError)) throw e;
  }
  pkg.version = pkg.update
    ? pkg.update.version
    : pkg.release
    ? pkg.release.version
    : pkg.config.version;
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

async function findRelease(pkg: Package): Promise<Release | undefined> {
  const repo = git({ cwd: pkg.directory });
  const name = `${pkg.name}@*`;
  const sort = "version";
  const [tag] = [
    ...await repo.tags.list({ name, sort, pointsAt: "HEAD" }),
    ...await repo.tags.list({ name, sort, noContains: "HEAD" }),
  ];
  if (tag === undefined) return { version: "0.0.0" };
  const version = tag.name?.split("@")[1];
  if (!version || !canParseVersion(version)) {
    throw new PackageError(
      `Cannot parse semantic version from tag: ${tag.name}`,
    );
  }
  return { version, tag };
}

async function calculateUpdate(pkg: Package): Promise<Update | undefined> {
  if (!pkg.release) return undefined;
  const log = await git({ cwd: pkg.directory }).commits.log({
    ...pkg.release?.tag !== undefined
      ? { range: { from: pkg.release.tag } }
      : { paths: ["."] },
  });
  const changelog = log.map((c) => conventional(c)).filter((c) =>
    c.scopes.includes(pkg.name) || c.scopes.includes("*")
  );
  if (pkg.release?.version !== pkg.config.version) {
    return { ...forcedUpdate(pkg), changelog };
  }
  if (!changelog.length) return undefined;
  const type = (changelog.some((c) => c.breaking) &&
      parseVersion(pkg.release.version).major > 0)
    ? "major"
    : (changelog.some((c) => c.type === "feat") ||
        changelog.some((c) => c.breaking))
    ? "minor"
    : "patch";
  const version = formatVersion({
    ...incrementVersion(parseVersion(pkg.release.version), type),
    ...changelog[0] &&
      { prerelease: [`pre.${changelog.length}`], build: [changelog[0].short] },
  });
  return { type, version, changelog };
}

function forcedUpdate(pkg: Package): Update {
  assert(pkg.release?.version, "Cannot force update without prior a version");
  assert(pkg.config.version, "Cannot force update without target a version");
  const oldVersion = parseVersion(pkg.release.version);
  const newVersion = parseVersion(pkg.config.version);
  if (lessThan(newVersion, oldVersion)) {
    throw new PackageError("Cannot force update to an older version");
  }
  const type = newVersion.major > oldVersion.major
    ? "major"
    : newVersion.minor > oldVersion.minor
    ? "minor"
    : "patch";
  return { type, version: formatVersion(newVersion), changelog: [] };
}
