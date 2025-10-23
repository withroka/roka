/**
 * This module provides the {@linkcode conventional} function to convert a
 * {@linkcode Commit} object to a
 * {@link https://www.conventionalcommits.org Conventional Commit}.
 *
 * ```ts
 * import { git } from "@roka/git";
 * import { conventional } from "@roka/git/conventional";
 * import { assertEquals, assertFalse } from "@std/assert";
 * (async () => {
 *   const repo = git();
 *   await repo.commits.create("feat(cli): add new command");
 *   const commit = conventional(await repo.commits.head());
 *   assertEquals(commit.type, "feat");
 *   assertEquals(commit.scopes, ["cli"]);
 *   assertEquals(commit.description, "add new command");
 *   assertFalse(commit.breaking);
 * });
 * ```
 *
 * This implementation adheres to the version 1.0.0 of the specification.
 *
 * @module conventional
 */

import { assertExists } from "@std/assert";
import type { Commit } from "./git.ts";

/**
 * A {@link https://www.conventionalcommits.org Conventional Commit} returned
 * by {@linkcode conventional}.
 */
export interface ConventionalCommit extends Commit {
  /** Commit description. */
  description: string;
  /** Commit type. */
  type?: string;
  /** Scopes affected by the commit. */
  scopes: string[];
  /** Breaking change description. */
  breaking?: string;
  /** Footer lines. */
  footers: Record<string, string>;
}

/**
 * Creates a commit object with
 * {@link https://www.conventionalcommits.org Conventional Commit} details.
 *
 * @example Retrieve conventional commit details from a commit.
 * ```ts
 * import { tempRepository } from "@roka/git/testing";
 * import { conventional } from "@roka/git/conventional";
 * import { assertEquals, assertFalse } from "@std/assert";
 *
 * await using repo = await tempRepository();
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.index.add("file.txt");
 * await repo.commits.create("feat(cli): add new command");
 * const commit = conventional(await repo.commits.head());
 *
 * assertEquals(commit.type, "feat");
 * assertEquals(commit.scopes, ["cli"]);
 * assertFalse(commit.breaking);
 * ```
 *
 * @param commit The commit object to convert, retrieved with {@linkcode git}.
 * @returns The commit object with conventional commit details.
 */
export function conventional(commit: Commit): ConventionalCommit {
  const footers = extractFooters(commit);
  const footerBreaking = footers["BREAKING-CHANGE"];
  const match = commit.summary?.match(
    /^(?:\s*?(?<type>[a-zA-Z]+)(?:\((?<scopes>[^()]*)\s*?\))?(?<exclamation>!?):s*)?\s*?(?<description>[^\s].*)$/,
  );
  const { type, scopes, exclamation, description } = { ...match?.groups };
  assertExists(description, "Commit must have description");
  if (!type) return { ...commit, description, scopes: [], footers };
  const breaking = footerBreaking || (exclamation ? description : undefined);
  return {
    ...commit,
    description,
    type: type.toLowerCase(),
    scopes: (scopes?.split(",") ?? [])
      .map((scope) => scope.trim().toLowerCase())
      .filter((scope) => scope),
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
