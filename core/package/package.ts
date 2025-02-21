import { git, GitError, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
import { assert } from "@std/assert";
import { distinctBy } from "@std/collections";
import { expandGlob } from "@std/fs";
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

/** Information about a Deno package. */
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

/** Configuration for compiling the package. */
export interface CompileConfig {
  /** Entry module for the package. */
  main?: string;
  /** Include patterns for the package. */
  include?: string[];
  /** Enable unstable KV feature. */
  kv?: boolean;
  /** Allowed Deno runtime permissions. */
  permissions?: Permissions;
}

/** Allowed Deno runtime permissions for compiled binary. */
export interface Permissions {
  /** Read file system permissions. */
  read?:
    | boolean
    | NonNullable<Deno.ReadPermissionDescriptor["path"]>
    | NonNullable<Deno.ReadPermissionDescriptor["path"]>[];
  /** Write file system permissions. */
  write?:
    | boolean
    | NonNullable<Deno.WritePermissionDescriptor["path"]>
    | NonNullable<Deno.WritePermissionDescriptor["path"]>[];
  /** Network access permissions. */
  net?:
    | boolean
    | NonNullable<Deno.NetPermissionDescriptor["host"]>
    | NonNullable<Deno.NetPermissionDescriptor["host"]>[];
  /** Environment access permissions. */
  env?:
    | boolean
    | NonNullable<Deno.EnvPermissionDescriptor["variable"]>
    | NonNullable<Deno.EnvPermissionDescriptor["variable"]>[];
  /** Run subprocess permissions. */
  run?:
    | boolean
    | NonNullable<Deno.RunPermissionDescriptor["command"]>
    | NonNullable<Deno.RunPermissionDescriptor["command"]>[];
  /** System access permissions. */
  sys?:
    | boolean
    | NonNullable<Deno.SysPermissionDescriptor["kind"]>
    | NonNullable<Deno.SysPermissionDescriptor["kind"]>[];
  /** Foreign function interface access permissions. */
  ffi?:
    | boolean
    | NonNullable<Deno.FfiPermissionDescriptor["path"]>
    | NonNullable<Deno.FfiPermissionDescriptor["path"]>[];
}

/** Configuration from `deno.json`. */
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

/** Information about a package release. */
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

/** Information about a package update. */
export interface Update {
  /** Type of the update. */
  type: "major" | "minor" | "patch" | undefined;
  /** Updated version, if the package would be released at this state. */
  version: string;
  /** Changes in this update. */
  changelog: ConventionalCommit[];
}

/** Options for package retrieval. */
export interface PackageOptions {
  /**
   * Package directory.
   * @default {dirname(Deno.mainModule())}
   */
  directory?: string;
}

/** Options for workspace retrieval. */
export interface WorkspaceOptions {
  /**
   * List of directories to fetch packages from.
   * @default {["."]}
   */
  directories?: string[];
}

/** Returns information about a package. */
export async function getPackage(options?: PackageOptions): Promise<Package> {
  const directory = normalize(
    options?.directory ?? dirname(fromFileUrl(Deno.mainModule)),
  );
  const config = await getConfig(directory);
  const pkg: Package = {
    directory,
    module: basename(config.name ?? directory),
    config: config,
  };
  if (pkg.config.version === undefined) return pkg;
  try {
    // this works if we are in a git repository
    const release = await getRelease(pkg);
    if (release) pkg.release = release;
    const update = await getUpdate(pkg);
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

/** Returns all packages, recursively traversing workspaces. */
export async function getWorkspace(
  options?: WorkspaceOptions,
): Promise<Package[]> {
  const directories = options?.directories ?? ["."];
  const packages = await Promise.all(
    directories?.map((directory) => getPackage({ directory, ...options })),
  );
  const all = (await Promise.all(
    packages.map(async (pkg) => [
      pkg,
      ...await getWorkspace({
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

/**
 * Returns the version of the current package.
 *
 * The version is determined from whichever is available first:
 *  - release tags and {@link https://www.conventionalcommits.org | Conventional Commits} (local development)
 *  - config version from `deno.json` (deno run)
 *  - config version from `deno.json` in the dist directory (deno compile)
 *  - "(unknown)" if none of the above are available
 */
export async function version(): Promise<string> {
  try {
    const pkg = await getPackage();
    if (pkg.version) return pkg.version;
  } catch (e: unknown) {
    if (!(e instanceof PackageError)) throw e;
  }
  if (import.meta.dirname) {
    for await (
      const path of expandGlob("**/deno.json", {
        root: join(import.meta.dirname, "..", "dist"),
        includeDirs: false,
      })
    ) {
      try {
        const pkg = await getPackage({ directory: dirname(path.path) });
        if (pkg.version) return pkg.version;
      } catch (e: unknown) {
        if (!(e instanceof PackageError)) throw e;
      }
    }
  }
  return "(unknown)";
}

async function getConfig(directory: string): Promise<Config> {
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

async function getRelease(pkg: Package): Promise<Release | undefined> {
  const repo = git({ cwd: pkg.directory });
  const name = `${pkg.module}@*`;
  const sort = "version";
  const [tag] = [
    ...await repo.tagList({ name, sort, pointsAt: "HEAD" }),
    ...await repo.tagList({ name, sort, noContains: "HEAD" }),
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

async function getUpdate(pkg: Package): Promise<Update | undefined> {
  if (!pkg.release) return undefined;
  const log = await git({ cwd: pkg.directory }).log({
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
