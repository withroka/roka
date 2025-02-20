/**
 * Provides {@link https://www.conventionalcommits.org | Conventional Commits}.
 *
 * This module provides the {@link conventional} function to convert a
 * {@linkcode Commit} object to a {@linkcode ConventionalCommit} object.
 *
 * @example
 * ```ts
 * import { git } from "@roka/git";
 * import { conventional } from "@roka/git/conventional";
 * import { tempDirectory } from "@roka/testing/temp";
 * import { assertEquals } from "@std/assert";
 *
 * await using dir = await tempDirectory();
 * const repo = git({ cwd: dir.path });
 * await repo.init();
 * await repo.commit("feat(cli): add new command", {
 *   body: "BREAKING CHANGE: this is a breaking change",
 *   allowEmpty: true,
 * });
 *
 * const commit = conventional(await repo.head())
 * assertEquals(commit.type, "feat");
 * assertEquals(commit.modules, ["cli"]);
 * assertEquals(commit.breaking, true);
 * ```
 *
 * @see {@link https://www.conventionalcommits.org/en/v1.0.0/
 *             | Conventional Commits 1.0.0}
 *
 * @module
 */

import type { Commit } from "@roka/git";
import { assert } from "@std/assert";

/**
 * A commit object that exposes conventional commit details.
 *
 * @example
 * ```ts
 * import { git } from "@roka/git";
 * import { conventional } from "@roka/git/conventional";
 * import { tempDirectory } from "@roka/testing/temp";
 * import { assertEquals } from "@std/assert";
 *
 * await using dir = await tempDirectory();
 * const repo = git({ cwd: dir.path });
 * await repo.init();
 * await repo.commit("feat(cli): add new command", { allowEmpty: true });
 *
 * const commit = conventional(await repo.head())
 * assertEquals(commit.type, "feat");
 * assertEquals(commit.modules, ["cli"]);
 * assertEquals(commit.breaking, false);
 * ```
 */
export interface ConventionalCommit extends Commit {
  /** Conventional commits: Commit description. */
  description: string;
  /** Conventional commits: Commit type. */
  type: string | undefined;
  /** Conventional commits: Modules affected by the commit. */
  modules: string[];
  /** Conventional commits: Whether the commit is a breaking change. */
  breaking: boolean;
}

const SUMMARY_PATTERN =
  /^(?:(?<type>[a-z]+)(?:\((?<modules>[^()]*)\))?(?<breaking>!?):s*)?\s*(?<description>[^\s].*)$/;

/** Creates a commit object with conventional commit details. */
export function conventional(commit: Commit): ConventionalCommit {
  const match = commit.summary?.match(SUMMARY_PATTERN);
  const footerBreaking = commit.body?.match(
    /(^|\n\n)BREAKING CHANGE: (.+)($|\n)/,
  );
  assert(match?.groups?.description, "Commit must have description");
  return {
    ...commit,
    description: match.groups.description,
    type: match.groups.type,
    modules: match.groups.modules?.split(",").map((m) => m.trim()) ?? [],
    breaking: !!footerBreaking || !!match.groups.breaking,
  };
}
