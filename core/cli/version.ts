/**
 * Version string for the current application.
 *
 * @example
 * ```ts
 * import { version } from "@roka/cli/version";
 * import { Command, EnumType } from "@cliffy/command";
 * const command = new Command()
     .name("application")
     .version(await version())
     .action(() => console.log("Hello, world!"));
 * ```
 *
 * @module
 */

import { version as packageVersion } from "@roka/package";

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
