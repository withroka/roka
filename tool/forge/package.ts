/**
 * Package management.
 *
 * Provides functions to work with packages, through the main function
 * {@linkcode packageInfo}, which returns information about a package.
 *
 * - Package directory and name
 * - Package config from `deno.json`
 * - Latest package release from git tags
 * - Updates since the last release
 * - Calculated package version from conventional commits since last release
 *
 * For monorepos, the {@linkcode workspace} function can be used to fetch all
 * packages in the workspace.
 *
 * @module
 */

import { git, GitError, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { assert } from "@std/assert";
import { distinctBy } from "@std/collections";
import { basename, dirname, fromFileUrl, join, normalize } from "@std/path";
import {
  canParse as canParseVersion,
  format as formatVersion,
  increment as incrementVersion,
  lessThan,
  parse as parseVersion,
} from "@std/semver";

/** An error while working with packages. */
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

/** Core package information. */
export interface Package {
  /** Package directory. */
  directory: string;
  /** Package module name. */
  module: string;
  /** Package config from `deno.json`. */
  config: Config;
  /** Calculated package version, might be different than config version. */
  version?: string;
  /** Latest release of this package. */
  release?: Release;
  /** Changes over the last release. */
  update?: Update;
}

/** Package release information. */
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

/** Package update information. */
export interface Update {
  /** Type of the update. */
  type?: UpdateType;
  /** Updated version, if the package would be released at this state. */
  version: string;
  /** Changes in this update. */
  changelog: ConventionalCommit[];
}

/** Package configuration from `deno.json`. */
export interface Config {
  /** Package name. */
  name?: string;
  /** Package version. */
  version?: string;
  /** Workspace packages. */
  workspace?: string[];
  /** Configuration for compiling the package. */
  compile?: CompileConfig;
}

/** Configuration for compiling the package. */
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

/** Allowed Deno runtime permissions for compiled binary. */
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
}

/** Permission descriptor for config from Deno type. */
export type PermissionDescriptor<T> =
  | boolean
  | NonNullable<T>
  | NonNullable<T[]>;

/** Options for {@linkcode packageInfo}. */
export interface PackageOptions {
  /**
   * Package directory to analyze
   *
   * If a directory is not defined, the package of the main module is returned.
   */
  directory?: string;
}

/** Options for {@linkcode workspace}. */
export interface WorkspaceOptions {
  /**
   * List of directories to fetch packages from.
   * @default {["."]}
   */
  directories?: string[];
}

/** Returns information about a package. */
export async function packageInfo(options?: PackageOptions): Promise<Package> {
  const directory = normalize(
    options?.directory ?? dirname(fromFileUrl(Deno.mainModule)),
  );
  const config = await readConfig(directory);
  const pkg: Package = {
    directory,
    module: basename(config.name ?? directory),
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
 * Returns all packages, recursively traversing workspaces.
 *
 * @todo Skip root.
 * @todo Add a name filter.
 */
export async function workspace(
  options?: WorkspaceOptions,
): Promise<Package[]> {
  const directories = options?.directories ?? ["."];
  const packages = await Promise.all(
    directories?.map((directory) => packageInfo({ directory, ...options })),
  );
  const all = (await Promise.all(
    packages.map(async (pkg) => [
      pkg,
      ...await workspace({
        ...options,
        directories: pkg.config.workspace?.map((child) =>
          join(pkg.directory, child)
        ) ??
          [],
      }),
    ]),
  )).flat();
  return distinctBy(all, (pkg) => pkg.directory);
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
  const name = `${pkg.module}@*`;
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
    c.scopes.includes(pkg.module) || c.scopes.includes("*")
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
