/**
 * This module provides functionality for applications compiled by `forge` at
 * runtime.
 *
 * ```ts
 * import { version } from "@roka/forge/version";
 * const appVersion = await version();
 * ```
 *
 * @module app
 */

import { PackageError, packageInfo } from "@roka/forge/package";
import { expandGlob } from "@std/fs";
import { basename, dirname, fromFileUrl } from "@std/path";
import { parse } from "@std/semver";

/** Options for the {@linkcode version} function. */
export interface VersionOptions {
  /**
   * Add release information to the version.
   * @default {false}
   */
  release?: boolean;
  /**
   * Add build information to the version.
   * @default {false}
   */
  target?: boolean;
}

/**
 * Returns the version of the current package.
 *
 * This function is useful for providing a version number to the user of a tool
 * or application.
 *
 * The version is determined from whichever is available first:
 *
 *  - release tags and
 *    {@link https://www.conventionalcommits.org | Conventional Commits}
 *    (local development)
 *  - config version from `deno.json` (deno run)
 *  - config version from `deno.json` in the dist directory (deno compile)
 *  - `"(unknown)"` if none of the above are available
 *
 * @example Retrieve the version of the current package.
 * ```ts
 * await version();
 * // 1.0.0
 * ```
 *
 * @example Retrieve the version with meta information.
 * ```ts
 * await version({ release: true, target: true });
 * // 1.0.0 (release, aarch64-apple-darwin)
 * ```
 */
export async function version(options?: VersionOptions): Promise<string> {
  const version = await versionString();
  const meta = [
    ...options?.release
      ? [parse(version).prerelease?.length ? "pre-release" : "release"]
      : [],
    ...options?.target ? [Deno.build.target] : [],
  ];
  return `${version}${meta.length ? ` (${meta.join(", ")})` : ""}`;
}

async function versionString(): Promise<string> {
  try {
    const pkg = await packageInfo();
    return pkg.version;
  } catch (e: unknown) {
    if (!(e instanceof PackageError)) throw e;
  }
  let directory = fromFileUrl(Deno.mainModule);
  while (!basename(directory).match(/^deno-compile-.+$/)) {
    directory = dirname(directory);
    if (directory === dirname(directory)) break;
  }
  for await (
    const path of expandGlob("**/deno.json", {
      root: directory,
      includeDirs: false,
    })
  ) {
    try {
      const pkg = await packageInfo({ directory: dirname(path.path) });
      return pkg.version;
    } catch (e: unknown) {
      if (!(e instanceof PackageError)) throw e;
    }
  }
  return "(unknown)";
}
