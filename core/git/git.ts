/**
 * A library for interacting with local Git repositories.
 *
 * This package provides mostly complete functionality to run
 * {@link https://git-scm.com git} commands.
 *
 * The main module provides the {@linkcode git} function that exposes git
 * operations, as well as the {@linkcode Commit}, {@linkcode Tag}, and similar
 * git objects.
 *
 * All options adhere to default Git configurations and behaviors. If an option
 * is explicitly set, it will override any corresponding Git configuration.
 * Similarly, an omitted option can potentially be configured externally, even
 * if a default is specified in the documentation.
 *
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const repo = git();
 *   const branch = await repo.branch.current();
 *   if (branch?.name === "main") {
 *     await repo.branch.switch("feature", { create: true });
 *   }
 *   await Deno.writeTextFile(repo.path("file.txt"), "content");
 *   await repo.index.add("file.txt");
 *   await repo.commit.create({ subject: "Initial commit" });
 *   await repo.tag.create("v1.0.0");
 * });
 * ```
 *
 * ## Submodules
 *
 *  -  {@link [conventional]}: Work with
 *     {@link https://www.conventionalcommits.org Conventional Commits}.
 *  -  {@link [testing]}: Write tests using temporary git repositories.
 *
 * @todo Add `git().worktree.*`
 * @todo Add `git().cherrypick.*`
 * @todo Add `git().revert.*`
 * @todo Add `git().merge.*`
 * @todo Add `git().rebase.*`
 * @todo Add `git().submodule.*`
 * @todo Add `git().replace.*` (grafts)
 * @todo Add `git().hook.*`
 * @todo Add `git().reflog.*`
 * @todo Add templates.
 * @todo Expose dates.
 * @todo Verify signatures.
 *
 * @module git
 */

import { maybe } from "@roka/maybe";
import {
  assertEquals,
  assertExists,
  assertFalse,
  assertGreater,
} from "@std/assert";
import { mapEntries, mapValues, slidingWindows } from "@std/collections";
import { join, normalize, resolve, toFileUrl } from "@std/path";

/**
 * An error thrown by the `git` package.
 *
 * If the error is from running a `git` command, the message will include the
 * command, the exit code, and the command output.
 */
export class GitError extends Error {
  /** Construct GitError. */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GitError";
  }
}

/** A local repository returned by the {@linkcode git} function. */
export interface Git {
  /** Returns the repository directory, with optional relative children. */
  path(...parts: string[]): string;
  /** Initializes a new git repository, or reinitialize an existing one. */
  init(options?: InitOptions): Promise<Git>;
  /** Clones a remote repository. */
  clone(remote: string | URL | Remote, options?: CloneOptions): Promise<Git>;
  /** Config operations. */
  config: ConfigOperations;
  /** Index (staged area) operations. */
  index: IndexOperations;
  /** Difference (diff) operations. */
  diff: DiffOperations;
  /** Ignore (exclusion) operations. */
  ignore: IgnoreOperations;
  /** Commit operations. */
  commit: CommitOperations;
  /** Branch operations. */
  branch: BranchOperations;
  /** Tag operations. */
  tag: TagOperations;
  /** Remote operations. */
  remote: RemoteOperations;
  /** Sync (fetch/pull/push) operations. */
  sync: SyncOperations;
  /** Administration and maintenance operations. */
  admin: AdminOperations;
}

/** Config operations from {@linkcode Git.config}. */
export interface ConfigOperations {
  /** Lists all git configuration values. */
  list(options?: ConfigOptions): Promise<Config>;
  /** Gets a git configuration value. */
  get<K extends ConfigKey>(
    key: K,
    options?: ConfigOptions,
  ): Promise<ConfigValue<K> | undefined>;
  /** Sets a git configuration value. */
  set<K extends ConfigKey>(
    key: K,
    value: ConfigValue<K>,
    options?: ConfigOptions,
  ): Promise<void>;
  /** Removes a git configuration value. */
  unset(key: ConfigKey, options?: ConfigOptions): Promise<void>;
}

/** Index operations from {@linkcode Git.index}. */
export interface IndexOperations {
  /** Returns the status of the index and the local working tree. */
  status(options?: IndexStatusOptions): Promise<Status>;
  /** Stages files for commit. */
  add(path: string | string[], options?: IndexAddOptions): Promise<void>;
  /** Move or rename a file, a directory, or a symlink. */
  move(
    source: string | string[],
    destination: string,
    options?: IndexMoveOptions,
  ): Promise<void>;
  /** Restores files in the working tree and index from a source. */
  restore(
    path: string | string[],
    options?: IndexRestoreOptions,
  ): Promise<void>;
  /** Removes files or directories from the working tree and index. */
  remove(path: string | string[], options?: IndexRemoveOptions): Promise<void>;
}

/** Difference operations from {@linkcode Git.diff}. */
export interface DiffOperations {
  /** Returns the list of changed file paths with their status. */
  status(options?: DiffOptions): Promise<TrackedPathStatus[]>;
  /** Returns the patch text for changes. */
  patch(options?: DiffPatchOptions): Promise<Patch[]>;
}

/** Ignore operations from {@linkcode Git.ignore}. */
export interface IgnoreOperations {
  /** Checks paths against gitignore list and returns the ignored patterns. */
  filter(
    path: string | string[],
    options?: IgnoreFilterOptions,
  ): Promise<string[]>;
  /** Checks paths against gitignore list and returns the unignored patterns. */
  omit(
    path: string | string[],
    options?: IgnoreFilterOptions,
  ): Promise<string[]>;
}

/** Commit operations from {@linkcode Git.commit}. */
export interface CommitOperations {
  /** Returns the history of commits in the repository. */
  log(options?: CommitLogOptions): Promise<Commit[]>;
  /**
   * Returns the commit at the tip of `HEAD`.
   * @throws {@linkcode GitError} If there are no commits.
   */
  head(): Promise<Commit>;
  /** Returns a specific commit by its reference. */
  get(ref: Commitish): Promise<Commit | undefined>;
  /** Creates a new commit in the repository. */
  create(options?: CommitCreateOptions): Promise<Commit>;
  /** Amends the last commit in the repository. */
  amend(options?: CommitCreateOptions): Promise<Commit>;
}

/** Branch operations from {@linkcode Git.branch}. */
export interface BranchOperations {
  /** List branches in the repository alphabetically. */
  list(options?: BranchListOptions): Promise<Branch[]>;
  /**
   * Returns the current branch name.
   * @throws {@linkcode GitError} If `HEAD` is detached.
   */
  current(): Promise<Branch>;
  /** Returns a branch. */
  get(
    name: string | Branch,
    options?: BranchGetOptions,
  ): Promise<Branch | undefined>;
  /** Creates a branch. */
  create(name: string, options?: BranchCreateOptions): Promise<Branch>;
  /** Switches to an existing or new branch. */
  switch(
    branch: string | Branch,
    options?: BranchSwitchOptions,
  ): Promise<Branch>;
  /** Switch to a commit detached from any branch. */
  detach(options?: BranchDetachOptions): Promise<void>;
  /** Resets the current branch head to a specified state. */
  reset(options?: BranchResetOptions): Promise<void>;
  /** Renames a branch. */
  move(
    branch: string | Branch,
    name: string,
    options?: BranchMoveOptions,
  ): Promise<Branch>;
  /** Copies a branch. */
  copy(
    branch: string | Branch,
    name: string,
    options?: BranchCopyOptions,
  ): Promise<Branch>;
  /** Sets the upstream branch for a given branch. */
  track(branch: string | Branch, upstream: string): Promise<Branch>;
  /** Removes the upstream branch for a given branch. */
  untrack(branch: string | Branch): Promise<Branch>;
  /** Deletes a branch. */
  delete(branch: string | Branch, options?: BranchDeleteOptions): Promise<void>;
}

/** Tag operations from {@linkcode Git.tag}. */
export interface TagOperations {
  /** Lists all tags in the repository. */
  list(options?: TagListOptions): Promise<Tag[]>;
  /** Retrieves a tag. */
  get(tag: string | Tag): Promise<Tag | undefined>;
  /** Creates a new tag in the repository. */
  create(name: string, options?: TagCreateOptions): Promise<Tag>;
  /** Deletes a tag. */
  delete(tag: string | Tag): Promise<void>;
}

/** Remote operations from {@linkcode Git.remote}. */
export interface RemoteOperations {
  /** Lists remotes in the repository. */
  list(): Promise<Remote[]>;
  /** Returns the current remote configured for current branch. */
  current(): Promise<Remote | undefined>;
  /** Returns a remote repository. */
  get(remote: string | Remote): Promise<Remote | undefined>;
  /**
   * Queries the HEAD branch name on a remote repository.
   * @throws {@linkcode GitError} If remote `HEAD` is detached.
   */
  head(remote: string | URL | Remote): Promise<string>;
  /** Adds a remote to the repository. */
  add(remote: string, url: string | URL): Promise<Remote>;
  /** Adds given remote to the repository. */
  add(remote: Remote): Promise<Remote>;
  /** Renames a remote in the repository. */
  rename(remote: string | Remote, name: string): Promise<Remote>;
  /** Updates a remote. */
  set(remote: Remote): Promise<Remote>;
  /** Updates a remote with a fetch/push URL. */
  set(remote: string, url: string | URL): Promise<Remote>;
  /** Prunes stale references to remote branches. */
  prune(remote: string | Remote | (string | Remote)[]): Promise<void>;
  /** Removes a remote from the repository. */
  remove(remote: string | Remote): Promise<void>;
}

/** Sync operations from {@linkcode Git.sync}. */
export interface SyncOperations {
  /** Fetches branches and tags from a remote. */
  fetch(options?: SyncFetchOptions): Promise<void>;
  /** Pulls branches and tags from a remote. */
  pull(options?: SyncPullOptions): Promise<void>;
  /** Pushes branches and tags to a remote. */
  push(options?: SyncPushOptions): Promise<void>;
  /** Fetches missing objects after a shallow clone or fetch. */
  unshallow(options?: SyncRemoteOptions): Promise<void>;
}

/** Administration operations from {@linkcode Git.admin}. */
export interface AdminOperations {
  /** Fetches missing objects in a partial clone. */
  backfill(options?: AdminBackfillOptions): Promise<void>;
}

/** Runtime schema for known git configuration. */
export const CONFIG_SCHEMA = {
  "author.email": ["string"],
  "author.name": ["string"],
  "branch.autoSetupMerge": ["boolean", "always", "inherit", "simple"],
  "branch.sort": ["string"],
  "clone.defaultRemoteName": ["string"],
  "clone.rejectShallow": ["boolean"],
  "color.branch": ["boolean", "auto", "always", "never"],
  "color.diff": ["boolean", "auto", "always", "never"],
  "color.status": ["boolean", "auto", "always", "never"],
  "color.ui": ["boolean", "auto", "always", "never"],
  "commit.gpgSign": ["boolean"],
  "commit.status": ["boolean"],
  "commit.verbose": ["boolean"],
  "committer.email": ["string"],
  "committer.name": ["string"],
  "core.attributesFile": ["string"],
  "core.autocrlf": ["boolean", "input"],
  "core.bare": ["boolean"],
  "core.commitGraph": ["boolean"],
  "core.compression": ["number"],
  "core.editor": ["string"],
  "core.eol": ["lf", "crlf", "native"],
  "core.excludesFile": ["string"],
  "core.fileMode": ["boolean"],
  "core.fsmonitor": ["boolean", "string"],
  "core.hooksPath": ["string"],
  "core.ignoreCase": ["boolean"],
  "core.logAllRefUpdates": ["boolean"],
  "core.looseCompression": ["number"],
  "core.multiPackIndex": ["boolean"],
  "core.pager": ["string"],
  "core.precomposeUnicode": ["boolean"],
  "core.protectHFS": ["boolean"],
  "core.protectNTFS": ["boolean"],
  "core.quotePath": ["boolean"],
  "core.repositoryFormatVersion": ["number"],
  "core.safecrlf": ["boolean"],
  "core.sparseCheckout": ["boolean"],
  "core.sparseCheckoutCone": ["boolean"],
  "core.symlinks": ["boolean"],
  "core.untrackedCache": ["boolean", "keep"],
  "core.whitespace": ["string"],
  "core.worktree": ["string"],
  "credential.helper": ["string"],
  "credential.username": ["string"],
  "diff.algorithm": ["default", "myers", "minimal", "patience", "histogram"],
  "diff.context": ["number"],
  "diff.dirstat": ["string"],
  "diff.dstPrefix": ["string"],
  "diff.external": ["string"],
  "diff.interHunkContext": ["number"],
  "diff.mnemonicPrefix": ["boolean"],
  "diff.noPrefix": ["string"],
  "diff.renames": ["boolean", "copies", "copy"],
  "diff.srcPrefix": ["string"],
  "fetch.all": ["boolean"],
  "fetch.parallel": ["number"],
  "fetch.prune": ["boolean"],
  "fetch.pruneTags": ["boolean"],
  "format.pretty": ["string"],
  "gc.auto": ["number"],
  "gc.autoDetach": ["boolean"],
  "gc.autoPackLimit": ["number"],
  "gpg.format": ["openpgp", "x509", "ssh"],
  "gpg.program": ["string"],
  "help.autoCorrect": ["boolean", "number"],
  "http.followRedirects": ["boolean", "initial"],
  "http.proxy": ["string"],
  "http.proxyAuthMethod": ["anyauth", "basic", "digest", "ntlm", "negotiate"],
  "http.userAgent": ["string"],
  "i18n.commitEncoding": ["string"],
  "i18n.logOutputEncoding": ["string"],
  "index.sparse": ["boolean"],
  "init.defaultBranch": ["string"],
  "init.defaultObjectFormat": ["sha1", "sha256"],
  "init.defaultRefFormat": ["files", "reftable"],
  "log.abbrevCommit": ["boolean"],
  "log.decorate": ["short", "full", "auto"],
  "log.follow": ["boolean"],
  "log.mailmap": ["boolean"],
  "log.showRoot": ["boolean"],
  "log.showSignature": ["boolean"],
  "maintenance.auto": ["boolean"],
  "maintenance.autoDetach": ["boolean"],
  "maintenance.strategy": ["none", "gc", "geometric", "incremental"],
  "merge.conflictStyle": ["merge", "diff3", "zdiff3"],
  "merge.ff": ["boolean", "only"],
  "merge.renames": ["boolean"],
  "pack.compression": ["number"],
  "pull.ff": ["boolean", "only"],
  "pull.rebase": ["boolean", "merges", "interactive"],
  "push.autoSetupRemote": ["boolean"],
  "push.default": ["nothing", "current", "upstream", "simple", "matching"],
  "push.followTags": ["boolean"],
  "push.useForceIfIncludes": ["boolean"],
  "rebase.autoSquash": ["boolean"],
  "rebase.autoStash": ["boolean"],
  "receive.denyCurrentBranch": ["ignore", "warn", "refuse", "updateInstead"],
  "receive.denyNonFastForwards": ["boolean"],
  "receive.fsckObjects": ["boolean"],
  "remote.pushDefault": ["string"],
  "rerere.autoUpdate": ["boolean"],
  "rerere.enabled": ["boolean"],
  "safe.bareRepository": ["all", "explicit"],
  "safe.directory": ["array"],
  "status.displayCommentPrefix": ["boolean"],
  "status.relativePaths": ["boolean"],
  "status.renames": ["boolean", "copies", "copy"],
  "status.short": ["boolean"],
  "status.showUntrackedFiles": ["no", "normal", "all"],
  "submodule.recurse": ["boolean"],
  "tag.gpgSign": ["boolean"],
  "tag.sort": ["string"],
  "trailer.separators": ["string"],
  "transfer.fsckObjects": ["boolean"],
  "user.email": ["string"],
  "user.name": ["string"],
  "user.signingKey": ["string"],
  "user.useConfigOnly": ["boolean"],
  "versionsort.suffix": ["array"],
} as const;

/** Runtime schema for known branch configuration. */
export const BRANCH_CONFIG_SCHEMA = {
  "description": ["string"],
  "merge": ["string"],
  "pushRemote": ["string"],
  "rebase": ["boolean", "merges", "interactive"],
  "remote": ["string"],
} as const;

/** Runtime schema for known remote configuration. */
export const REMOTE_CONFIG_SCHEMA = {
  "fetch": ["string"],
  "mirror": ["boolean"],
  "proxy": ["string"],
  "proxyAuthMethod": ["anyauth", "basic", "digest", "ntlm", "negotiate"],
  "prune": ["boolean"],
  "pruneTags": ["boolean"],
  "push": ["string"],
  "pushurl": ["string"],
  "skipFetchAll": ["boolean"],
  "tagopt": ["--tags", "--no-tags"],
  "url": ["string"],
} as const;

/** Configuration for a git repository. */
export type Config = {
  [K in ConfigKey]?: ConfigValue<K>;
};

/** A known configuration key or string. */
export type ConfigKey =
  | keyof typeof CONFIG_SCHEMA
  | `branch.${string}.${keyof typeof BRANCH_CONFIG_SCHEMA}`
  | `remote.${string}.${keyof typeof REMOTE_CONFIG_SCHEMA}`
  // deno-lint-ignore ban-types
  | (string & {});

/** The value type for a given configuration key. */
export type ConfigValue<K extends ConfigKey> = Lowercase<K> extends
  keyof ConfigSchemaLowercase<typeof CONFIG_SCHEMA> ? ConfigSchemaType<
    (ConfigSchemaLowercase<typeof CONFIG_SCHEMA>)[Lowercase<K>]
  >
  : Lowercase<K> extends `branch.${string}.${infer SubKey}`
    ? SubKey extends keyof ConfigSchemaLowercase<typeof BRANCH_CONFIG_SCHEMA>
      ? ConfigSchemaType<
        (ConfigSchemaLowercase<typeof BRANCH_CONFIG_SCHEMA>)[SubKey]
      >
    : UnknownConfigValue
  : Lowercase<K> extends `remote.${string}.${infer SubKey}`
    ? SubKey extends keyof ConfigSchemaLowercase<typeof REMOTE_CONFIG_SCHEMA>
      ? ConfigSchemaType<
        (ConfigSchemaLowercase<typeof REMOTE_CONFIG_SCHEMA>)[SubKey]
      >
    : UnknownConfigValue
  : UnknownConfigValue;

/** Extracted type from config schema. */
export type ConfigSchemaType<T> = T extends readonly (infer U)[]
  ? U extends "array" ? string[]
  : U extends "string" ? string
  : U extends "number" ? number
  : U extends "boolean" ? boolean
  : U extends string ? NonNullable<U>
  : never
  : never;

/** Config schema type with lowercase keys. */
export type ConfigSchemaLowercase<T> = {
  [K in keyof T as K extends string ? Lowercase<K> : K]: T[K];
};

/**
 * A value of unknown configuration key.
 *
 * If a schema for the key does not exist, any of these types are accepted but
 * only string values are returned. For an unknown variable with multiple
 * values set, only the last value is returned.
 */
export type UnknownConfigValue = boolean | number | string | string[];

/** An author or committer on a git repository. */
export interface User {
  /** Name of the user. */
  name: string;
  /** Email of the user. */
  email: string;
}

/** A remote repository configured in a git repository. */
export interface Remote {
  /** Remote name. */
  name: string;
  /** Remote fetch URL. */
  fetch: URL;
  /** Fetch filter, if the repository is a partial clone. */
  filter?: string;
  /** Remote push URLs. */
  push: URL[];
}

/** A branch in a git repository. */
export interface Branch {
  /** Short name of the branch. */
  name: string;
  /**
   * Commit at the tip of the branch, if branch has any commits.
   *
   * This can be unset if the branch is unborn.
   */
  commit?: Commit;
  /** Upstream configuration for the branch, if set. */
  fetch?: {
    /** Name of the fetch branch in remote repository. */
    name: string;
    /** Remote of the upstream fetch branch. */
    remote: Remote;
    /**
     * Remote tracking fetch branch.
     *
     * This can be unset if the upstream branch is deleted in the remote.
     */
    branch?: Branch;
  };
  /** Push configuration for the branch, if set. */
  push?: {
    /** Name of the push branch in remote repository. */
    name: string;
    /** Remote of the push branch. */
    remote: Remote;
    /**
     * Remote tracking push branch.
     *
     * This can be unset if the upstream branch is deleted in the remote.
     */
    branch?: Branch;
  };
}

/** Status of files in the index and the working tree. */
export interface Status {
  /** Files that are staged for commit (the index). */
  staged: TrackedPathStatus[];
  /** Files that are not staged for commit (the working tree). */
  unstaged: TrackedPathStatus[];
  /** Files that are not tracked by git. */
  untracked: UntrackedPathStatus[];
  /** Files that are ignored by git. */
  ignored: UntrackedPathStatus[];
}

/** Status of a file in the index and the working tree. */
export type TrackedPathStatus = UpdatedPathStatus | RenamedPathStatus;

/** Status of a non-renamed file in the index and the working tree. */
export interface UpdatedPathStatus {
  /** Path to the file. */
  path: string;
  /** Status of the file. */
  status: "modified" | "type-changed" | "added" | "deleted";
}

/** Status of a renamed file in the index and the working tree. */
export interface RenamedPathStatus {
  /** Path to the file. */
  path: string;
  /** Status of the file. */
  status: "renamed" | "copied";
  /** Previous file path. */
  from: string;
}

/**
 * Status of an untracked or ignored file in the index and the working tree.
 */
export interface UntrackedPathStatus {
  /** Path to the file. */
  path: string;
}

/**
 * A patch for a file returned by the {@linkcode DiffOperations.patch} function.
 */
export interface Patch {
  /** Path to the file. */
  path: string;
  /** Status of the file. */
  status: TrackedPathStatus["status"];
  /** File mode, if provided. */
  mode?: {
    /** Old file mode, if changed or deleted. */
    old?: number;
    /** Current or new file mode. */
    new?: number;
  };
  /** Previous file path, for renamed or copied files. */
  from?: {
    /** Previous file path. */
    path: string;
    /** Similarity value (0-1) for the rename or copy. */
    similarity: number;
  };
  /** List of diff hunks in the patch. */
  hunks?: Hunk[];
}

/**
 * A single hunk in a patch returned by the {@linkcode DiffOperations.patch}
 * function.
 */
export interface Hunk {
  /** Line location of the hunk. */
  line: {
    /** Line number in the original file where the hunk starts. */
    old: number;
    /** Line number in the new file where the hunk starts. */
    new: number;
  };
  /** Lines in the hunk. */
  lines: {
    /** Type of line in the hunk. */
    type: "context" | "added" | "deleted" | "info";
    /** Content of the line, excluding the leading indicator. */
    content: string;
  }[];
}

/** A single commit in a git repository. */
export interface Commit {
  /** Full hash of commit. */
  hash: string;
  /** Short hash of commit. */
  short: string;
  /** Parent commit, if any. */
  parent?: Pick<Commit, "hash" | "short">;
  /** Author, who wrote the code. */
  author: User;
  /** Committer, who created the commit. */
  committer: User;
  /** Commit subject, the first line of the commit message. */
  subject: string;
  /** Commit body, excluding the first line and trailers from the message. */
  body?: string;
  /** Trailer values at the end of the commit message. */
  trailers?: Record<string, string>;
}

/** A tag in a git repository. */
export interface Tag {
  /** Tag name. */
  name: string;
  /** Commit that is recursively pointed to by the tag. */
  commit: Commit;
  /** Tag subject, the first line of the tag message. */
  subject?: string;
  /** Tag body, excluding the first line and trailers from the message. */
  body?: string;
  /** Trailer values at the end of the tag message. */
  trailers?: Record<string, string>;
  /** Tagger, who created the tag. */
  tagger?: User;
}

/** A reference that recursively points to a commit object. */
export type Commitish = Commit | Branch | Tag | string;

/**
 * A pattern to search for in diffs.
 *
 * The pickaxe identifies diffs where the number of occurrences of text
 * matching a given pattern changes. This enables the discovery of commits
 * where text is either added or removed.
 *
 * If {@linkcode Pickaxe.updated updated} is set, the pickaxe also matches all
 * modifications, even if the number of occurrences remains unchanged.
 */
export interface Pickaxe {
  /** Extended regular expression pattern to search in changes. */
  pattern: string;
  /**
   * Match any diff line containing the pattern.
   *
   * - `false`: only find additions or deletions (`-S` behavior)
   * - `true`: also find modifications (`-G` behavior)
   *
   * @default {false}
   */
  updated?: boolean;
}

/** Options for the {@linkcode git} function. */
export interface GitOptions {
  /**
   * Change the working directory for git commands.
   * @default {"."}
   */
  cwd?: string;
  /**
   * Configuration options for each executed git command.
   *
   * These will override repository or global configurations.
   */
  config?: Config;
}

/**
 * Options common to the {@linkcode BranchOperations.list} and
 * {@linkcode TagOperations.list} functions for ref filtering.
 */
export interface RefListOptions {
  /** Ref selection pattern. The default is all relevant refs. */
  name?: string;
  /** Only refs that contain the specific commit. */
  contains?: Commitish;
  /** Only refs that do not contain the specific commit. */
  noContains?: Commitish;
  /** Only refs whose tips are reachable from the commit. */
  merged?: Commitish;
  /** Only refs whose tips are not reachable from the commit. */
  noMerged?: Commitish;
  /** Only refs that point to the given commit. */
  pointsAt?: Commitish;
}

/**
 * Options common to {@linkcode CommitOperations.create} and
 * {@linkcode TagOperations.create} for setting message bodies.
 */
export interface MessageOptions {
  /**
   * Message subject.
   *
   * When amending a commit with a subject, the
   * {@linkcode MessageOptions.body body}, and
   * {@linkcode MessageOptions.trailers trailers} of the commit are cleared,
   * unless explicitly set during the amend call.
   */
  subject?: string;
  /**
   * Message body.
   *
   * When amending a commit with a body, the
   * {@linkcode MessageOptions.trailers trailers} of the commit are cleared,
   * unless explicitly set during the amend call.
   */
  body?: string;
  /** Message trailers. */
  trailers?: Record<string, string>;
}

/**
 * Options common to {@linkcode CommitOperations.create} and
 * {@linkcode TagOperations.create} for GPG signing.
 */
export interface SignOptions {
  /**
   * Sign the commit with GPG.
   *
   * If `true` or a string, the object is signed with the default or given GPG
   * key.
   *
   * If `false`, the commit is not signed.
   */
  sign?: boolean | string;
}

/**
 * Options for specifying a revision range over commit history.
 */
export interface RevisionRangeOptions {
  /**
   * Match objects that are descendants of this revision.
   *
   * The pointed commit itself is excluded from the range.
   */
  from?: Commitish;
  /**
   * Match objects that are ancestors of this revision.
   *
   * The pointed commit itself is included in the range.
   */
  to?: Commitish;
  /**
   * Match objects that are reachable from either end, but not from both.
   *
   * Ignored if either {@linkcode RevisionRangeOptions.from} or
   * {@linkcode RevisionRangeOptions.to} is not set.
   *
   * @default {false}
   */
  symmetric?: boolean;
}

/**
 * Options common to the {@linkcode Git.init} and {@linkcode Git.clone}
 * functions.
 */
export interface RepositoryOptions {
  /**
   * The name of a new directory to initialize into.
   *
   * If not set, initializes in the current directory.
   */
  directory?: string;
  /**
   * Create a bare repository.
   * @default {false}
   */
  bare?: boolean;
  /**
   * Configuration for the initialized repository.
   *
   * This configuration will apply to initialization operation itself, and it
   * will persist in the local repository afterwards.
   */
  config?: Config;
  /** Create the git directory at given path. */
  separateGitDir?: string;
}

/** Options for the {@linkcode Git.init} function. */
export interface InitOptions extends RepositoryOptions {
  /**
   * Initial branch name.
   *
   * Default is `main` in latest versions of `git`.
   */
  branch?: string;
  /**
   * Specify hashing algorithm for the repository.
   * @default {"sha1"}
   */
  objectFormat?: "sha1" | "sha256";
  /**
   * Specify ref storage format.
   * @default {"files"}
   */
  refFormat?: "files" | "reftable";
  /**
   * Specify user sharing for the repository.
   *
   * `false`: use permissions reported by `umask`
   * `true`: make repository writable by group
   * `"all"`: make repository writable by group, and readable by others
   * mode: set repository mode to given number mode
   *
   * @default {false}
   */
  shared?: boolean | "all" | number;
}

/** Options for the {@linkcode Git.clone} function. */
export interface CloneOptions
  extends RepositoryOptions, SyncShallowOptions, SyncFilterOptions {
  /**
   * The name of a new directory to clone into.
   *
   * If not set, the directory name is derived from the repository name.
   *
   * Cloning into an existing directory is only allowed if the directory is
   * empty.
   */
  directory?: string;
  /**
   * Name of the initial branch to checkout after cloning.
   *
   * If set to `null`, a checkout is not performed.
   */
  branch?: string | null;
  /**
   * Set configuration for the initialized repository.
   *
   * This configuration will apply to initialization and fetch, and it will
   * persist in the local repository afterwards.
   */
  config?: Config;
  /**
   * Control local repository optimizations.
   *
   * - `false`: disable optimizations, use remote transport
   * - `true`: use local transport with hardlinks (default)
   * - `"copy"`: copy objects without hardlinks
   * - `"shared"`: share objects with source repository
   * - `{ reference }`: use given repository as an alternate object store
   * - `{ reference, ifAble }`: only use reference if able to do so
   * - `{ reference, dissociate }`: use reference during clone only
   *
   * @default {true}
   */
  local?: boolean | "copy" | "shared" | {
    reference: string;
    ifAble?: boolean;
    dissociate?: boolean;
  };
  /**
   * Name of the remote for the cloned repository.
   * @default {"origin"}
   */
  remote?: string;
  /**
   * Clone only the tip of a single branch.
   *
   * The cloned branch is either remote `HEAD` or
   * {@linkcode InitOptions.branch}.
   */
  singleBranch?: boolean;
  /**
   * Fetch tags during clone.
   *
   * If set to `false`, the repository is configured to not fetch tags.
   *
   * @default {true}
   */
  tags?: boolean;
}

/**
 * Options common for all config operations, such as
 * {@linkcode ConfigOperations.get} or {@linkcode ConfigOperations.set}.
 */
export interface ConfigOptions {
  /**
   * Configuration to read from or write to.
   *
   * - `"system"`: System-level configuration
   * - `"global"`: User-level configuration
   * - `"local"`: Repository-level configuration
   * - `"worktree"`: Worktree-level configuration
   * - `{ file: string }`: Custom configuration file
   *
   * When reading, the values are read from the `"system"`, `"global"` and
   * `"local"` configuration by default. When writing, the new value is written
   * to the `"local"` configuration file by default.
   */
  target?: "system" | "global" | "local" | "worktree" | { file: string };
}

/** Options for the {@linkcode IndexOperations.status} function. */
export interface IndexStatusOptions {
  /**
   * Limit the status to the given pathspecs.
   *
   * If not set, all files are included.
   */
  path?: string | string[];
  /**
   * Control the status output for ignored files.
   *
   * - `true`: include ignored files and directories
   * - `false`: exclude ignored files and directories (default)
   *
   * Files under ignored directories are included only if
   * {@linkcode IndexStatusOptions.untracked untracked} is set to `"all"`.
   *
   * @default {false}
   */
  ignored?: boolean;
  /**
   * Control the status output for renamed files.
   *
   * - `true`: enable rename detection, and list renamed files as such (default)
   * - `false`: disable rename detection, and list files as added and deleted
   *
   * @default {true}
   */
  renames?: boolean;
  /**
   * Control the status output for untracked files.
   *
   * - `false`: exclude untracked files
   * - `true`: include untracked directories, but not their files (default)
   * - `"all"`: include all untracked files
   *
   * @default {true}
   */
  untracked?: boolean | "all";
}

/** Options for the {@linkcode IndexOperations.add} function. */
export interface IndexAddOptions {
  /**
   * Override the executable bit of the file.
   *
   * If set, the file mode in the file system is ignored, and the executable
   * bit is set to the given value.
   */
  executable?: boolean;
  /**
   * Add files to the index, even if they are ignored.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode IndexOperations.move} function. */
export interface IndexMoveOptions {
  /**
   * Move files, even if the destination file already exists.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode IndexOperations.restore} function. */
export interface IndexRestoreOptions {
  /**
   * Source commit to restore from.
   *
   * If not specified, the contents are restored from `HEAD`.
   *
   * @default {"HEAD"}
   */
  source?: Commitish;
  /**
   * Location to restore files in.
   *
   * @default {"worktree"}
   */
  location?: "index" | "worktree" | "both";
}

/** Options for the {@linkcode IndexOperations.remove} function. */
export interface IndexRemoveOptions {
  /**
   * Remove files, even if they have local modifications.
   * @default {false}
   */
  force?: boolean;
}

/**
 * Options for the {@linkcode DiffOperations.status} and
 * {@linkcode DiffOperations.patch} functions.
 */
export interface DiffOptions extends RevisionRangeOptions {
  /**
   * Target commit to diff against.
   *
   * If set to `HEAD`, diffs the working tree or index against the last commit.
   */
  target?: Commitish;
  /**
   * Limit the diff to the given pathspecs.
   *
   * If directories are given, all files under those directories are included.
   *
   * If not set, all files are included.
   */
  path?: string | string[];
  /**
   * Control the diff output for copied files.
   *
   * - `true`: enable copy detection, and list copied files as such
   * - `false`: disable copy detection, and list copied files as added (default)
   *
   * If copy detection is enabled at the configuration level, this option has
   * no effect.
   *
   * @default {false}
   */
  copies?: boolean;
  /** Filters for files where the given pattern is added or deleted. */
  pickaxe?: string | Pickaxe;
  /**
   * Control the diff output for renamed files.
   *
   * - `true`: enable rename detection, and list renamed files as such (default)
   * - `false`: disable rename detection, and list files as added and deleted
   *
   * @default {true}
   */
  renames?: boolean;
  /**
   * Diff staged changes, instead of changes in the working tree.
   *
   * @default {false}
   */
  staged?: boolean;
}

/** Options for the {@linkcode DiffOperations.patch} function. */
export interface DiffPatchOptions extends DiffOptions {
  /**
   * Diff algorithm to use.
   * @default {"myers"}
   */
  algorithm?: "myers" | "minimal" | "patience" | "histogram";
  /**
   * Number of context lines.
   * @default {3}
   */
  unified?: number;
}

/**
 * Options for the {@linkcode IgnoreOperations.filter} and
 * {@linkcode IgnoreOperations.omit} functions.
 */
export interface IgnoreFilterOptions {
  /**
   * Look in the index when undertaking the checks.
   * @default {true}
   */
  index?: boolean;
}

/** Options for the {@linkcode CommitOperations.log} function. */
export interface CommitLogOptions extends RevisionRangeOptions {
  /** Only commits by an author. */
  author?: User;
  /** Only commits by a committer. */
  committer?: User;
  /** Only commits that modified any of the given pathspecs. */
  path?: string | string[];
  /** Maximum number of commits to return. */
  maxCount?: number;
  /** Filters for commits where the given pattern is added or deleted. */
  pickaxe?: string | Pickaxe;
  /** Number of commits to skip. */
  skip?: number;
}

/**
 * Options for the {@linkcode CommitOperations.create} function.
 */
export interface CommitCreateOptions extends MessageOptions, SignOptions {
  /**
   * Automatically stage modified or deleted files known to git.
   * @default {false}
   */
  all?: boolean;
  /**
   * Allow empty commits.
   * @default {false}
   */
  allowEmpty?: boolean;
  /**
   * Allow empty messages.
   * @default {false}
   */
  allowEmptyMessage?: boolean;
  /** Author who wrote the code. */
  author?: User | undefined;
  /**
   * Commit the contents of the listed file or files instead of the staged
   * changes on index.
   */
  path?: string | string[];
}

/** Options for the {@linkcode BranchOperations.list} function. */
export interface BranchListOptions extends RefListOptions {
  /**
   * Type of branches to list.
   * @default {"local"}
   */
  type?: "local" | "remote" | "all";
}

/** Options for the {@linkcode BranchOperations.get} function. */
export interface BranchGetOptions {
  /**
   * Remote of the branch, to look up a remote branch.
   *
   * If not set, a remote branch can still be looked up by providing the
   * remote name as part of the branch name (e.g., `origin/main`). However,
   * setting this option allows looking up remote branches without the remote
   * name in the branch name.
   *
   * This option becomes necessary in name collision cases. For example, if
   * there is both a `refs/heads/origin/main` and a `refs/remotes/origin/main`,
   * a lookup for `origin/main` will return the local branch. A lookup for
   * `main` with this option set to `origin` will return the remote branch
   * instead.
   */
  remote?: string | Remote;
}

/**
 * Options for the {@linkcode BranchOperations.create} function.
 */
export interface BranchCreateOptions extends BranchCreateTrackOptions {
  /**
   * Reset branch to {@linkcode BranchCreateOptions.target target} even if it
   * already exists.
   *
   * @default {false}
   */
  force?: boolean;
  /**
   * Target commit or branch to create the new branch from.
   * @default {"HEAD"}
   */
  target?: Commitish;
}

/**
 * Options common to the {@linkcode BranchOperations.create} and
 * {@linkcode BranchOperations.switch} functions for upstream tracking setup.
 */
export interface BranchCreateTrackOptions {
  /**
   * Setup upstream configuration for a newly created branch.
   *
   * The tracking configuration depends on the value of the target of the
   * created branch.
   *
   * - `true`: set the upstream tracking to creation target
   * - `"inherit"`: copy the upstream configuration from creation target
   * - `false`: no upstream is set
   *
   * The default behavior is to enable upstream tracking only when the target
   * is a remote branch.
   */
  track?: boolean | "inherit";
}

/** Options for the {@linkcode BranchOperations.switch} function. */
export interface BranchSwitchOptions extends BranchCreateTrackOptions {
  /**
   * Create a new branch at given target, `"HEAD"` if set to `true`.
   *
   * Incompatible with the {@linkcode BranchSwitchOptions.orphan orphan}
   * option.
   *
   * An error is thrown if the branch already exists, unless
   * {@linkcode BranchSwitchOptions.force force} is set to `true`.
   *
   * @default {false}
   */
  create?: boolean | Commitish;
  /**
   * Create an unborn branch.
   *
   * Incompatible with the {@linkcode BranchSwitchOptions.create create}
   * option.
   */
  orphan?: boolean;
  /**
   * Discard any local changes when switching branches.
   *
   * If creating a new branch with
   * {@linkcode BranchSwitchOptions.create create}, this will reset the new
   * branch even if it already exists.
   *
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode BranchOperations.detach} function. */
export interface BranchDetachOptions {
  /**
   * Target commit to detach `HEAD` at.
   * @default {"HEAD"}
   */
  target?: Commitish;
}

/** Options for the {@linkcode BranchOperations.reset} function. */
export interface BranchResetOptions {
  /**
   * Reset mode.
   *
   * - `"soft"`: only move HEAD, keep index and working tree
   * - `"mixed"`: reset index, keep working tree (default)
   * - `"hard"`: reset index and working tree, discard all changes
   * - `"merge"`: reset but keep non-conflicting changes, abort if unsafe
   * - `"keep"`: reset but abort if any modified file differs between commits
   *
   * If set to `"merge"` or `"keep"`, reset may be aborted to avoid losing
   * local changes. Other modes will always succeed.
   *
   * @default {"mixed"}
   */
  mode?: "soft" | "mixed" | "hard" | "merge" | "keep";
  /**
   * Target commit to move `HEAD` to.
   * @default {"HEAD"}
   */
  target?: Commitish;
}

/** Options for the {@linkcode BranchOperations.move} function. */
export interface BranchMoveOptions {
  /**
   * Force rename the branch.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode BranchOperations.copy} function. */
export interface BranchCopyOptions {
  /**
   * Force copy the branch.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode BranchOperations.delete} function. */
export interface BranchDeleteOptions {
  /**
   * Force delete the branch.
   * @default {false}
   */
  force?: boolean;
  /**
   * Type of branch to delete.
   * @default {"local"}
   */
  type?: "local" | "remote";
}

/** Options for the {@linkcode TagOperations.list} function. */
export interface TagListOptions extends RefListOptions {
  /**
   * Sort option.
   *
   * Setting to `version` uses {@link https://semver.org semantic version}
   * order, returning the latest versions first.
   *
   * By default, pre-release versions are sorted lexically, and they are
   * considered newer than the release versions. To change this behavior, set
   * the {@linkcode Config.versionsort.suffix versionsort.suffix} config
   * option to the pre-release suffixes.
   *
   * ```ts
   * import { tempRepository } from "@roka/git/testing";
   * import { git } from "@roka/git";
   * import { assertEquals } from "@std/assert";
   *
   * const directory = await tempRepository();
   * const repo = git({
   *   cwd: directory.path(),
   *   config: { "versionsort.suffix": ["-pre", "-rc"] },
   * });
   *
   * await repo.commit.create({ subject: "subject", allowEmpty: true });
   * await repo.tag.create("v1.0.0");
   * await repo.tag.create("v2.0.0");
   * await repo.tag.create("v2.0.0-pre");
   * await repo.tag.create("v2.0.0-rc");
   * const tags = await repo.tag.list({ sort: "version" });
   *
   * assertEquals(tags.map((x) => x.name), [
   *   "v2.0.0",
   *   "v2.0.0-rc",
   *   "v2.0.0-pre",
   *   "v1.0.0",
   * ]);
   * ```
   */
  sort?: "version";
}

/** Options for the {@linkcode TagOperations.create} function. */
export interface TagCreateOptions extends MessageOptions, SignOptions {
  /**
   * Target reference (commit, branch, or tag) to tag.
   *
   * The target is peeled to result in a commit object to prevent creation of
   * nested tags. This behavior can be overridden by requesting a tag target
   * with the `name^{tag}` syntax.
   *
   * @default {"HEAD"}
   */
  target?: Commitish;
  /** Replace existing tags instead of failing. */
  force?: boolean;
}

/** Options for the {@linkcode RemoteOperations.add} function. */
export interface RemoteAddOptions {
  /** Fetch remote immediately after adding. */
  fetch?: boolean;
  /** Control fetching tags. */
  tags?: "none" | "all";
}

/**
 * Options common to operations that work with remotes (e.g.
 * {@linkcode SyncOperations.push}).
 */
export interface SyncRemoteOptions {
  /**
   * Remote repository to operate on.
   *
   * The default is the current branch remote, or `"origin"` if a remote is not
   * configured for the current branch.
   */
  remote?: string | URL | Remote;
}

/**
 * Options common to operations that use remote transport synchronization
 * (e.g. {@linkcode SyncOperations.push}).
 */
export interface SyncOptions {
  /** Either update all refs or don't update any.*/
  atomic?: boolean;
  /** Prune refs that no longer exist on the updated repository. */
  prune?: boolean;
  /**
   * Control fetching or pushing tags.
   *
   * - `"none"`: do not copy any tags (push default)
   * - `"follow"`: copy only tags that point to copied objects (fetch default)
   * - `"all"`: copy all tags
   *
   * When pushing, only annotated tags are copied when following.
   */
  tags?: "none" | "follow" | "all";
}

/**
 * Options common to operations that can setup upstream tracking with remotes
 * (e.g. {@linkcode SyncOperations.push}).
 */
export interface SyncTrackOptions {
  /**
   * Set upstream tracking for every branch successfully fetched or pushed.
   * @default {false}
   */
  track?: boolean;
}

/**
 * Options common to operations that can create partial repositories
 * (e.g. {@linkcode SyncOperations.pull}).
 */
export interface SyncShallowOptions {
  /**
   * Create a shallow fetch.
   *
   * If any of the shallow options are provided, shallow fetching is enabled,
   * rewriting the history to only include the specified commits.
   *
   * - `{ depth }`: limit to the number of commits from the tip of each branch
   * - `{ exclude }`: exclude commits reachable from specified branches or tags
   *
   * Only one shallow option can be set at a time.
   */
  shallow?:
    | { depth: number; exclude?: never }
    | { exclude: string[]; depth?: never };
}

/**
 * Options common to {@linkcode Git.clone} and {@linkcode SyncOperations.fetch}
 * for filtering fetched objects.
 */
export interface SyncFilterOptions {
  /**
   * Filter objects with given filter specification to create a partial clone.
   *
   * When cloning, this will result in a partial clone where some objects are
   * omitted from the initial clone, which are fetched on-demand later.
   *
   * The {@linkcode AdminOperations.backfill backfill} function can be used
   * to fetch missing objects later.
   *
   * Common filter values:
   *
   * - `"blob:none"`: omit all blobs (file contents)
   * - `"blob:limit=<size>"`: omit blobs larger than the specified size
   * - `"tree:0"`: omit all trees and blobs
   */
  filter?: string | string[];
}

/** Options for the {@linkcode SyncOperations.fetch} function. */
export type SyncFetchOptions =
  | SyncFetchSingleOptions
  | SyncFetchMultipleOptions
  | SyncFetchAllOptions;

/**
 * Options for the {@linkcode SyncOperations.fetch} function when fetching
 * from a single repository.
 */
export interface SyncFetchSingleOptions
  extends
    SyncRemoteOptions,
    SyncOptions,
    SyncTrackOptions,
    SyncShallowOptions,
    SyncFilterOptions {
  /**
   * Branch or tag to fetch commits from.
   *
   * The default behavior is to fetch from all remote branches.
   */
  target?: string | Branch | Tag;
  /** Cannot be specified with {@linkcode SyncFetchSingleOptions.remote}. */
  all?: never;
}

/**
 * Options for the {@linkcode SyncOperations.fetch} function when fetching
 * from multiple repositories.
 */
export interface SyncFetchMultipleOptions
  extends SyncOptions, SyncTrackOptions, SyncShallowOptions, SyncFilterOptions {
  /**
   * Fetch from multiple repositories.
   *
   * If set to `"all"`, fetches from all configured remotes.
   */
  remote: (string | Remote)[];
  /** Cannot be specified with {@linkcode SyncFetchMultipleOptions.remote}. */
  all?: never;
  /** Cannot be specified with {@linkcode SyncFetchMultipleOptions.remote}. */
  target?: never;
}

/**
 * Options for the {@linkcode SyncOperations.fetch} function when fetching
 * from all repositories.
 */
export interface SyncFetchAllOptions
  extends SyncOptions, SyncTrackOptions, SyncShallowOptions, SyncFilterOptions {
  /** Fetch from all configured repositories. */
  all: boolean;
  /** Cannot be specified with {@linkcode SyncFetchAllOptions.all}. */
  remote?: never;
  /** Cannot be specified with {@linkcode SyncFetchAllOptions.all}. */
  target?: never;
}

/** Options for the {@linkcode SyncOperations.pull} function. */
export type SyncPullOptions =
  | SyncPullSingleOptions
  | SyncPullAllOptions;

/**
 * Options for the {@linkcode SyncOperations.pull} function when pulling from
 * a single repository.
 */
export interface SyncPullSingleOptions
  extends
    SyncRemoteOptions,
    SyncOptions,
    SyncTrackOptions,
    SyncShallowOptions,
    SignOptions {
  /**
   * Branch or tag to pull commits from.
   *
   * The default behavior is to pull from the upstream of the current branch.
   */
  target?: string | Branch | Tag;
  /** Cannot be specified with {@linkcode SyncPullSingleOptions.remote}. */
  all?: never;
}

/**
 * Options for the {@linkcode SyncOperations.pull} function when pulling from
 * all repositories.
 */
export interface SyncPullAllOptions
  extends SyncOptions, SyncTrackOptions, SyncShallowOptions, SignOptions {
  /** Pull from all configured repositories. */
  all: boolean;
  /** Cannot be specified with {@linkcode SyncPullAllOptions.all}. */
  remote?: never;
  /** Cannot be specified with {@linkcode SyncPullAllOptions.all}. */
  target?: never;
}

/** Options for the {@linkcode SyncOperations.push} function. */
export type SyncPushOptions =
  | SyncPushBranchOptions
  | SyncPushAllBranchesOptions
  | SyncPushTagOptions;

/**
 * Options for the {@linkcode SyncOperations.push} function when pushing
 * branches.
 */
export interface SyncPushBranchOptions
  extends
    SyncRemoteOptions,
    SyncOptions,
    SyncPushForceOptions,
    SyncTrackOptions,
    SignOptions {
  /**
   * Branch or branches to push to remote.
   *
   * The default behavior is to push the current branch.
   *
   * Note that this does not accept tag names. To push tags, use
   * {@linkcode SyncPushTagOptions.tag tag} or
   * {@linkcode SyncOptions.tags tags}.
   */
  target?: string | Branch | (string | Branch)[];
  /**
   * Delete the specified branch or branches on remote.
   * @default {false}
   */
  delete?: boolean;
  /**
   * Cannot be specified with {@linkcode SyncPushBranchOptions.target}.
   */
  branches?: never;
  /**
   * Cannot be specified with {@linkcode SyncPushBranchOptions.target}.
   */
  tag?: never;
}

/**
 * Options for the {@linkcode SyncOperations.push} function when pushing
 * all branches.
 */
export interface SyncPushAllBranchesOptions
  extends
    SyncRemoteOptions,
    SyncOptions,
    SyncPushForceOptions,
    SyncTrackOptions,
    SignOptions {
  /** Push all branches to remote. */
  branches: "all";
  /**
   * Cannot be specified with {@linkcode SyncPushAllBranchesOptions.branches}.
   */
  target?: never;
  /**
   * Cannot be specified with {@linkcode SyncPushAllBranchesOptions.branches}.
   */
  tag?: never;
  /**
   * Cannot be specified with {@linkcode SyncPushAllBranchesOptions.branches}.
   */
  delete?: never;
}

/**
 * Options for the {@linkcode SyncOperations.push} function when pushing a
 * single tag.
 */
export interface SyncPushTagOptions
  extends
    SyncRemoteOptions,
    SyncOptions,
    SyncPushForceOptions,
    SyncTrackOptions,
    SignOptions {
  /** Tag or tags to push to remote. */
  tag: string | Tag | (string | Tag)[];
  /**
   * Delete the specified tag or tags on remote.
   * @default {false}
   */
  delete?: boolean;
  /**
   * Cannot be specified with {@linkcode SyncPushTagOptions.tag}.
   */
  target?: never;
  /**
   * Cannot be specified with {@linkcode SyncPushTagOptions.tag}.
   */
  branches?: never;
  /**
   * Cannot be specified with {@linkcode SyncPushTagOptions.tag}.
   */
  tags?: never;
}

/**
 * Options common to different push variants of
 * {@linkcode SyncOperations.push} to control forcing behavior.
 */
export interface SyncPushForceOptions {
  /**
   * Force push to remote.
   *
   * - `false`: do not force push (default)
   * - `true`: force push unconditionally
   * - `"with-lease"`: force push only if remote tip is fetched
   * - `"with-lease-if-includes"`: force push only if remote tip is integrated
   *
   * @default {false}
   */
  force?: boolean | "with-lease" | "with-lease-if-includes";
}

/** Options for the {@linkcode AdminOperations.backfill} function. */
export interface AdminBackfillOptions {
  /**
   * Minimum number of objects to backfill in a single batch.
   * @default {50000}
   */
  minBatchSize?: number;
}

/**
 * Creates a new {@linkcode Git} instance for a local repository for running
 * git operations.
 *
 * @example Retrieve the current branch name.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const branch = await git().branch.current();
 *   return { branch };
 * });
 * ```
 *
 * @example Retrieve the last commit in a repository.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const commit = await git().commit.head();
 *   return { commit };
 * });
 * ```
 *
 * @example List all tags in a repository.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const tags = await git().tag.list();
 *   return { tags };
 * });
 * ```
 *
 * @example Retrieve the default branch name from origin.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const branch = await git().remote.head("origin");
 *   return { branch };
 * });
 * ```
 *
 * @example Create a new git repository and add a file.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const repo = await git().init({ directory: "/path/to/repo" });
 *   await Deno.writeTextFile(repo.path("file.txt"), "content");
 *   await repo.index.add("file.txt");
 *   const commit = await repo.commit.create({ subject: "Initial commit" });
 *   return { commit };
 * });
 * ```
 *
 * @example Delete local branches with pruned tracking branches.
 * ```ts
 * import { git } from "@roka/git";
 * import { pool } from "@roka/async/pool";
 * (async () => {
 *   const repo = git({ cwd: "/path/to/repo" });
 *   await repo.sync.fetch({ prune: true });
 *   await pool(await repo.branch.list({ type: "local" }), async (branch) => {
 *     if (branch.fetch?.remote && !branch.fetch.branch) {
 *       await repo.branch.delete(branch.name);
 *     }
 *   }, { concurrency: 1 });
 * });
 * ```
 *
 * @example Enable fetch pruning for all remotes except a single remote.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const repo = git({ cwd: "/path/to/repo" });
 *   await repo.config.set("fetch.prune", true);
 *   await repo.config.set("remote.origin.prune", false);
 * });
 * ```
 *
 * @param options Options for the git repository.
 * @returns A {@linkcode Git} instance for the given repository.
 */
export function git(options?: GitOptions): Git {
  const directory = resolve(options?.cwd ?? ".");
  const gitOptions = options ?? {};
  const repo: Git = {
    path(...parts: string[]) {
      return join(directory, ...parts);
    },
    async init(options) {
      await run(
        {
          ...gitOptions,
          config: { ...gitOptions?.config, ...options?.config },
        },
        "init",
        flag("--bare", options?.bare),
        flag("--initial-branch", options?.branch, { equals: true }),
        flag("--object-format", options?.objectFormat),
        flag("--ref-format", options?.refFormat),
        flag(
          "--shared",
          typeof options?.shared === "number"
            ? options.shared.toString(8).padStart(4, "0")
            : options?.shared,
          { equals: true },
        ),
        flag("--separate-git-dir", options?.separateGitDir, { equals: true }),
        "--",
        options?.directory,
      );
      const repo = git({
        cwd: resolve(directory, options?.directory ?? directory),
      });
      if (options?.config) {
        for (const [key, value] of Object.entries(options.config)) {
          if (value !== undefined) {
            // deno-lint-ignore no-await-in-loop
            await repo.config.set(key, value as ConfigValue<ConfigKey>);
          }
        }
      }
      return repo;
    },
    async clone(remote, options) {
      const origin = options?.remote ??
        (typeof remote === "string" || remote instanceof URL
          ? undefined
          : remote.name);
      const reference = typeof options?.local === "object"
        ? options?.local
        : undefined;
      const output = await run(
        {
          ...gitOptions,
          config: { ...gitOptions?.config, ...options?.config },
          stderr: true,
        },
        "clone",
        configFlags(options?.config, "--config"),
        flag("--bare", options?.bare),
        flag("--branch", options?.branch ?? undefined),
        flag("--no-checkout", options?.branch === null),
        flag("--filter", options?.filter, { equals: true }),
        flag("--local", options?.local === true),
        flag("--no-local", options?.local === false),
        flag("--no-hardlinks", options?.local === "copy"),
        flag("--shared", options?.local === "shared"),
        flag(
          reference?.ifAble ? "--reference-if-able" : "--reference",
          reference?.reference,
        ),
        flag("--dissociate", reference?.dissociate),
        flag("--origin", origin),
        flag("--depth", options?.shallow?.depth),
        flag("--shallow-exclude", options?.shallow?.exclude, {
          equals: true,
        }),
        flag(
          ["--single-branch", "--no-single-branch"],
          options?.singleBranch,
        ),
        flag(["--tags", "--no-tags"], options?.tags),
        flag("--separate-git-dir", options?.separateGitDir, { equals: true }),
        urlArg(remote),
        "--",
        options?.directory,
      );
      const match = output.match(/Cloning into '(?<directory>.+?)'\.\.\./);
      const cloned = options?.directory ?? match?.groups?.directory;
      assertExists(cloned, "Cannot determine cloned directory");
      const cwd = resolve(directory, cloned);
      return git({ ...gitOptions, cwd });
    },
    config: {
      async list(options?: ConfigOptions) {
        const output = await run(
          gitOptions,
          ["config", "list"],
          configTargetFlag(options?.target),
        );
        const lines = output.split("\n").filter((x) => x);
        const config: Record<string, string[]> = {};
        lines.reduce((config, line) => {
          let [key = "", value = ""] = line.split("=", 2);
          key = key.trim().toLowerCase();
          if (config[key] === undefined) config[key] = [];
          config[key]?.push(value);
          return config;
        }, config);
        return mapEntries(
          config,
          (entry) => {
            const found = configValue(...entry);
            return [found.key, found.value];
          },
        ) as Config;
      },
      async get<K extends ConfigKey>(key: K, options?: ConfigOptions) {
        const schema = configSchema(key);
        const [type] = schema?.type?.length === 1 ? schema.type : [];
        const output = await run(
          { ...gitOptions, allowCode: [1] },
          ["config", "get"],
          "--all",
          ...type === "boolean" ? ["--bool"] : [],
          ...type === "number" ? ["--int"] : [],
          configTargetFlag(options?.target),
          key,
        );
        if (!output) return undefined;
        const lines = output.replace(/\n$/, "").split("\n");
        return configValue(key, lines).value as ConfigValue<K>;
      },
      async set(key, value, options?: ConfigOptions) {
        if (!Array.isArray(value)) {
          await run(
            gitOptions,
            ["config", "set", "--all"],
            configTargetFlag(options?.target),
            key,
            `${value}`,
          );
        } else {
          await run(
            { ...gitOptions, allowCode: [5] },
            ["config", "unset", "--all"],
            configTargetFlag(options?.target),
            key,
          );
          for (const element of value) {
            // deno-lint-ignore no-await-in-loop
            await run(
              gitOptions,
              ["config", "--add"],
              configTargetFlag(options?.target),
              key,
              `${element}`,
            );
          }
        }
      },
      async unset(key, options?: ConfigOptions) {
        await run(
          { ...gitOptions, allowCode: [5] },
          ["config", "unset", "--all"],
          configTargetFlag(options?.target),
          key,
        );
      },
    },
    index: {
      async status(options?: IndexStatusOptions) {
        const output = await run(
          gitOptions,
          ["status", "--porcelain=1", "-z"],
          flag("--untracked-files=normal", options?.untracked === true),
          flag("--ignored=traditional", options?.ignored === true),
          flag("--ignored=no", options?.ignored === false),
          flag("--untracked-files=no", options?.untracked === false),
          flag("--untracked-files=all", options?.untracked === "all"),
          flag(["--renames", "--no-renames"], options?.renames),
          "--",
          options?.path,
        );
        const lines = output.split("\0").filter((x) => x);
        const status: Status = {
          staged: [],
          unstaged: [],
          untracked: [],
          ignored: [],
        };
        let rename = false;
        for (
          const [entry, next] of slidingWindows(lines, 2, { partial: true })
        ) {
          assertExists(entry, "Cannot parse status line");
          if (rename) {
            rename = false;
            continue;
          }
          const [x, y, path] = [entry[0], entry[1], entry.slice(3)];
          assertExists(x, "Cannot parse status entry");
          assertExists(y, "Cannot parse status entry");
          assertExists(path, "Cannot parse status entry");
          if (x === "?") {
            status.untracked.push({ path });
            continue;
          }
          if (x === "!") {
            status.ignored.push({ path });
            continue;
          }
          if (x !== " ") {
            const xStatus = statusKind(x);
            if (xStatus === "renamed" || xStatus === "copied") {
              assertExists(next, "Cannot parse status entry");
              rename = true;
              status.staged.push({ path, status: xStatus, from: next });
            } else {
              status.staged.push({ path, status: xStatus });
            }
          }
          if (y !== " ") {
            const yStatus = statusKind(y);
            if (yStatus === "renamed" || yStatus === "copied") {
              assertExists(next, "Cannot parse status entry");
              rename = true;
              status.unstaged.push({ path, status: yStatus, from: next });
            } else {
              status.unstaged.push({ path, status: yStatus });
            }
          }
        }
        return status;
      },
      async add(path, options?: IndexAddOptions) {
        await run(
          gitOptions,
          "add",
          flag("--force", options?.force),
          flag(["--chmod=+x", "--chmod=-x"], options?.executable),
          "--",
          path,
        );
      },
      async move(source, destination, options?: IndexMoveOptions) {
        await run(
          gitOptions,
          "mv",
          flag("--force", options?.force),
          source,
          destination,
        );
      },
      async restore(path, options?: IndexRestoreOptions) {
        await run(
          gitOptions,
          "restore",
          flag(
            "--staged",
            options?.location === "index" || options?.location === "both",
          ),
          flag(
            "--worktree",
            options?.location === "worktree" || options?.location === "both",
          ),
          flag("--source", commitArg(options?.source), { equals: true }),
          "--",
          path,
        );
      },
      async remove(path, options?: IndexRemoveOptions) {
        await run(
          gitOptions,
          "rm",
          flag("--force", options?.force),
          path,
        );
      },
    },
    diff: {
      async status(options) {
        const output = await run(
          gitOptions,
          ["diff", "--no-color", "--name-status", "-z"],
          flag("--staged", options?.staged),
          flag("--find-copies", options?.copies),
          pickaxeFlags(options?.pickaxe),
          flag(["--find-renames", "--no-renames"], options?.renames),
          commitArg(options?.target),
          rangeArg(options),
          "--",
          options?.path,
        );
        const entries = output.split("\0").filter((x) => x);
        const statuses: TrackedPathStatus[] = [];
        let rename: string | undefined = undefined;
        let status: Patch["status"] | undefined = undefined;
        for (
          const [entry, next] of slidingWindows(entries, 2, { partial: true })
        ) {
          assertExists(entry, "Cannot parse diff entry");
          if (entry === rename) continue;
          if (status === undefined) {
            status = statusKind(entry);
            if (status === "renamed" || status === "copied") {
              assertExists(next, "Cannot parse diff entry");
              rename = next;
            }
            continue;
          }
          if (status === "renamed" || status === "copied") {
            assertExists(rename, "Cannot parse diff entry");
            statuses.push({ path: entry, status, from: rename });
            rename = undefined;
            status = undefined;
            continue;
          }
          statuses.push({ path: entry, status });
          status = undefined;
        }
        return statuses;
      },
      async patch(options) {
        const output = await run(
          gitOptions,
          ["diff", "--no-color", "--no-prefix", "--no-ext-diff"],
          flag("--diff-algorithm", options?.algorithm, { equals: true }),
          flag("--find-copies-harder", options?.copies),
          pickaxeFlags(options?.pickaxe),
          flag(["--find-renames", "--no-renames"], options?.renames),
          flag("--staged", options?.staged),
          flag("--unified", options?.unified, { equals: true }),
          commitArg(options?.target),
          rangeArg(options),
          "--",
          options?.path,
        );
        return output.split(/\n(?=diff --git )/)
          .filter((x) => x)
          .map((content) => {
            const [header, ...body] = content.split(/\n(?=@@ )/);
            assertExists(header, "Cannot parse diff patch: header");
            const patch = header.split("\n").reduce(
              (patch: Partial<Patch>, line) => {
                for (const transform of PATCH_HEADER_TRANSFORMS) {
                  const match = line.match(transform.pattern);
                  if (match?.[1] !== undefined) {
                    transform.apply(patch, match[1]);
                    return patch;
                  }
                }
                return patch;
              },
              {},
            );
            const hunks: Hunk[] = body.map((hunk) => {
              const match = hunk.match(
                /^@@ -(?<oldLine>\d+)(,\d*)? \+(?<newLine>\d+)(,\d*)? @@.*\n(?<body>(?:.|\n)*)$/,
              );
              const { oldLine, newLine, body } = match?.groups ?? {};
              assertExists(oldLine, "Cannot parse diff patch: hunk header");
              assertExists(newLine, "Cannot parse diff patch: hunk header");
              assertExists(body, "Cannot parse diff patch: hunk body");
              return {
                line: {
                  old: parseInt(oldLine),
                  new: parseInt(newLine),
                },
                lines: body.split("\n").filter((line) => line !== "").map(
                  (line) => {
                    const type = line.startsWith("+")
                      ? "added" as const
                      : line.startsWith("-")
                      ? "deleted" as const
                      : line.startsWith("\\")
                      ? "info" as const
                      : "context" as const;
                    return {
                      type,
                      content: type === "info"
                        ? line.slice(1).trim()
                        : line.slice(1),
                    };
                  },
                ),
              };
            });
            assertExists(patch.path, "Cannot parse diff patch: path");
            assertExists(patch.status, "Cannot parse diff patch: status");
            return {
              path: patch.path,
              status: patch.status,
              ...patch.mode !== undefined && { mode: patch.mode },
              ...patch.from !== undefined && { from: patch.from },
              ...hunks.length > 0 && { hunks },
            };
          });
      },
    },
    ignore: {
      async filter(path, options) {
        if (typeof path === "string") path = [path];
        if (path.length === 0) return [];
        const output = await run(
          { ...gitOptions, allowCode: [1] },
          "check-ignore",
          flag("--no-index", options?.index === false),
          "--",
          path,
        );
        return output.split("\n").filter((line) => line);
      },
      async omit(path, options) {
        if (typeof path === "string") path = [path];
        if (path.length === 0) return [];
        const output = await run(
          { ...gitOptions, allowCode: [1] },
          ["check-ignore", "--verbose", "--non-matching"],
          flag("--no-index", options?.index === false),
          path,
        );
        return output
          .split("\n")
          .map((l) => (l.startsWith("::") ? (l.split("\t").at(-1) ?? "") : ""))
          .filter((line) => line);
      },
    },
    commit: {
      async log(options) {
        const { value: output, error } = await maybe(() =>
          run(
            gitOptions,
            ["log", "--no-color"],
            flag("--format", formatArg(COMMIT_FORMAT), { equals: true }),
            flag("--author", userArg(options?.author), { equals: true }),
            flag("--committer", userArg(options?.committer), { equals: true }),
            flag("--max-count", options?.maxCount, { equals: true }),
            pickaxeFlags(options?.pickaxe),
            flag("--skip", options?.skip),
            rangeArg(options),
            "--",
            options?.path,
          )
        );
        if (error) {
          const { value: head } = await maybe(() =>
            run(gitOptions, "rev-parse", "HEAD")
          );
          if (!head) return [];
          throw error;
        }
        return parseOutput(COMMIT_FORMAT, output) as Commit[];
      },
      async head() {
        const commit = await repo.commit.get("HEAD");
        if (!commit) {
          throw new GitError("Current branch does not have any commits");
        }
        return commit;
      },
      async get(ref) {
        const [commit] = await repo.commit.log({
          maxCount: 1,
          range: { to: commitArg(ref) },
        });
        return commit;
      },
      async create(options) {
        const output = await run(
          gitOptions,
          "commit",
          flag("--message", options?.subject, { equals: true }),
          flag("--message", options?.body, { equals: true }),
          trailerFlag(options?.trailers),
          flag("--all", options?.all),
          flag("--allow-empty", options?.allowEmpty),
          flag("--allow-empty-message", options?.allowEmptyMessage),
          flag("--author", userArg(options?.author)),
          signFlag("commit", options?.sign),
          "--",
          options?.path,
        );
        const hash = output.match(/^\[.+ (?<hash>[0-9a-f]+)\]/)?.groups?.hash;
        assertExists(hash, "Cannot find created commit");
        const commit = await repo.commit.get(hash);
        assertExists(commit, "Cannot find created commit");
        return commit;
      },
      async amend(options) {
        let { subject, body, trailers } = options ?? {};
        const edited = subject !== undefined ||
          body !== undefined ||
          (trailers !== undefined && Object.keys(trailers).length > 0);
        if (edited && (subject === undefined || body === undefined)) {
          const commit = await repo.commit.get("HEAD");
          if (commit && subject === undefined && body === undefined) {
            body = commit.body;
          }
          if (commit && subject === undefined) subject = commit.subject;
        }
        const output = await run(
          gitOptions,
          ["commit", "--amend"],
          flag("--message", subject, { equals: true }),
          flag("--message", body, { equals: true }),
          trailerFlag(trailers),
          flag("--all", options?.all),
          flag("--allow-empty", options?.allowEmpty),
          flag("--no-edit", !edited),
          flag("--author", userArg(options?.author), { equals: true }),
          signFlag("commit", options?.sign),
          "--",
          options?.path,
        );
        const hash = output.match(/^\[.+ (?<hash>[0-9a-f]+)\]/)?.groups?.hash;
        assertExists(hash, "Cannot find created commit");
        const commit = await repo.commit.get(hash);
        assertExists(commit, "Cannot find created commit");
        return commit;
      },
    },
    branch: {
      async list(options) {
        const output = await run(
          gitOptions,
          ["branch", "--no-color", "--list"],
          flag("--format", formatArg(BRANCH_FORMAT), { equals: true }),
          flag("--all", options?.type === "all"),
          flag("--remotes", options?.type === "remote"),
          flag("--contains", commitArg(options?.contains)),
          flag("--no-contains", commitArg(options?.noContains)),
          flag("--merged", commitArg(options?.merged)),
          flag("--no-merged", commitArg(options?.noMerged)),
          flag("--points-at", commitArg(options?.pointsAt)),
          options?.name,
        );
        const branches = parseOutput(BRANCH_FORMAT, output);
        return await Promise.all(
          branches
            .filter((branch) => !branch?.name?.includes(" "))
            .map(async (branch) => {
              if (branch.commit?.hash === undefined) delete branch.commit;
              if (
                branch.fetch?.name === undefined ||
                branch.fetch?.remote?.name === undefined ||
                branch.fetch?.branch?.name === undefined
              ) delete branch.fetch;
              if (
                branch.push?.name === undefined ||
                branch.push?.remote?.name === undefined ||
                branch.push?.branch?.name === undefined
              ) delete branch.push;
              await Promise.all([
                hydrate([branch, "commit", "hash"], repo.commit.get),
                hydrate([branch.fetch, "remote", "name"], repo.remote.get),
                hydrate([branch.fetch, "branch", "name"], repo.branch.get),
                hydrate([branch.push, "remote", "name"], repo.remote.get),
                hydrate([branch.push, "branch", "name"], repo.branch.get),
              ]);
              assertExists(branch.name, "Branch name not filled");
              if (branch.fetch !== undefined && branch.push === undefined) {
                branch.push = branch.fetch;
              }
              return {
                name: branch.name,
                ...branch.commit && { commit: branch.commit },
                ...branch.fetch && { fetch: branch.fetch },
                ...branch.push && { push: branch.push },
              };
            }),
        );
      },
      async current() {
        const output = await run(
          gitOptions,
          ["branch", "--no-color", "--show-current"],
        );
        const name = output.trim();
        if (!name) throw new GitError("Cannot determine HEAD branch");
        const [branch] = await repo.branch.list({ name });
        return branch ?? { name }; // unborn branch
      },
      async get(branch: string | Branch, options?: BranchGetOptions) {
        const remote = remoteArg(options?.remote);
        const name = remote ? `${remote}/${nameArg(branch)}` : nameArg(branch);
        const type = remote ? "remote" : "all";
        const [found] = await repo.branch.list({ name, type });
        if (!found) return undefined;
        // ignore branches found by pattern matching
        if (
          found.name !== name &&
          found.name !== `heads/${name}` &&
          found.name !== `remotes/${name}`
        ) return undefined;
        return found;
      },
      async create(name, options) {
        await run(
          gitOptions,
          ["branch", "--no-color"],
          flag("--force", options?.force),
          flag(["--track", "--no-track"], options?.track, { equals: true }),
          name,
          commitArg(options?.target),
        );
        const [branch] = await repo.branch.list({ name });
        return branch ?? { name };
      },
      async switch(branch, options) {
        await run(
          gitOptions,
          "switch",
          flag("--force", options?.force),
          flag(["--track", "--no-track"], options?.track, { equals: true }),
          flag(
            options?.force ? "--force-create" : "--create",
            !options?.orphan && (options?.create ?? false) !== false,
          ),
          flag("--orphan", options?.orphan),
          nameArg(branch),
          ...typeof options?.create !== "boolean"
            ? [commitArg(options?.create)]
            : [],
        );
        return await repo.branch.current();
      },
      async detach(options) {
        await run(
          gitOptions,
          ["switch", "--detach"],
          commitArg(options?.target),
        );
      },
      async reset(options) {
        await run(
          gitOptions,
          "reset",
          flag("--soft", options?.mode === "soft"),
          flag("--hard", options?.mode === "hard"),
          flag("--mixed", options?.mode === "mixed"),
          flag("--merge", options?.mode === "merge"),
          flag("--keep", options?.mode === "keep"),
          commitArg(options?.target),
        );
      },
      async move(branch, name, options) {
        await run(
          gitOptions,
          ["branch", "--no-color", "--move"],
          flag("--force", options?.force),
          nameArg(branch),
          name,
        );
        const [newBranch] = await repo.branch.list({ name });
        return newBranch ?? { name };
      },
      async copy(branch, name, options) {
        await run(
          gitOptions,
          ["branch", "--no-color", "--copy"],
          flag("--force", options?.force),
          nameArg(branch),
          name,
        );
        const [newBranch] = await repo.branch.list({ name });
        return newBranch ?? { name };
      },
      async track(branch, upstream) {
        const name = nameArg(branch);
        await run(
          gitOptions,
          ["branch", "--no-color"],
          flag("--set-upstream-to", upstream, { equals: true }),
          name,
        );
        const [newBranch] = await repo.branch.list({ name });
        return newBranch ?? { name };
      },
      async untrack(branch) {
        const name = nameArg(branch);
        await run(
          gitOptions,
          ["branch", "--no-color", "--unset-upstream"],
          name,
        );
        const [newBranch] = await repo.branch.list({ name });
        return newBranch ?? { name };
      },
      async delete(branch, options) {
        await run(
          gitOptions,
          ["branch", "--no-color", "--delete"],
          flag("--force", options?.force),
          flag("--remotes", options?.type === "remote"),
          nameArg(branch),
        );
      },
    },
    tag: {
      async list(options) {
        const output = await run(
          gitOptions,
          ["tag", "--list"],
          flag("--format", formatArg(TAG_FORMAT), { equals: true }),
          flag("--contains", commitArg(options?.contains)),
          flag("--no-contains", commitArg(options?.noContains)),
          flag("--merged", commitArg(options?.merged)),
          flag("--no-merged", commitArg(options?.noMerged)),
          flag("--points-at", commitArg(options?.pointsAt)),
          flag("--sort=-version:refname", options?.sort === "version"),
          options?.name,
        );
        const tags = parseOutput(TAG_FORMAT, output);
        return await Promise.all(tags.map(async (tag) => {
          assertExists(tag.name, "Tag name not filled");
          assertExists(tag.commit?.hash, "Commit hash not filled for tag");
          await hydrate([tag, "commit", "hash"], repo.commit.get);
          assertExists(tag.commit, "Cannot find commit for tag");
          return { ...tag, name: tag.name, commit: tag.commit };
        }));
      },
      async get(tag: string | Tag) {
        const name = nameArg(tag);
        const [found] = await repo.tag.list({ name });
        if (!found) return undefined;
        if (found.name !== name) return undefined;
        return found;
      },
      async create(name, options): Promise<Tag> {
        await run(
          gitOptions,
          "tag",
          flag("--message", options?.subject, { equals: true }),
          flag("--message", options?.body, { equals: true }),
          trailerFlag(options?.trailers),
          flag("--force", options?.force),
          signFlag("tag", options?.sign),
          name,
          peeledArg(commitArg(options?.target)),
        );
        const [tag] = await repo.tag.list({ name });
        assertExists(tag, "Cannot find created tag");
        return tag;
      },
      async delete(tag) {
        await run(gitOptions, ["tag", "--delete"], nameArg(tag));
      },
    },
    remote: {
      async list() {
        function toUrl(str: string) {
          const { value: url } = maybe(() => new URL(str));
          return url ?? toFileUrl(str);
        }
        const output = await run(gitOptions, "remote", "--verbose");
        const lines = output.trimEnd().split("\n").filter((x) => x);
        const remotes: Record<string, Partial<Remote>> = {};
        for (const line of lines) {
          const match = line.match(
            /^(?<name>\S+)\s+(?<url>\S+)\s+\((?<type>fetch|push)\)(?: \[(?<filter>\S+)\])?$/,
          );
          const { name, url, type, filter } = { ...match?.groups };
          if (!name || !url || !type) {
            throw new GitError("Cannot parse remote list");
          }
          remotes[name] ??= { name, push: [] };
          if (type === "fetch") {
            remotes[name].fetch = toUrl(url);
            if (filter !== undefined) remotes[name].filter = filter;
          }
          if (type === "push") remotes[name].push?.push(toUrl(url));
        }
        return Object.values(remotes).map((remote) => {
          const { name, fetch, push } = remote;
          assertExists(name);
          assertExists(push);
          if (!fetch) throw new GitError("Cannot determine remote fetch URL");
          return { ...remote, name, fetch, push };
        });
      },
      async current() {
        const remote =
          (await maybe(() => repo.branch.current())).value?.fetch?.remote ??
            "origin";
        return repo.remote.get(remote);
      },
      async get(remote) {
        const remotes = await repo.remote.list();
        return remotes.find((r) => r.name === remoteArg(remote));
      },
      async head(remote) {
        const output = await run(
          gitOptions,
          ["ls-remote", "--symref", remoteArg(remote), "HEAD"],
        );
        const match = output.match(/^ref: refs\/heads\/(?<head>.+?)\s+HEAD$/m);
        const { head } = { ...match?.groups };
        if (!head) throw new GitError("Cannot determine remote HEAD branch");
        return head;
      },
      async add(remote, url?: string | URL) {
        url = url ?? (typeof remote === "string" ? undefined : remote.fetch);
        const push = typeof remote === "string" ? [] : remote.push;
        await run(
          gitOptions,
          ["remote", "add"],
          remoteArg(remote),
          urlArg(url),
        );
        for (const url of push) {
          // deno-lint-ignore no-await-in-loop
          await run(
            gitOptions,
            ["remote", "set-url", "--add", "--push"],
            remoteArg(remote),
            url.href,
          );
        }
        const added = await repo.remote.get(remote);
        if (!added) throw new GitError("Failed to add remote");
        return added;
      },
      async rename(remote, name) {
        await run(
          gitOptions,
          ["remote", "rename"],
          remoteArg(remote),
          name,
        );
        const renamed = await repo.remote.get(name);
        if (!renamed) throw new GitError("Failed to rename remote");
        return renamed;
      },
      async set(remote: string | Remote, url?: string | URL) {
        const fetch = typeof remote === "string" ? urlArg(url) : remote.fetch;
        assertExists(fetch);
        const push = typeof remote === "string" ? [] : remote.push;
        await run(
          gitOptions,
          ["remote", "set-url"],
          remoteArg(remote),
          urlArg(fetch),
        );
        await maybe(() =>
          run(
            gitOptions,
            ["remote", "set-url", "--delete", "--push"],
            remoteArg(remote),
            ".*",
          )
        );
        for (const url of push) {
          // deno-lint-ignore no-await-in-loop
          await run(
            gitOptions,
            ["remote", "set-url", "--add", "--push"],
            remoteArg(remote),
            url.href,
          );
        }
        const updated = await repo.remote.get(remote);
        if (!updated) throw new GitError("Failed to update remote");
        return updated;
      },
      async prune(remote) {
        await run(
          gitOptions,
          ["remote", "prune"],
          remoteArg(remote),
        );
      },
      async remove(remote) {
        await run(gitOptions, ["remote", "remove"], remoteArg(remote));
      },
    },
    sync: {
      async fetch(options) {
        await run(
          gitOptions,
          "fetch",
          flag("--atomic", options?.atomic),
          flag("--filter", options?.filter, { equals: true }),
          flag("--prune", options?.prune),
          flag("--depth", options?.shallow?.depth),
          flag("--shallow-exclude", options?.shallow?.exclude, {
            equals: true,
          }),
          flag("--no-tags", options?.tags === "none"),
          flag("--tags", options?.tags === "all"),
          flag("--set-upstream", options?.track),
          flag("--all", options?.all),
          flag("--multiple", Array.isArray(options?.remote)),
          remoteArg(
            options?.all
              ? undefined
              : options?.remote ?? await repo.remote.current(),
          ),
          nameArg(options?.target),
        );
      },
      async pull(options) {
        await run(
          gitOptions,
          "pull",
          flag("--atomic", options?.atomic),
          flag("--prune", options?.prune),
          flag("--depth", options?.shallow?.depth),
          flag("--shallow-exclude", options?.shallow?.exclude, {
            equals: true,
          }),
          signFlag("commit", options?.sign),
          flag("--no-tags", options?.tags === "none"),
          flag("--tags", options?.tags === "all"),
          flag("--set-upstream", options?.track),
          flag("--all", options?.all),
          flag("--multiple", Array.isArray(options?.remote)),
          remoteArg(
            options?.all
              ? undefined
              : options?.remote ?? await repo.remote.current(),
          ),
          nameArg(options?.target),
        );
      },
      async push(options) {
        const remote = options?.remote ?? await repo.remote.current();
        if (remote === undefined) throw new GitError("No remote configured");
        await run(
          gitOptions,
          "push",
          flag(["--atomic", "--no-atomic"], options?.atomic),
          flag("--delete", options?.delete),
          flag("--prune", options?.prune),
          flag("--force", options?.force === true),
          flag(
            "--force-with-lease",
            options?.force === "with-lease" ||
              options?.force === "with-lease-if-includes",
          ),
          flag(
            "--force-if-includes",
            options?.force === "with-lease-if-includes",
          ),
          flag("--no-tags", options?.tags === "none"),
          flag("--tags", options?.tags === "all"),
          flag("--follow-tags", options?.tags === "follow"),
          flag("--set-upstream", options?.track),
          flag("--branches", options?.branches === "all"),
          remoteArg(remote),
          nameArg(options?.target),
          flag("tag", options?.tag !== undefined),
          nameArg(options?.tag),
        );
      },
      async unshallow(options) {
        const remote = options?.remote ?? await repo.remote.current();
        await run(
          gitOptions,
          ["fetch", "--unshallow"],
          remoteArg(remote),
        );
      },
    },
    admin: {
      async backfill(options) {
        await run(
          gitOptions,
          "backfill",
          flag("--min-batch-size", options?.minBatchSize),
        );
      },
    },
  };
  return repo;
}

async function run(
  options: GitOptions & { allowCode?: number[]; stderr?: boolean },
  ...commandArgs: (string | string[] | undefined)[]
): Promise<string> {
  const runArgs = commandArgs.flat().filter((x) => x !== undefined);
  const fullArgs = [
    ...options.cwd !== undefined ? ["-C", normalize(options.cwd)] : [],
    ...configFlags(options.config, "-c"),
    "--no-pager",
    ...runArgs,
  ];
  const command = new Deno.Command("git", {
    args: fullArgs,
    stdin: "null",
    stdout: "piped",
    env: { GIT_EDITOR: "true" },
  });
  try {
    const { code, stdout, stderr } = await command.output();
    if (code !== 0 && !(options.allowCode?.includes(code))) {
      const error = new TextDecoder().decode(stderr.length ? stderr : stdout);
      throw new GitError(
        `Error running git command: ${runArgs[0]}\n\n${error}`,
        { cause: { command: "git", args: fullArgs, code } },
      );
    }
    return new TextDecoder().decode(options?.stderr ? stderr : stdout);
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotCapable) {
      throw new GitError("Permission error (use `--allow-run=git`)", {
        cause: e,
      });
    }
    throw e;
  }
}

function urlArg(url: SyncRemoteOptions["remote"]): string;
function urlArg(
  url: SyncRemoteOptions["remote"] | undefined,
): string | undefined;
function urlArg(
  url: SyncRemoteOptions["remote"] | undefined,
): string | undefined {
  if (url === undefined) return undefined;
  if (typeof url === "string") return url;
  if (url instanceof URL) return url.href;
  return url.fetch.href;
}

function remoteArg(remote: string | URL | Remote): string;
function remoteArg(
  remote: string | URL | Remote | undefined,
): string | undefined;
function remoteArg(
  remote: string | URL | Remote | (string | URL | Remote)[] | undefined,
): string | string[] | undefined;
function remoteArg(
  remote: string | URL | Remote | (string | URL | Remote)[] | undefined,
): string | string[] | undefined {
  if (remote === undefined) return undefined;
  if (Array.isArray(remote)) return remote.map((x) => remoteArg(x));
  return remote instanceof URL ? remote.href : nameArg(remote);
}

function userArg(user: User): string;
function userArg(user: User | undefined): string | undefined;
function userArg(user: User | undefined): string | undefined {
  if (user === undefined) return undefined;
  return `${user.name} <${user.email}>`;
}

type Named = string | Remote | Branch | Tag;
function nameArg(obj: Named): string;
function nameArg(obj: Named[]): string[];
function nameArg(obj: Named | undefined): string | undefined;
function nameArg(obj: Named[] | undefined): string[] | undefined;
function nameArg(
  obj: Named | Named[] | undefined,
): string | string[] | undefined;
function nameArg(
  obj: Named | Named[] | undefined,
): string | string[] | undefined {
  if (obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map((x) => nameArg(x));
  return typeof obj === "string" ? obj : obj.name;
}

function commitArg(commit: Commitish): string;
function commitArg(commit: Commitish | undefined): string | undefined;
function commitArg(commit: Commitish | undefined): string | undefined {
  if (commit === undefined) return undefined;
  return typeof commit === "string"
    ? commit
    : "name" in commit
    ? commit.name
    : commit.hash;
}

function peeledArg(ref: string): string;
function peeledArg(ref: string | undefined): string | undefined;
function peeledArg(ref: string | undefined): string | undefined {
  if (ref === undefined) return undefined;
  if (/\^{.*?}/.test(ref)) return ref;
  return `${ref}^{}`;
}

function rangeArg(range: RevisionRangeOptions): string;
function rangeArg(range: RevisionRangeOptions | undefined): string | undefined;
function rangeArg(range: RevisionRangeOptions | undefined): string | undefined {
  if (range === undefined) return undefined;
  const from = range.from && commitArg(range.from);
  const to = range.to && commitArg(range.to);
  if (from === undefined && to === undefined) return undefined;
  if (from === undefined) return to;
  return `${from}${range.symmetric ? "..." : ".."}${to ?? "HEAD"}`;
}

function flag(
  flag: string | [string, string],
  value: boolean | number | string | string[] | undefined,
  options?: { equals?: boolean; join?: boolean },
): string[] {
  const pair = (k: string, v: string) =>
    options?.equals ? [`${k}=${v}`] : options?.join ? [`${k}${v}`] : [k, v];
  if (typeof flag === "string") flag = [flag, ""];
  if (value === true) return [flag[0]];
  if (value === false && flag[1]) return [flag[1]];
  if (typeof value === "number") return pair(flag[0], value.toString());
  if (typeof value === "string") return pair(flag[0], value);
  if (Array.isArray(value)) {
    if (options?.equals) return value.map((v) => pair(flag[0], v)).flat();
    else return [flag[0], ...value];
  }
  return [];
}

function configFlags(config: Config | undefined, flag?: string): string[] {
  if (!config) return [];
  return Object.entries(config)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value]).map((value) =>
        flag ? [flag, `${key}=${value}`] : [key, `${value}`]
      )
    ).flat();
}

function configTargetFlag(target: ConfigOptions["target"] | undefined) {
  if (target === undefined) return undefined;
  if (target === "global") return "--global";
  if (target === "system") return "--system";
  if (target === "local") return "--local";
  if (target === "worktree") return "--worktree";
  return flag("--file", target.file);
}

function trailerFlag(trailers: Record<string, string> | undefined): string[] {
  if (trailers === undefined) return [];
  return Object.entries(trailers).flatMap(([token, value]) =>
    flag("--trailer", `${token}: ${value}`)
  );
}

function signFlag(
  type: "commit" | "tag",
  sign: boolean | string | undefined,
): string[] {
  if (sign === undefined) return [];
  if (type === "tag") {
    if (sign === false) return ["--no-sign"];
    if (sign === true) return ["--sign"];
    return flag("--local-user", sign, { equals: true });
  }
  if (sign === false) return ["--no-gpg-sign"];
  if (sign === true) return ["--gpg-sign"];
  return flag("--gpg-sign", sign, { equals: true });
}

function pickaxeFlags(pickaxe: string | Pickaxe | undefined): string[] {
  if (pickaxe === undefined) return [];
  pickaxe = typeof pickaxe === "string" ? { pattern: pickaxe } : pickaxe;
  return [
    `${pickaxe.updated ? "-G" : "-S"}${pickaxe.pattern}`,
    ...pickaxe.updated ? [] : ["--pickaxe-regex"],
  ];
}

function configSchema(
  lowercase: string,
): { key: string; type: readonly string[] } | undefined {
  lowercase = lowercase.toLowerCase();
  const { object, name, subkey } =
    lowercase.match(/^(?<object>branch|remote)\.(?<name>[^.]+)\.(?<subkey>.+)$/)
      ?.groups ?? {};
  if (object === "branch") {
    for (const [key, type] of Object.entries(BRANCH_CONFIG_SCHEMA)) {
      if (key.toLowerCase() === subkey) {
        return { key: `branch.${name}.${key}`, type };
      }
    }
  }
  if (object === "remote") {
    for (const [key, type] of Object.entries(REMOTE_CONFIG_SCHEMA)) {
      if (key.toLowerCase() === subkey) {
        return { key: `remote.${name}.${key}`, type };
      }
    }
  }
  for (const [key, type] of Object.entries(CONFIG_SCHEMA)) {
    if (key.toLowerCase() === lowercase) return { key, type };
  }
  return undefined;
}

function configValue(key: string, lines: string[]) {
  const value = lines.at(-1);
  const schema = configSchema(key);
  if (schema === undefined) return { key, value };
  key = schema.key;
  if (value === undefined) return { key, value };
  if (schema.type.includes("array")) return { key, value: lines };
  if (
    schema.type.includes(value) &&
    value !== "array" &&
    value !== "string" &&
    value !== "number" &&
    value !== "boolean"
  ) {
    return { key, value };
  }
  if (schema.type.includes("boolean")) {
    const lower = value.toLowerCase();
    if (["true", "yes", "on", "1"].includes(lower)) return { key, value: true };
    if (["false", "no", "off", "0"].includes(lower)) {
      return { key, value: false };
    }
  }
  if (schema.type.includes("number")) {
    const number = Number(value);
    if (!isNaN(number)) return { key, value: number };
  }
  return { key, value };
}

function statusKind(code: string): Patch["status"] {
  switch (code[0]) {
    case "M":
      return "modified";
    case "T":
      return "type-changed";
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "modified";
  }
}

type FormatFieldDescriptor<T> =
  | { kind: "skip" }
  | (
    & (
      | {
        kind: "string";
        format: string;
        transform(value: string): T;
      }
      | (T extends string ? {
          kind: "string";
          format: string;
        }
        : T extends object ? {
            kind: "object";
            fields: {
              [K in keyof T]: FormatFieldDescriptor<T[K]>;
            };
          }
        : never)
    )
    & (undefined extends T ? { optional: true } : { optional?: false })
  );

type FormatDescriptor<T> = { delimiter: string } & FormatFieldDescriptor<T>;

const BRANCH_FORMAT: FormatDescriptor<Branch> = {
  delimiter: "<%(objectname)>",
  kind: "object",
  fields: {
    name: {
      kind: "string",
      format: "%(refname:short)",
    },
    commit: {
      kind: "object",
      optional: true,
      fields: {
        hash: {
          kind: "string",
          format: "%(if)%(object)%(then)%(object)%(else)%(objectname)%(end)",
        },
        short: { kind: "skip" },
        author: { kind: "skip" },
        committer: { kind: "skip" },
        subject: { kind: "skip" },
        body: { kind: "skip" },
        trailers: { kind: "skip" },
      },
    },
    fetch: {
      kind: "object",
      optional: true,
      fields: {
        name: {
          kind: "string",
          format: "%(if)%(upstream)%(then)%(upstream:lstrip=3)%(else)%00%(end)",
        },
        remote: {
          kind: "object",
          fields: {
            name: {
              kind: "string",
              format:
                "%(if)%(upstream)%(then)%(upstream:remotename)%(else)%00%(end)",
            },
            fetch: { kind: "skip" },
            push: { kind: "skip" },
          },
        },
        branch: {
          kind: "object",
          optional: true,
          fields: {
            name: {
              kind: "string",
              format:
                "%(if)%(upstream)%(then)%(upstream:short)%(else)%00%(end)",
            },
            commit: { kind: "skip" },
            fetch: { kind: "skip" },
            push: { kind: "skip" },
          },
        },
      },
    },
    push: {
      kind: "object",
      optional: true,
      fields: {
        name: {
          kind: "string",
          format: "%(if)%(upstream)%(then)%(push:lstrip=3)%(else)%00%(end)",
        },
        remote: {
          kind: "object",
          fields: {
            name: {
              kind: "string",
              format: "%(if)%(push)%(then)%(push:remotename)%(else)%00%(end)",
            },
            fetch: { kind: "skip" },
            push: { kind: "skip" },
          },
        },
        branch: {
          kind: "object",
          optional: true,
          fields: {
            name: {
              kind: "string",
              format: "%(if)%(push)%(then)%(push:short)%(else)%00%(end)",
            },
            commit: { kind: "skip" },
            fetch: { kind: "skip" },
            push: { kind: "skip" },
          },
        },
      },
    },
  },
} satisfies FormatDescriptor<Branch>;

const COMMIT_FORMAT: FormatDescriptor<Commit> = {
  delimiter: "<%H>",
  kind: "object",
  fields: {
    hash: { kind: "string", format: "%H" },
    short: { kind: "string", format: "%h" },
    parent: {
      kind: "object",
      optional: true,
      fields: {
        hash: {
          kind: "string",
          format: "%P",
          transform: (value) => value ? value : "\x00",
        },
        short: {
          kind: "string",
          format: "%p",
          transform: (value) => value ? value : "\x00",
        },
      },
    },
    author: {
      kind: "object",
      fields: {
        name: { kind: "string", format: "%an" },
        email: { kind: "string", format: "%ae" },
      },
    },
    committer: {
      kind: "object",
      fields: {
        name: { kind: "string", format: "%cn" },
        email: { kind: "string", format: "%ce" },
      },
    },
    subject: { kind: "string", format: "%s" },
    body: {
      kind: "string",
      optional: true,
      format: "%b%x00%(trailers)",
      transform: parseBody,
    },
    trailers: {
      kind: "string",
      optional: true,
      format: "%(trailers:only=true,unfold=true,key_value_separator=: )",
      transform: parseTrailers,
    },
  },
} satisfies FormatDescriptor<Commit>;

const TAG_FORMAT: FormatDescriptor<Tag> = {
  delimiter: "<%(objectname)>",
  kind: "object",
  fields: {
    name: {
      kind: "string",
      format: "%(refname:short)",
    },
    commit: {
      kind: "object",
      fields: {
        hash: {
          kind: "string",
          format: "%(if)%(object)%(then)%(object)%(else)%(objectname)%(end)",
        },
        short: { kind: "skip" },
        author: { kind: "skip" },
        committer: { kind: "skip" },
        subject: { kind: "skip" },
        body: { kind: "skip" },
        trailers: { kind: "skip" },
      },
    },
    tagger: {
      kind: "object",
      optional: true,
      fields: {
        name: {
          kind: "string",
          format: "%(if)%(object)%(then)%(taggername)%(else)%00%(end)",
        },
        email: {
          kind: "string",
          format: "%(if)%(object)%(then)%(taggeremail:trim)%(else)%00%(end)",
        },
      },
    },
    subject: {
      kind: "string",
      optional: true,
      format: "%(if)%(object)%(then)%(subject)%(else)%00%(end)",
    },
    body: {
      kind: "string",
      optional: true,
      format: "%(if)%(object)%(then)%(body)%00%(trailers)%(else)%00%(end)",
      transform: parseBody,
    },
    trailers: {
      kind: "string",
      optional: true,
      format: "%(if)%(trailers)%(then)%(trailers)%(else)%00%(end)",
      transform: parseTrailers,
    },
  },
} satisfies FormatDescriptor<Tag>;

function formatFields<T>(format: FormatFieldDescriptor<T>): string[] {
  if (format.kind === "skip") return [];
  if (format.kind === "object") {
    return Object.values(mapValues(format.fields, (field) => {
      return formatFields(field);
    })).flat();
  }
  return [format.format];
}

function formatArg<T>(format: FormatDescriptor<T>): string {
  // the object hash cannot collide with the object
  const delimiter = format.delimiter;
  const formats = formatFields(format);
  return `${delimiter}!${formats.join(delimiter)}${delimiter}`;
}

function formattedObject<T>(
  format: FormatFieldDescriptor<T>,
  parts: string[],
): [Partial<T> | undefined, string | undefined, number] {
  if (format.kind === "skip") return [undefined, undefined, 0];
  if (format.kind === "object") {
    const parsed: Record<string, string> = {};
    const result: Record<string, unknown> = {};
    const length = Object.values(mapValues(format.fields, (field, key) => {
      const [value, raw, length] = formattedObject(field, parts);
      if (value !== undefined) result[key] = value;
      if (raw !== undefined) parsed[key] = raw;
      return length;
    })).reduce((a, b) => a + b, 0);
    if (
      format.optional &&
      Object.values(result).every((v) =>
        v === undefined || v === "\x00" ||
        (v && typeof v === "object" && Object.keys(v).length === 0)
      )
    ) {
      return [undefined, undefined, length];
    }
    return [result as Partial<T>, undefined, length];
  }
  const value = parts.shift();
  assertExists(value, "Cannot parse git output");
  if (value === "\x00") return [undefined, value, value.length];
  const result = ("transform" in format) ? format.transform(value) : value as T;
  return [result, value, value.length];
}

function parseOutput<T>(
  format: FormatDescriptor<T>,
  output: string,
): Partial<T>[] {
  const result: Partial<T>[] = [];
  const fields = formatFields(format);
  while (output.length) {
    const delimiterEnd = output.indexOf("!");
    assertGreater(delimiterEnd, 0, "Cannot parse git output");
    const delimiter = output.slice(0, delimiterEnd);
    output = output.slice(delimiter.length + 1);
    const parts = output.split(delimiter, fields.length);
    assertEquals(parts.length, fields.length, "Cannot parse git output");
    assertFalse(parts.some((p) => p === undefined), "Cannot parse git output");
    const [object, _, length] = formattedObject(format, parts);
    assertExists(object, "Cannot parse git output");
    result.push(object);
    output = output.slice(length + (fields.length) * delimiter.length)
      .trimStart();
  }
  return result;
}

function parseBody(content: string) {
  let [body, trailers] = content.split("\x00", 2);
  if (body !== undefined) {
    if (trailers) body = body.slice(0, -trailers.length);
    body = body?.trimEnd();
  }
  if (!body) return undefined;
  return body;
}

function parseTrailers(trailers: string) {
  if (!trailers) return undefined;
  return trailers.split("\n").reduce((trailers, line) => {
    const [key, value] = line.split(": ", 2);
    if (key) trailers[key.trim()] = value?.trim() || "";
    return trailers;
  }, {} as Record<string, string>);
}

async function hydrate<T, P extends keyof T, K extends keyof NonNullable<T[P]>>(
  [object, property, key]: [Partial<T> | undefined, P, K],
  fn: (from: NonNullable<NonNullable<T[P]>[K]>) => Promise<T[P] | undefined>,
): Promise<void> {
  if (object === undefined) return;
  const field = object[property];
  if (field === undefined || field === null) return;
  const from = field[key];
  const value = from !== undefined && from !== null
    ? await fn(from)
    : undefined;
  if (value !== undefined) object[property] = value;
  else delete object[property];
}

interface PatchTransform {
  pattern: RegExp;
  apply(patch: Partial<Patch>, value: string): void;
}

const PATCH_HEADER_TRANSFORMS: PatchTransform[] = [
  {
    pattern: /^diff --git (.+)$/m,
    apply(patch, value) {
      if (
        value.length % 2 === 1 &&
        value.slice(0, value.length / 2) ===
          value.slice(value.length / 2 + 1)
      ) {
        patch.path ??= value.slice(0, value.length / 2);
        patch.status ??= "modified";
      }
    },
  },
  {
    pattern: /^\+\+\+ (.+)$/,
    apply(patch, value) {
      if (value !== "/dev/null") patch.path ??= value;
      else patch.status ??= "deleted";
    },
  },
  {
    pattern: /^--- (.+)$/,
    apply(patch, value) {
      if (value !== "/dev/null") patch.path ??= value;
      else patch.status ??= "added";
    },
  },
  {
    pattern: /^index \S+ (\d+)$/,
    apply(patch, value) {
      patch.mode ??= {};
      patch.mode.new = parseInt(value, 8);
    },
  },
  {
    pattern: /^old mode (\d+)$/,
    apply(patch, value) {
      patch.mode ??= {};
      patch.mode.old = parseInt(value, 8);
    },
  },
  {
    pattern: /^new mode (\d+)$/,
    apply(patch, value) {
      patch.mode ??= {};
      patch.mode.new = parseInt(value, 8);
    },
  },
  {
    pattern: /^new file mode (\d+)$/,
    apply(patch, value) {
      patch.mode ??= {};
      patch.mode.new = parseInt(value, 8);
      patch.status = "added";
    },
  },
  {
    pattern: /^deleted file mode (\d+)$/,
    apply(patch, value) {
      patch.mode ??= {};
      patch.mode.old = parseInt(value, 8);
      patch.status = "deleted";
    },
  },
  {
    pattern: /^similarity index (\d+)%$/,
    apply(patch, value) {
      patch.from = {
        path: patch.from?.path ?? "",
        similarity: parseInt(value, 10) / 100,
      };
    },
  },
  {
    pattern: /^rename from (.+)$/,
    apply(patch, value) {
      patch.from = {
        path: value,
        similarity: patch.from?.similarity ?? 0,
      };
      patch.status = "renamed";
    },
  },
  {
    pattern: /^rename to (.+)$/,
    apply(patch, value) {
      patch.path = value;
      patch.status = "renamed";
    },
  },
  {
    pattern: /^copy from (.+)$/,
    apply(patch, value) {
      patch.from = {
        path: value,
        similarity: patch.from?.similarity ?? 0,
      };
      patch.status = "copied";
    },
  },
  {
    pattern: /^copy to (.+)$/,
    apply(patch, value) {
      patch.path = value;
      patch.status = "copied";
    },
  },
];
