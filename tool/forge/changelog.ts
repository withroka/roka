/**
 * This module provides the {@linkcode changelog} function to generate a
 * changelog for a package using
 * {@link https://www.conventionalcommits.org | Conventional Commits}.
 *
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 * async function usage() {
 *   const pkg = await packageInfo();
 *   for (const commit of await changelog(pkg) ?? []) {
 *     console.log(commit.summary);
 *   }
 * }
 * ```
 *
 * @module changelog
 */

import type { Package } from "@roka/forge/package";
import { git, GitError, type RevisionRange } from "@roka/git";
import { conventional, type ConventionalCommit } from "@roka/git/conventional";

/** Options for the {@linkcode changelog} function. */
export interface ChangelogOptions {
  /**
   * Commit types to include in the changelog.
   *
   * All types are returned by default.
   *
   * Breaking changes whose types are not included are returned by default.
   * Setting {@linkcode breaking} to `false` will skip these commits.
   */
  type?: string[];
  /**
   * If `true`, returns only breaking changes. If `false`, breaking changes are
   * subject to the {@linkcode type} filter.
   */
  breaking?: boolean;
  /** Range of commits to include in the changelog. */
  range?: RevisionRange;
}

/**
 * Returns the package changelog.
 *
 * By default, changes from all git history is returned. The
 * {@linkcode ChangelogOptions.range | range} option can be used to limit the
 * commits included in the changelog.
 *
 * If the git history is not available, `undefined` is returned.
 *
 * @example Generate a changelog for a package.
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   await changelog(pkg, {
 *     type: ["feat", "fix"],
 *   });
 * }
 * ```
 *
 * @example Generate a changelog for a revision range.
 * ```ts
 * import { changelog } from "@roka/forge/changelog";
 * import { packageInfo } from "@roka/forge/package";
 *
 * async function usage() {
 *   const pkg = await packageInfo();
 *   await changelog(pkg, {
 *     range: { from: "1.0.0", to: "1.1.1" },
 *   });
 * }
 * ```
 *
 * @param pkg Package to generate changelog for.
 * @param options Options for generating the changelog.
 * @returns Changelog summary in Markdown.
 */
export async function changelog(
  pkg: Package,
  options?: ChangelogOptions,
): Promise<ConventionalCommit[] | undefined> {
  try {
    const log = await git({ cwd: pkg.directory }).commits.log(
      options?.range ? { range: options?.range } : {},
    );
    return log
      .map((c) => conventional(c))
      .filter((c) => c.scopes.includes(pkg.name))
      .filter((c) => options?.breaking !== true || c.breaking)
      .filter((c) =>
        options?.type !== undefined
          ? c.type && options.type.includes(c.type) ||
            (options?.breaking === undefined && c.breaking)
          : true
      );
  } catch (e: unknown) {
    // we are not in a git repository
    if (e instanceof GitError) return undefined;
    throw e;
  }
}
