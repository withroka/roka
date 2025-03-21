/**
 * This module provides utilities to create fake commits and repositories for
 * testing.
 *
 * ```ts
 * import { testCommit, tempRepository } from "@roka/git/testing";
 *
 * await using repo = await tempRepository();
 * const commit = testCommit({ summary: "feat(cli): add command" });
 * await repo.commits.create(commit.summary, {
 *   author: commit.author,
 *   allowEmpty: true,
 * });
 * ```
 *
 * @module testing
 */

import { type Commit, type Config, type Git, git } from "./git.ts";

/**
 * Creates a commit with fake data.
 *
 * @example Create a commit with a summary.
 * ```ts
 * import { testCommit } from "@roka/git/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const commit = testCommit({summary: "feat(cli): add command"});
 * assertEquals(commit.summary, "feat(cli): add command");
 * ```
 */
export function testCommit(data?: Partial<Commit>): Commit {
  return {
    hash: "hash",
    short: "short",
    summary: "summary",
    body: "body",
    trailers: { "trailer": "value" },
    author: { name: "author-name", email: "author-email" },
    committer: { name: "committer-name", email: "committer-email" },
    ...data,
  };
}

/** Options for the {@linkcode tempRepository} function. */
export interface TempRepositoryOptions {
  /** Clone the given repo instead of creating an empty one. */
  clone?: string | Git;
  /** Create a bare repository. */
  bare?: boolean;
  /** Configuration for the repository. */
  config?: Config;
}

/**
 * Creates a temporary repository for testing.
 *
 * @example Create a temporary repository.
 * ```ts
 * import { tempRepository } from "@roka/git/testing";
 * import { assertEquals } from "@std/assert";
 *
 * await using remote = await tempRepository({ bare: true });
 * await using repo = await tempRepository({ clone: remote });
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.index.add("file.txt");
 * const commit = await repo.commits.create("feat: add feature");
 * await repo.commits.push();
 *
 * assertEquals(await remote.commits.head(), commit);
 * ```
 */
export async function tempRepository(
  options?: TempRepositoryOptions,
): Promise<Git & AsyncDisposable> {
  const { clone, bare = false } = options ?? {};
  const cwd = await Deno.makeTempDir();
  const config = {
    user: { name: "A U Thor", email: "author@example.com" },
    commit: { gpgsign: false },
    tag: { gpgsign: false },
    ...options?.config,
  };
  const repo = git({ cwd });
  if (clone) {
    const target = typeof clone === "string" ? clone : clone.path();
    await git({ cwd }).clone(target, { bare, config });
  } else {
    await git({ cwd, config }).init({ bare });
    await repo.config.set(config);
  }
  return Object.assign(repo, {
    [Symbol.asyncDispose]: () => Deno.remove(cwd, { recursive: true }),
  });
}
