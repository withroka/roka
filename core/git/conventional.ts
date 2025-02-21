/**
 * Provides {@link https://www.conventionalcommits.org | Conventional Commits}.
 *
 * This module provides the {@link conventional} function to convert a
 * {@linkcode Commit} object to a {@linkcode ConventionalCommit} object.
 *
 * @example
 * ```ts
 * import { tempRepo } from "@roka/git/testing";
 * import { conventional } from "@roka/git/conventional";
 * import { assertEquals } from "@std/assert";
 *
 * const repo = await tempRepo();
 * await repo.commits.create("feat(cli): add new command", { allowEmpty: true });
 * await repo.commits.create("fix(cli): fix last command", { allowEmpty: true });
 *
 * const commits = (await repo.commits.log()).map(conventional);
 * ```
 *
 * This implementation conforms to the version 1.0.0 of the specification,
 * except that it also accepts the `BREAKING-CHANGE` footer from
 * {@link https://git-scm.com/docs/git-interpret-trailers | git trailers}.
 *
 * @see {@link https://www.conventionalcommits.org/en/v1.0.0/ | Conventional Commits 1.0.0}
 *
 * @module
 */

import type { Commit } from "@roka/git";
import { assert } from "@std/assert";

/**
 * A {@link https://www.conventionalcommits.org | Conventional Commit} returned
 * by {@linkcode conventional}.
 */
export interface ConventionalCommit extends Commit {
  /** Conventional commits: Commit description. */
  description: string;
  /** Conventional commits: Commit type. */
  type?: string;
  /** Conventional commits: Scopes affected by the commit. */
  scopes: string[];
  /** Conventional commits: Breaking change description. */
  breaking?: string;
  /** Conventional commits: Footer lines. */
  footers: Record<string, string>;
}

/**
 * Creates a commit object with
 * {@link https://www.conventionalcommits.org | Conventional Commits} details.
 *
 * @example
 * ```ts
 * import { tempRepo } from "@roka/git/testing";
 * import { conventional } from "@roka/git/conventional";
 * import { assertEquals, assertFalse } from "@std/assert";
 *
 * const repo = await tempRepo();
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.index.add("file.txt");
 * await repo.commits.create("feat(cli): add new command", { allowEmpty: true });
 *
 * const commit = conventional(await repo.commits.head())
 * assertEquals(commit.type, "feat");
 * assertEquals(commit.scopes, ["cli"]);
 * assertFalse(commit.breaking);
 * ```
 */
export function conventional(commit: Commit): ConventionalCommit {
  const footers = extractFooters(commit);
  const footerBreaking = footers["BREAKING-CHANGE"];
  const match = commit.summary?.match(
    /^(?:(?<type>[a-zA-Z]+)(?:\((?<scopes>[^()]*)\))?(?<exclamation>!?):s*)?\s*(?<description>[^\s].*)$/,
  );
  const { type, scopes, exclamation, description } = { ...match?.groups };
  assert(description, "Commit must have description");
  if (!type) return { ...commit, description, scopes: [], footers };
  const breaking = footerBreaking || (exclamation ? description : undefined);
  return {
    ...commit,
    description,
    type: type.toLowerCase(),
    scopes: scopes?.split(",").map((m) => m.trim().toLowerCase()) ?? [],
    ...breaking && { breaking },
    footers,
  };
}

function extractFooters(commit: Commit): Record<string, string> {
  const bodyLastParagraph = commit.body?.split("\n\n").pop();
  const bodyFooters = bodyLastParagraph?.split("\n")?.map((line) => {
    const match = line.match(/^\s*(?<key>.*?)(?<sep>:| #)\s*(?<value>.*)\s*$/);
    let { key, sep, value } = { ...match?.groups };
    if (!key || !value) return undefined;
    if (key === "BREAKING CHANGE") key = "BREAKING-CHANGE";
    if (sep !== ":" && key === "BREAKING-CHANGE") return undefined;
    if (sep === " #") key = key.toLowerCase();
    return [key, value];
  });
  if (bodyFooters && bodyFooters?.every((footer) => footer !== undefined)) {
    return { ...commit.trailers, ...Object.fromEntries(bodyFooters) };
  }
  return commit.trailers;
}
