import { git, GitError, type Tag } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";
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
  /** Release version. */
  version: string;
  /** Release tag. */
  tag: Tag;
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
  if (tag === undefined) return;
  const version = tag.name?.split("@")[1];
  if (!version || !canParseVersion(version)) {
    throw new PackageError(
      `Cannot parse semantic version from tag: ${tag.name}`,
    );
  }
  return { version, tag };
}

async function getUpdate(pkg: Package): Promise<Update | undefined> {
  const log = await git({ cwd: pkg.directory }).log({
    ...pkg.release?.tag !== undefined
      ? { range: { from: pkg.release.tag } }
      : { paths: ["."] },
  });
  const changelog = log.map((c) => conventional(c)).filter((c) =>
    c.modules.includes(pkg.module) || c.modules.includes("*")
  );
  if (pkg.release?.version !== pkg.config.version) {
    return { ...forcedUpdate(pkg), changelog };
  }
  if (!changelog.length) return undefined;
  const type = (changelog.some((c) => c.breaking) &&
      parseVersion(pkg.release?.version ?? "0.0.0").major > 0)
    ? "major"
    : (changelog.some((c) => c.type === "feat") ||
        changelog.some((c) => c.breaking))
    ? "minor"
    : "patch";
  const version = formatVersion({
    ...incrementVersion(parseVersion(pkg.release?.version ?? "0.0.0"), type),
    ...changelog[0] &&
      { prerelease: [`pre.${changelog.length}`], build: [changelog[0].short] },
  });
  return { type, version, changelog };
}

function forcedUpdate(pkg: Package): Update {
  const oldVersion = parseVersion(pkg.release?.version ?? "0.0.0");
  const newVersion = parseVersion(pkg.config.version ?? "0.0.0");
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
