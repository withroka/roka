/**
 * This module provides utilities to create fake commits and repositories for
 * testing.
 *
 * ```ts
 * import { tempRepository, testCommit } from "@roka/git/testing";
 *
 * await using repo = await tempRepository();
 * const commit = testCommit({ subject: "feat(cli): add command" });
 * await repo.commit.create({
 *   subject: commit.subject,
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
 * @example Create a commit with a subject.
 * ```ts
 * import { testCommit } from "@roka/git/testing";
 * import { assertEquals } from "@std/assert";
 *
 * const commit = testCommit({ subject: "feat(cli): add command" });
 * assertEquals(commit.subject, "feat(cli): add command");
 * ```
 */
export function testCommit(data?: Partial<Commit>): Commit {
  return {
    hash: "hash",
    short: "short",
    author: { name: "author-name", email: "author-email" },
    committer: { name: "committer-name", email: "committer-email" },
    subject: "subject",
    body: "body",
    trailers: { "co-authored-by:": "coauthor-name <coauthor-email>" },
    ...data,
  };
}

/** Options for the {@linkcode tempRepository} function. */
export interface TempRepositoryOptions {
  /** Clone the given repo instead of creating an empty one. */
  clone?: string | URL | Git;
  /**
   * Create a bare repository.
   * @default {false}
   */
  bare?: boolean;
  /**
   * Name of the initial branch.
   * @default {"main"}
   */
  branch?: string;
  /** Configuration for the repository. */
  config?: Config;
  /**
   * Automatically changes the current working directory to the
   * temporary repository directory and restores it when disposed.
   *
   * @default {false}
   */
  chdir?: boolean;
  /**
   * Name of the remote for the cloned repository.
   * @default {"origin"}
   */
  remote?: string;
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
 * const commit = await repo.commit.create({ subject: "feat: add feature" });
 * await repo.sync.push();
 *
 * assertEquals(await remote.commit.head(), commit);
 * ```
 */
export async function tempRepository(
  options?: TempRepositoryOptions,
): Promise<Git & AsyncDisposable> {
  const { clone, bare = false, branch = "main", remote = "origin" } = options ??
    {};
  const directory = await Deno.makeTempDir();
  const config = {
    "user.name": "A U Thor",
    "user.email": "author@example.com",
    "commit.gpgsign": false,
    "tag.gpgsign": false,
    ...options?.config,
  };
  const repo = clone
    ? await git().clone(
      clone instanceof URL
        ? clone
        : typeof clone === "string"
        ? clone
        : clone.path(),
      { directory, bare, config, remote },
    )
    : await git().init({ bare, branch, config, directory });
  const cwd = options?.chdir ? Deno.cwd() : undefined;
  if (options?.chdir) Deno.chdir(directory);
  return Object.assign(repo, {
    async [Symbol.asyncDispose]() {
      if (cwd) Deno.chdir(cwd);
      await Deno.remove(directory, { recursive: true });
    },
  });
}
