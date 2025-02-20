import type { Commit } from "@roka/git";
import { assert } from "@std/assert";

/**
 * A commit object that exposes conventional commit details.
 *
 * For example, a commit summary like `feat(cli): add new command` will have
 * its type set to `feat` and modules set to `cli`.
 *
 * A {@linkcode ConventionalCommit} object can be converted to a
 * {@linkcode ConventionalCommit} using the {@linkcode conventional} function.
 *
 * @see {@link https://www.conventionalcommits.org|Conventional Commits}
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
