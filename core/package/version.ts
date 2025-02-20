import { expandGlob } from "@std/fs";
import { dirname, join } from "@std/path";
import { getPackage, PackageError } from "./package.ts";

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

/**
 * Version details of current package, Deno, V8 and TypeScript.
 *
 * @todo Move this to a CLI package.
 */
export async function displayVersion(): Promise<string> {
  return [
    `${await version()} (${Deno.build.target})`,
    `deno ${Deno.version.deno}`,
    `v8 ${Deno.version.v8}`,
    `typescript ${Deno.version.typescript}`,
  ].join("\n");
}
