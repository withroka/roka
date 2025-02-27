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
import { dirname, join } from "@std/path";

/**
 * Returns the version of the current package.
 *
 * Useful for providing a version number to the user of a tool or application.
 *
 * The version is determined from whichever is available first:
 *  - release tags and {@link https://www.conventionalcommits.org | Conventional Commits} (local development)
 *  - config version from `deno.json` (deno run)
 *  - config version from `deno.json` in the dist directory (deno compile)
 *  - "(unknown)" if none of the above are available
 */
export async function version(): Promise<string> {
  return [
    `${await packageVersion()} (${Deno.build.target})`,
    `deno ${Deno.version.deno}`,
    `v8 ${Deno.version.v8}`,
    `typescript ${Deno.version.typescript}`,
  ].join("\n");
}

async function packageVersion(): Promise<string> {
  try {
    const pkg = await packageInfo();
    if (pkg.version) return pkg.version;
  } catch (e: unknown) {
    if (!(e instanceof PackageError)) throw e;
  }
  if (import.meta.dirname) {
    for await (
      const path of expandGlob("**/deno.json", {
        root: join(import.meta.dirname, "..", "..", "dist"),
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
  }
  return "(unknown)";
}
