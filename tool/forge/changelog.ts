/**
 * This module provides the {@linkcode changelog} function to generate a
 * formatted changelog from package update information using
 * {@link https://www.conventionalcommits.org | Conventional Commits}.
 *
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 * async function usage() {
 *   const pkg = await packageInfo();
 *   console.log(await changelog(pkg));
 * }
 * ```
 *
 * @module changelog
 */

import type { Package } from "@roka/forge/package";

/**
 *  Returns the changelog summary for a package since its last release.
 *
 * @example Generate a changelog for a package.
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   console.log(await changelog(pkg));
 * }
 * ```
 *
 * @param pkg Package to generate changelog for.
 * @returns Changelog summary in Markdown.
 */
export function changelog(pkg: Package): string {
  return pkg.update?.changelog?.map((c) => ` * ${c.summary}`).join("\n") ?? "";
}
