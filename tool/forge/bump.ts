import { changelog } from "@roka/forge/changelog";
import { github, type PullRequest } from "@roka/github";
import { type Package, packageInfo } from "@roka/package";
import { assert, assertEquals } from "@std/assert";
import { join } from "@std/path";
import { format, parse } from "@std/semver";

const BUMP_BRANCH = "automated/bump";

/** Options for releasing a package. */
export interface BumpOptions {
  /** GitHub access token. */
  token?: string;
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
 * Update version number of packages on `deno.json`.
 *
 * The calculated version is based on the calculated version {@code pkg.update},
 * dropping pre-release and build information.
 */
export async function bump(
  packages: Package[],
  options?: BumpOptions,
): Promise<PullRequest | undefined> {
  packages = await Promise.all(packages.map((pkg) => updateVersion(pkg)));
  if (!options?.pr || packages.length === 0) return undefined;
  const repo = await github(options).repos.get();
  const title = packages.length === 1
    ? "chore: bump package version"
    : "chore: bump package versions";
  const body = prBody(packages);
  await repo.git.branches.checkout({ new: BUMP_BRANCH });
  await repo.git.config.set({ ...options?.user && { user: options?.user } });
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
  assert(pkg.update, "Cannot bump a package without update");
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
    `## ${pkg.module}@${pkg.version} [${pkg.update?.type}]`,
    changelog(pkg),
  ]).flat().join("\n\n");
}
