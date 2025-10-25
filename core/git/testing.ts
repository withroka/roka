/**
 * This module provides utilities to create fake commits and repositories for
 * testing.
 *
 * ```ts
 * import { tempRepository, testCommit } from "@roka/git/testing";
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
 * const commit = testCommit({ summary: "feat(cli): add command" });
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
  /**
   * Create a bare repository.
   * @default {false}
   */
  bare?: boolean;
  /** Configuration for the repository. */
  config?: Config;
  /**
   * Automatically changes the current working directory to the
   * temporary repository directory and restores it when disposed.
   *
   * @default {false}
   */
  chdir?: boolean;
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
 * await repo.remotes.push();
 *
 * assertEquals(await remote.commits.head(), commit);
 * ```
 */
export async function tempRepository(
  options?: TempRepositoryOptions,
): Promise<Git & AsyncDisposable> {
  const { clone, bare = false } = options ?? {};
  const directory = await Deno.makeTempDir();
  const config = {
    user: { name: "A U Thor", email: "author@example.com" },
    commit: { gpgsign: false },
    tag: { gpgsign: false },
    ...options?.config,
  };
  const repo = git({ cwd: directory });
  if (clone) {
    const target = typeof clone === "string" ? clone : clone.path();
    await git().remotes.clone(target, { directory, bare, config });
  } else {
    await git({ cwd: directory, config }).init({ bare });
    await repo.config.set(config);
  }
  const cwd = options?.chdir ? Deno.cwd() : undefined;
  if (options?.chdir) Deno.chdir(directory);
  return Object.assign(repo, {
    async [Symbol.asyncDispose]() {
      if (cwd) Deno.chdir(cwd);
      await Deno.remove(directory, { recursive: true });
    },
  });
}
