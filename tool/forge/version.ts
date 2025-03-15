/**
 * This module provides functionality for applications compiled by `forge` at
 * runtime.
 *
 * ```ts
 * import { version } from "@roka/forge/version";
 * const appVersion = await version();
 * ```
 *
 * @todo Detect when an app is run as a JSR module without version specifier.
 *
 * @module version
 */

import { expandGlob } from "@std/fs";
import { basename, dirname, fromFileUrl } from "@std/path";
import { canParse, parse } from "@std/semver";
import { PackageError, packageInfo } from "./package.ts";

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
 *  - JSR version, if running as a JSR module
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
    ...options?.release && canParse(version)
      ? [parse(version).prerelease?.length ? "pre-release" : "release"]
      : [],
    ...options?.target ? [Deno.build.target] : [],
  ];
  return `${version}${meta.length ? ` (${meta.join(", ")})` : ""}`;
}

async function versionString(): Promise<string> {
  const version = jsrVersion();
  if (version) return version;
  try {
    const pkg = await packageInfo();
    return pkg.version;
  } catch (e: unknown) {
    if (!(e instanceof PackageError)) throw e;
  }
  let directory = Deno.mainModule;
  try {
    directory = fromFileUrl(directory);
  } catch {
    return "(unknown)";
  }
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

function jsrVersion(): string | undefined {
  let version = Deno.mainModule.match(/jsr:@.+?@(.+)$/)?.[1];
  if (version) return version;
  const stack = new Error().stack;
  // Error
  //  at jsrVersion (https://jsr.io/@roka/forge/VERSION/version.ts:R:C)
  //    at versionString (https://jsr.io/@roka/forge/VERSION/version.ts:R:C)
  //    at version (https://jsr.io/@roka/forge/VERSION/version.ts:R:C)
  //    at caller (https://jsr.io/@caller/caller/VERSION/dir/caller.js:R:C)
  const caller = stack?.split("\n")?.[4];
  version = caller?.match(/https:\/\/jsr.io\/@[^/]+\/[^/]+\/([^/]+)\//)?.[1];
  return version;
}
