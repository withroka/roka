/**
 * Objects to write tests over git repositories.
 *
 * This module provides utilities to create fake commits and repositories for
 * testing.
 *
 * @example
 * ```ts
 * import { testCommit, tempRepo } from "@roka/git/testing";
 * import { assertEquals } from "@std/assert";
 * await using repo = await tempRepo();
 * const commit = testCommit({ summary: "feat(cli): add command" });
 * await repo.commit(commit.summary, {
 *    body: commit.body,
 *    author: commit.author,
 *    allowEmpty: true,
 * });
 * assertEquals((await repo.head()).author, commit.author);
 * ```
 *
 * @module
 */

import { type Commit, type Git, git } from "@roka/git";

/**
 * Creates a commit with fake data.
 *
 * @example
 * ```ts
 * import { testCommit } from "@roka/git/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const commit = testCommit({summary: "feat(cli): add command"});
 * assertEquals(commit.summary, "feat(cli): add command");
 * ```
 */
export function testCommit(commit?: Partial<Commit>): Commit {
  return {
    hash: "hash",
    short: "short",
    summary: "summary",
    body: "body",
    author: { name: "author-name", email: "author-email" },
    committer: { name: "committer-name", email: "committer-email" },
    ...commit,
  };
}

/** Options for {@linkcode tempRepo}. */
export interface TempRepoOptions {
  /** Clone given repo, instead of creating an emtpy one. */
  clone?: Git;
  /** Create a bare repository. */
  bare?: boolean;
}

/** Creates a temporary repository for testing.
 *
 * @example
 * ```ts
 * import { tempRepo } from "@roka/git/testing";
 * import { assertEquals } from "@std/assert";
 * await using remote = await tempRepo({ bare: true });
 * await using repo = await tempRepo({ clone: remote });
 *
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.add("file.txt");
 * const commit = await repo.commit("feat: add feature");
 * await repo.push();
 *
 * assertEquals(await remote.head(), commit);
 * ```
 */
export async function tempRepo(
  options?: TempRepoOptions,
): Promise<Git & AsyncDisposable> {
  const { clone, bare = false } = options ?? {};
  const cwd = await Deno.makeTempDir();
  const config = {
    user: { name: "A U Thor", email: "author@example.com" },
    commit: { gpgsign: false },
    tag: { gpgsign: false },
  };
  const repo = git({ cwd });
  if (clone) {
    await git({ cwd }).clone(clone.directory, { bare, config });
  } else {
    await repo.init({ bare });
    await repo.config(config);
  }
  return Object.assign(repo, {
    [Symbol.asyncDispose]: () => Deno.remove(cwd, { recursive: true }),
  });
}
