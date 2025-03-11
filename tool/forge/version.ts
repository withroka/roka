/**
 * This module provides functionality for applications compiled by `forge` at
 * runtime. Currently, only the {@linkcode version} function is available.
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

/** Options for the {@linkcode version} function. */
export interface VersionOptions {
  /**
   * Add build information to the version.
   * @default {false}
   */
  build?: boolean;
  /**
   * Add Deno, v8 and TypeScript versions to the output.
   * @default {false}
   */
  deno?: boolean;
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
 * @example Retrieve the version with build information.
 * ```ts
 * await version({ build: true });
 * // 1.0.0 (aarch64-apple-darwin)
 * ```
 *
 * @example Retrieve the Deno version information.
 * ```ts
 * await version({ deno: true });
 * // 1.0.0
 * // deno 2.2.2
 * // v8
 * // typescript 5.7.3
 * ```
 */
export async function version(options?: VersionOptions): Promise<string> {
  return [
    [
      await packageVersion(),
      ...options?.build ? [`(${Deno.build.target})`] : [],
    ]
      .join(" "),
    ...options?.deno
      ? [
        `deno ${Deno.version.deno}`,
        `v8 ${Deno.version.v8}`,
        `typescript ${Deno.version.typescript}`,
      ]
      : [],
  ].join("\n");
}

async function packageVersion(): Promise<string> {
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
