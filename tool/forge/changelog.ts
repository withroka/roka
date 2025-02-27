/**
 * Package changelogs.
 *
 * Provides the {@linkcode changelog} function to generate formatted changelogs
 * from package update information using conventional commits. Supports both
 * plain text and markdown formats for displaying version changes.
 *
 * @module
 */

import type { Package } from "@roka/forge/package";

/** Returns the changelog summary for a package since its last release. */
export function changelog(pkg: Package): string {
  return pkg.update?.changelog?.map((c) => ` * ${c.summary}`).join("\n") ?? "";
}
