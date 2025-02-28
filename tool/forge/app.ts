/**
 * Runtime support for forged applications.
 *
 * Provides functionality for applications compiled by `forge` at runtime.
 * Currently, only the {@linkcode version} function is available.
 *
 * @example
 * ```ts
 * import { version } from "@roka/forge/app";
 *
 * console.log(`App version: ${await version()}`);
 * ```
 *
 * @module
 */

import { PackageError, packageInfo } from "@roka/forge/package";
import { expandGlob } from "@std/fs";
import { basename, dirname, fromFileUrl } from "@std/path";

/** Options for {@linkcode version}. */
export interface VersionOptions {
  /**
   * Add build information to the version.
   * @default {false}
   */
  build?: boolean;
  /**
   * Add Deno version, including v8 and typescript, to the version.
   * @default {false}
   */
  deno?: boolean;
}

/**
 * Returns the version of the current package.
 *
 * Useful for providing a version number to the user of a tool or application.
 *
 * @example
 * ```ts
 * await version();                // => 1.0.0
 * await version({ build: true }); // => 1.0.0 (aarch64-apple-darwin)
 * await version({ deno: true });  // => 1.0.0
 *                                 //    deno 2.2.2
 *                                 //    v8 13.4.114.9-rusty
 *                                 //    typescript 5.7.3
 * ```
 *
 * @example Version string with Deno version information.
 *
 * The version is determined from whichever is available first:
 *  - release tags and {@link https://www.conventionalcommits.org | Conventional Commits} (local development)
 *  - config version from `deno.json` (deno run)
 *  - config version from `deno.json` in the dist directory (deno compile)
 *  - "(unknown)" if none of the above are available
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
    if (pkg.version) return pkg.version;
  } catch (e: unknown) {
    if (!(e instanceof PackageError)) throw e;
  }
  let directory = fromFileUrl(Deno.mainModule);
  while (basename(dirname(directory)) !== "T") {
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
      if (pkg.version) return pkg.version;
    } catch (e: unknown) {
      if (!(e instanceof PackageError)) throw e;
    }
  }
  return "(unknown)";
}
