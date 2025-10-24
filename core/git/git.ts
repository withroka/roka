/**
 * A library for interacting with local Git repositories.
 *
 * This package provides incomplete functionality to run
 * {@link https://git-scm.com git} commands. It is intended to be used for
 * simple operations like creating commits, tags, and pushing to remotes.
 *
 * The main module provides the {@linkcode git} function that exposes git
 * operations, as well as the {@linkcode Commit}, {@linkcode Tag}, and similar
 * git objects.
 *
 * All options adhere to default Git configurations and behaviors. If an option
 * is explicitly set, it will override any corresponding Git configuration.
 * Similarly, omitted option can potentially be configured externally, even if
 * a default is specified in the documentation.
 *
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const repo = git();
 *   const branch = await repo.branches.current();
 *   if (branch?.name === "main") {
 *     await repo.branches.checkout({ new: "feature" });
 *   }
 *   await Deno.writeTextFile(repo.path("file.txt"), "content");
 *   await repo.index.add("file.txt");
 *   await repo.commits.create("Initial commit");
 *   await repo.tags.create("v1.0.0");
 * });
 * ```
 *
 * ## Submodules
 *
 *  -  {@link [conventional]}: Work with
 *     {@link https://www.conventionalcommits.org Conventional Commits}.
 *  -  {@link [testing]}: Write tests using temporary git repositories.
 *
 * @todo Extend `git().config.set()` with more configurations.
 * @todo Add `git().config.get()`
 * @todo Add stash management.
 * @todo Add `git().branches.copy()`
 * @todo Add `git().branches.move()`
 * @todo Add `git().branches.track()`
 * @todo Handle merges, rebases, conflicts.
 * @todo Handle submodules.
 * @todo Expose dates.
 * @todo Verify signatures.
 * @todo Add pruning.
 *
 * @module git
 */

import {
  assertEquals,
  assertExists,
  assertFalse,
  assertGreater,
} from "@std/assert";
import { mapValues, slidingWindows } from "@std/collections";
import { join, normalize, resolve } from "@std/path";

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
  /**
   * Initializes a new git repository.
   *
   * @returns The initialized repository.
   */
  init(options?: InitOptions): Promise<Git>;
  /**
   * Clones a remote repository.
   *
   * @returns The cloned repository.
   */
  clone(url: string, options?: CloneOptions): Promise<Git>;
  /** Config operations. */
  config: {
    /** Configures repository options. */
    set(config: Config): Promise<void>;
  };
  /** Branch operations. */
  branches: Branches;
  /** Ignore (exclusion) operations. */
  ignore: Ignore;
  /** Index (staged area) operations. */
  index: Index;
  /** Difference (diff) operations. */
  diff: Diff;
  /** Commit operations. */
  commits: Commits;
  /** Tag operations. */
  tags: Tags;
  /** Remote operations. */
  remotes: Remotes;
}

/** Branch operations from {@linkcode Git.branches}. */
export interface Branches {
  /** Creates a branch. */
  create(name: string): Promise<Branch>;
  /** Returns the current branch name. */
  current(): Promise<Branch | undefined>;
  /** List branches in the repository alphabetically. */
  list(options?: BranchListOptions): Promise<Branch[]>;
  /** Renames a branch. */
  rename(
    branch: string | Branch,
    newName: string,
    options?: BranchRenameOptions,
  ): Promise<Branch>;
  /** Deletes a branch. */
  delete(branch: string | Branch, options?: BranchDeleteOptions): Promise<void>;
  /** Switches to a commit, or an existing or new branch. */
  checkout(options?: BranchCheckoutOptions): Promise<Branch | undefined>;
}

/** Ignore operations from {@linkcode Git.ignore}. */
export interface Ignore {
  /** Checks paths against gitignore list and returns the ignored patterns. */
  check(
    path: string | string[],
    options?: IgnoreCheckOptions,
  ): Promise<string[]>;
}

/** Index operations from {@linkcode Git.index}. */
export interface Index {
  /** Stages files for commit. */
  add(path: string | string[], options?: IndexAddOptions): Promise<void>;
  /** Move or rename a file, a directory, or a symlink. */
  move(
    source: string | string[],
    destination: string,
    options?: IndexMoveOptions,
  ): Promise<void>;
  /** Removes files or directories from the working tree and index. */
  remove(
    path: string | string[],
    options?: IndexRemoveOptions,
  ): Promise<void>;
  /** Returns the status of the index and the local working tree. */
  status(options?: IndexStatusOptions): Promise<Status>;
}

/** Difference operations from {@linkcode Git.diff}. */
export interface Diff {
  /** Returns the list of changed file paths with their status. */
  status(options?: DiffOptions): Promise<TrackedPathStatus[]>;
  /** Returns the patch text for changes. */
  patch(options?: DiffPatchOptions): Promise<Patch[]>;
}

/** Commit operations from {@linkcode Git.commits}. */
export interface Commits {
  /** Creates a new commit in the repository. */
  create(summary: string, options?: CommitCreateOptions): Promise<Commit>;
  /** Returns the commit at the tip of `HEAD`. */
  head(): Promise<Commit>;
  /** Returns the history of commits in the repository. */
  log(options?: CommitLogOptions): Promise<Commit[]>;
  /** Pushes commits to a remote. */
  push(options?: CommitPushOptions): Promise<void>;
  /** Pulls commits and tags from a remote. */
  pull(options?: CommitPullOptions): Promise<void>;
}

/** Tag operations from {@linkcode Git.tags}. */
export interface Tags {
  /** Creates a new tag in the repository. */
  create(name: string, options?: TagCreateOptions): Promise<Tag>;
  /** Lists all tags in the repository. */
  list(options?: TagListOptions): Promise<Tag[]>;
  /** Pushes a tag to a remote. */
  push(tag: Tag | string, options?: TagPushOptions): Promise<void>;
}

/**
 * Remote operations from {@linkcode Git.remotes}.
 *
 * Default remote name is `"origin"` for all remote methods.
 */
export interface Remotes {
  /** Returns the remote repository URL. */
  get(name?: string): Promise<Remote>;
  /** Adds a remote to the repository. */
  add(url: string, name?: string): Promise<Remote>;
  /** Queries the default branch on the remote. */
  defaultBranch(name?: string): Promise<string | undefined>;
}

/** Configuration for a git repository. */
export interface Config {
  /** Commit configuration. */
  commit?: {
    /** Whether to sign commits. */
    gpgsign?: boolean;
  };
  /** Diff configuration. */
  diff?: {
    /** Whether to detect renames and copies. */
    renames?: boolean | "copies";
  };
  /** Init configuration. */
  init?: {
    /** Default branch name. */
    defaultBranch?: string;
  };
  /** Status configuration. */
  status?: {
    /** Whether to detect renames and copies. */
    renames?: boolean | "copies";
  };
  /** Tag configuration. */
  tag?: {
    /** Whether to sign tags. */
    gpgsign?: boolean;
  };
  /** Trailer configuration. */
  trailer?: {
    /** Separator between key and value in trailers. */
    separators?: string;
  };
  /** User configuration. */
  user?: Partial<User> & {
    /** GPG key for signing commits. */
    signingkey?: string;
  };
  /** Configuration for 'version' sort for tags. */
  versionsort?: {
    /**
     * Pre-release suffixes.
     *
     * If a suffix defined here is found in a tag, it is considered a
     * pre-release version. For example, if `["-pre"]` is defined, `v1.0.0-pre`
     * is considered a pre-release version.
     *
     * For multiple suffixes, the order defined here defines the tag order.
     * For example `["-pre", "-rc"]` will cause the `v1.0.0-pre` release to be
     * earlier than `v1.0.0-rc`.
     */
    suffix: string[];
  };
}

/** An author or committer on a git repository. */
export interface User {
  /** Name of the user. */
  name: string;
  /** E-mail of the user. */
  email: string;
}

/** A branch in a git repository. */
export interface Branch {
  /** Short name of the branch. */
  name: string;
  /** Remote push branch name, if set. */
  push?: string;
  /** Remote upstream branch name, if set. */
  upstream?: string;
  /** Commit at the tip of the branch, if branch has any commits. */
  commit?: Commit;
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

/** Status of an untracked or ignored file in the index and the working tree. */
export interface UntrackedPathStatus {
  /** Path to the file. */
  path: string;
}

/** A patch for a file returned by the {@linkcode Diff.patch} function. */
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

/** A single hunk in a patch returned by the {@linkcode Diff.patch} function. */
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
  /** Commit summary, the first line of the commit message. */
  summary: string;
  /** Commit body, excluding the first line and trailers from the message. */
  body?: string;
  /** Trailer values at the end of the commit message. */
  trailers: Record<string, string>;
  /** Author, who wrote the code. */
  author: User;
  /** Committer, who created the commit. */
  committer: User;
}

/** A tag in a git repository. */
export interface Tag {
  /** Tag name. */
  name: string;
  /** Commit that is tagged. */
  commit: Commit;
  /** Tag subject from tag message. */
  subject?: string;
  /** Tag body from tag message. */
  body?: string;
  /** Tagger, who created the tag. */
  tagger?: User;
}

/** A ref that points to a commit object in a git repository. */
export type Commitish = Commit | Branch | Tag | string;

/** A remote tracked in a git repository. */
export interface Remote {
  /** Remote name. */
  name: string;
  /** Remote fetch URL. */
  fetchUrl: string;
  /** Remote push URL. */
  pushUrl: string;
}

/** A revision range over commit history in a git repository. */
export interface RevisionRange {
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
   * Ignored if either {@linkcode RevisionRange.from} or
   * {@linkcode RevisionRange.to} is not set.
   *
   * @default {false}
   */
  symmetric?: boolean;
}

/** Options for the {@linkcode git} function. */
export interface GitOptions {
  /**
   * Change the working directory for git commands.
   * @default {"."}
   */
  cwd?: string;
  /**
   * Git configuration options for each executed git command.
   *
   * These will override repository or global configurations.
   */
  config?: Config;
}

/** Options for the {@linkcode Git.init} and {@linkcode Git.clone} functions. */
export interface InitOptions {
  /**
   * Create a bare repository.
   * @default {false}
   */
  bare?: boolean;
  /**
   * Name of the initial branch.
   *
   * Creates a new branch with this name for {@linkcode Git.init} and checks
   * out this branch for {@linkcode Git.clone}.
   *
   * Default is `main`, if not overridden with Git configuration.
   */
  branch?: string;
}

/** Options for the {@linkcode Git.clone} function. */
export interface CloneOptions extends InitOptions, RemoteOptions {
  /**
   * Set config for the new repository, after initialization, but before
   * fetch.
   */
  config?: Config;
  /**
   * Number of commits to clone at the tip.
   *
   * Implies {@linkcode CloneOptions.singleBranch singleBranch}, unless it is
   * set to `false` to fetch from the tip of all branches.
   */
  depth?: number;
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
   * Bypasses local transport optimization when set to `false`.
   *
   * When the remote repository is specified as a URL, this is ignored.
   * Otherwise, it is implied.
   */
  local?: boolean;
  /**
   * Clone only the tip of a single branch.
   *
   * The cloned branch is either remote `HEAD` or
   * {@linkcode InitOptions.branch}.
   */
  singleBranch?: boolean;
  /**
   * Fetch tags.
   * @default {true}
   */
  tags?: boolean;
}

/** Options for the {@linkcode Branches.list} function. */
export interface BranchListOptions extends RefListOptions {
  /**
   * Include remote branches.
   * @default {false}
   */
  all?: boolean;
  /**
   * Only remote branches.
   *
   * Implies {@linkcode BranchListOptions.all all} to be `true`.
   *
   * @default {false}
   */
  remotes?: boolean;
}

/** Options for the {@linkcode Branches.checkout} function. */
export interface BranchCheckoutOptions {
  /**
   * Checkout at the given commit or branch.
   *
   * A commit target implies {@linkcode BranchCheckoutOptions.detach} to be
   * `true`.
   *
   * @default {"HEAD"}
   */
  target?: Commitish;
  /** Branch to create and checkout during checkout. */
  new?: string;
  /**
   * Detach `HEAD` during checkout from the target branch.
   * @default {false}
   */
  detach?: boolean;
}

/** Options for the {@linkcode Branches.rename} function. */
export interface BranchRenameOptions {
  /**
   * Force rename the branch.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode Branches.delete} function. */
export interface BranchDeleteOptions {
  /**
   * Force delete the branch.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode Ignore.check} function. */
export interface IgnoreCheckOptions {
  /**
   * Return paths that match the ignore list.
   *
   * If set to `false`, returns paths that do not match the ignore list instead.
   *
   * @default {true}
   */
  matching?: boolean;
  /**
   * Look in the index when undertaking the checks.
   * @default {true}
   */
  index?: boolean;
}

/** Options for the {@linkcode Index.add} function. */
export interface IndexAddOptions {
  /**
   * Add files to the index, even if they are ignored.
   * @default {false}
   */
  force?: boolean;
  /**
   * Override the executable bit of the file.
   *
   * If set, the file mode in the file sytem is ignored, and the executable bit
   * is set to the given value.
   */
  executable?: boolean;
}

/** Options for the {@linkcode Index.move} function. */
export interface IndexMoveOptions {
  /**
   * Move files, even if the destination file already exists.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode Index.remove} function. */
export interface IndexRemoveOptions {
  /**
   * Remove files, even if they have local modifications.
   * @default {false}
   */
  force?: boolean;
}

/** Options for the {@linkcode Index.status} function. */
export interface IndexStatusOptions {
  /**
   * Limit the status to the given pathspecs.
   *
   * If not set, all files are included.
   */
  path?: string | string[];
  /**
   * Control the status output for untracked files.
   *
   * If set to `false`, untracked files are not included. If set to `true`,
   * untracked directories are included, but their files are not listed. If set
   * to `"all"`, all untracked files are included.
   *
   * @default {true}
   */
  untracked?: boolean | "all";
  /**
   * Control the status output for ignored files.
   *
   * If set to `true`, ignored files and directories are included. In
   * this mode, files under ignored directories are shown if
   * {@linkcode IndexStatusOptions.untracked untracked} is set to `"all"`. If
   * set to `false`, ignored files are not included.
   *
   * @default {false}
   */
  ignored?: boolean;
  /**
   * Control the status output for renamed files.
   *
   * If set to `true`, renamed files are included. If set to `false`, rename
   * detection is turned off, and paths are listed separately as `"added"` and
   * `"deleted"`.
   *
   * @default {true}
   */
  renames?: boolean;
}

/**
 * Options for the {@linkcode Diff.status} and {@linkcode Diff.patch}
 * functions.
 */
export interface DiffOptions {
  /**
   * Limit the diff to the given pathspecs.
   *
   * If directories are given, all files under those directories are included.
   *
   * If not set, all files are included.
   */
  path?: string | string[];
  /**
   * Diff staged changes, instead of changes in the working tree.
   *
   * @default {false}
   */
  staged?: boolean;
  /**
   * Control the diff output for renamed files.
   *
   * If set to `true`, renamed files are included. If set to `false`, rename
   * detection is turned off, and paths are listed separately as `"added"` and
   * `"deleted"`.
   *
   * @default {true}
   */
  renames?: boolean;
  /**
   * Control the diff output for copied files.
   *
   * If set to `true`, copy detection is enabled, and copies are listed as
   * such. If set to `false`, copies are listed as added files, unless the
   * behavior is overridden with Git configuration.
   *
   * @default {false}
   */
  copies?: boolean;
  /**
   * Target commit to diff against.
   *
   * If set to `HEAD`, diffs the working tree or index against the last commit.
   */
  target?: Commitish;
  /** Revision range to diff against. */
  range?: RevisionRange;
}

/** Options for the {@linkcode Diff.patch} function. */
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

/** Options for the {@linkcode Commits.create} function. */
export interface CommitCreateOptions extends SignOptions {
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
  /** Amend the last commit. */
  amend?: boolean;
  /** Author who wrote the code. */
  author?: User | undefined;
  /** Commit body to append to the message.   */
  body?: string;
  /** Trailers to append to the commit message. */
  trailers?: Record<string, string>;
}

/** Options for the {@linkcode Commits.log} function. */
export interface CommitLogOptions {
  /** Only commits by an author. */
  author?: User;
  /** Only commits by a committer. */
  committer?: User;
  /** Only commits that modified any of the given paths. */
  path?: string | string[];
  /** Only commits in a range. */
  range?: RevisionRange;
  /** Maximum number of commits to return. */
  maxCount?: number;
  /** Number of commits to skip. */
  skip?: number;
  /** Only commits that either deleted or added the given text. */
  text?: string;
}

/** Options for the {@linkcode Git.commits.push} function. */
export interface CommitPushOptions extends TransportOptions, RemoteOptions {
  /** Remote branch to push to. The default is the current branch. */
  branch?: string | Branch;
  /** Force push to remote. */
  force?: boolean;
}

/** Options for the {@linkcode Commits.pull} function. */
export interface CommitPullOptions
  extends RemoteOptions, TransportOptions, SignOptions {
  /** Remote branch to pull from. The default is the tracked remote branch. */
  branch?: string | Branch;
}

/** Options for the {@linkcode Tags.create} function. */
export interface TagCreateOptions extends SignOptions {
  /**
   * Target reference (commit, branch, or tag) to tag.
   * @default {"HEAD"}
   */
  target?: Commitish;
  /** Tag message subject. */
  subject?: string;
  /** Tag message body. */
  body?: string;
  /** Replace existing tags instead of failing. */
  force?: boolean;
}

/** Options for the {@linkcode Tags.list} function. */
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
   *   config: { versionsort: { suffix: ["-pre", "-rc"] } },
   * });
   *
   * await repo.commits.create("summary", { allowEmpty: true });
   * await repo.tags.create("v1.0.0");
   * await repo.tags.create("v2.0.0");
   * await repo.tags.create("v2.0.0-pre");
   * await repo.tags.create("v2.0.0-rc");
   * const tags = await repo.tags.list({ sort: "version" });
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

/** Options for the {@linkcode Tags.push} function. */
export interface TagPushOptions extends RemoteOptions {
  /** Force push to remote. */
  force?: boolean;
}

/**
 * Options common to the {@linkcode Branches.list} and {@linkcode Tags.list}
 * functions for ref filtering.
 */
export interface RefListOptions {
  /** Ref selection pattern. The default is all relevant refs. */
  name?: string;
  /** Only refs that contain the specific commit. */
  contains?: Commitish;
  /** Only refs that do not contain the specific commit. */
  noContains?: Commitish;
  /** Only refs that point to the given commit. */
  pointsAt?: Commitish;
}

/**
 * Options common to operations that work with remotes (e.g.
 * {@linkcode Commits.push}).
 */
export interface RemoteOptions {
  /**
   * Remote name.
   * @default {"origin"}
   */
  remote?: string;
}

/**
 * Options common to {@linkcode Commits.create} and {@linkcode Tags.create} for
 * GPG signing.
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
 * Options common to {@linkcode Commits.push} and {@linkcode Commits.pull} for
 * controlling what is updated in repositories.
 */
export interface TransportOptions {
  /** Either update all refs on the other side or don't update any.*/
  atomic?: boolean;
  /** Copy all tags.
   *
   * During pull, git only fetches tags that point to the downloaded objects.
   * When this value is set to `true`, all tags are fetched. When it is set to
   * `false`, no tags are fetched.
   *
   * During push, no tags are pushed by default. When this value is set to
   * `true`, all tags are pushed.
   */
  tags?: boolean;
}

/**
 * Creates a new {@linkcode Git} instance for a local repository for running
 * git operations.
 *
 * @example Retrieve the current branch name.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const branch = await git().branches.current();
 *   return { branch };
 * });
 * ```
 *
 * @example Retrieve the last commit in a repository.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const commit = await git().commits.head();
 *   return { commit };
 * });
 * ```
 *
 * @example List all tags in a repository.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const tags = await git().tags.list();
 *   return { tags };
 * });
 * ```
 *
 * @example Retrieve the default branch name from origin.
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const branch = await git().remotes.defaultBranch();
 *   return { branch };
 * });
 * ```
 *
 * @example Create a new git repository and add a file.
 * ```ts
 * import { git } from "@roka/git";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertEquals } from "@std/assert";
 *
 * await using directory = await tempDirectory();
 * const repo = git({ cwd: directory.path() });
 * await repo.init();
 * await repo.config.set({ user: { name: "name", email: "email" } });
 *
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.index.add("file.txt");
 * assertEquals(
 *   await repo.diff.status({ staged: true }),
 *   [{ path: "file.txt", status: "added" }],
 * );
 * const commit = await repo.commits.create("Initial commit", { sign: false });
 * assertEquals(await repo.commits.log(), [commit]);
 *
 * await Deno.writeTextFile(repo.path("file.txt"), "update");
 * assertEquals(
 *   await repo.diff.status(),
 *   [{ path: "file.txt", status: "modified" }],
 * );
 * ```
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
        gitOptions,
        "init",
        flag("--bare", options?.bare),
        flag("--initial-branch", options?.branch),
      );
      return repo;
    },
    async clone(url, options) {
      const output = await run(
        { ...gitOptions, stderr: true },
        ["clone", url],
        configFlags(options?.config, "--config").flat(),
        flag("--bare", options?.bare),
        flag("--depth", options?.depth),
        flag(["--local", "--no-local"], options?.local),
        flag("--origin", options?.remote),
        flag("--branch", options?.branch),
        flag(["--single-branch", "--no-single-branch"], options?.singleBranch),
        options?.directory,
      );
      const match = output.match(
        /Cloning into '(?<directory>.+?)'...(?:.|\n)*/,
      );
      assertExists(
        match?.groups?.directory,
        "Cannot determine cloned directory",
      );
      const cwd = resolve(
        directory,
        options?.directory ?? match.groups.directory,
      );
      return git({ ...gitOptions, cwd });
    },
    config: {
      async set(config) {
        for (const cfg of configFlags(config)) {
          // deno-lint-ignore no-await-in-loop
          await run(gitOptions, "config", cfg);
        }
      },
    },
    branches: {
      async current() {
        const name = await run(gitOptions, "branch", "--show-current");
        if (!name) return undefined;
        const [branch] = await repo.branches.list({ name });
        return branch ? branch : { name };
      },
      async list(options) {
        const output = await run(
          gitOptions,
          ["branch", "--list", `--format=${formatArg(BRANCH_FORMAT)}`],
          options?.name,
          flag("--all", options?.all),
          flag("--remotes", options?.remotes),
          flag("--contains", commitArg(options?.contains)),
          flag("--no-contains", commitArg(options?.noContains)),
          flag("--points-at", commitArg(options?.pointsAt)),
        );
        const branches = parseOutput(BRANCH_FORMAT, output);
        return await Promise.all(
          branches
            .filter((branch) => !branch?.name?.includes(" "))
            .map(async (branch) => {
              assertExists(branch.name, "Branch name not filled");
              let commit: Commit | undefined = undefined;
              if (branch.commit?.hash) {
                [commit] = await repo.commits.log({
                  maxCount: 1,
                  range: { to: branch.commit.hash },
                });
              }
              const name: string = branch.name;
              return { ...branch, name, ...commit && { commit } };
            }),
        );
      },
      async checkout(options) {
        await run(
          gitOptions,
          "checkout",
          flag("--detach", options?.detach),
          flag("-b", options?.new),
          commitArg(options?.target),
        );
        return repo.branches.current();
      },
      async create(name) {
        await run(gitOptions, "branch", name);
        const [branch] = await repo.branches.list({ name });
        return branch ? branch : { name };
      },
      async rename(branch, newName, options) {
        const name = typeof branch === "string" ? branch : branch.name;
        await run(
          gitOptions,
          ["branch", "-m", name, newName],
          flag("--force", options?.force),
        );
        const [newBranch] = await repo.branches.list({ name: newName });
        return newBranch ? newBranch : { name: newName };
      },
      async delete(branch, options) {
        const name = typeof branch === "string" ? branch : branch.name;
        await run(
          gitOptions,
          ["branch", name],
          flag(["-D", "-d"], options?.force ?? false),
        );
      },
    },
    ignore: {
      async check(path, options) {
        if (typeof path === "string") path = [path];
        if (path.length === 0) return [];
        const output = await run(
          { ...gitOptions, allowCode: [1] },
          "check-ignore",
          path,
          flag("--verbose", options?.matching === false),
          flag("--non-matching", options?.matching === false),
          flag("--no-index", options?.index === false),
        );
        return output.split("\n")
          .map((line) =>
            (options?.matching !== false)
              ? line
              : (line.startsWith("::") ? (line.split("\t").at(-1) ?? "") : "")
          )
          .filter((line) => line);
      },
    },
    index: {
      async add(path, options?: IndexAddOptions) {
        await run(
          gitOptions,
          "add",
          path,
          flag("--force", options?.force),
          flag(["--chmod=+x", "--chmod=-x"], options?.executable),
        );
      },
      async move(source, destination, options?: IndexMoveOptions) {
        await run(
          gitOptions,
          "mv",
          source,
          destination,
          flag("--force", options?.force),
        );
      },
      async remove(path, options?: IndexRemoveOptions) {
        await run(
          gitOptions,
          "rm",
          path,
          flag("--force", options?.force),
        );
      },
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
          flag("--", options?.path),
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
    },
    diff: {
      async status(options) {
        const output = await run(
          gitOptions,
          ["diff", "--name-status", "-z"],
          commitArg(options?.target),
          rangeArg(options?.range),
          flag("--cached", options?.staged),
          flag(["--find-renames", "--no-renames"], options?.renames),
          flag("--find-copies", options?.copies),
          flag("--", options?.path),
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
          ["diff", "--no-color", "--no-prefix"],
          commitArg(options?.target),
          rangeArg(options?.range),
          flag("--cached", options?.staged),
          flag(["--find-renames", "--no-renames"], options?.renames),
          flag("--find-copies-harder", options?.copies),
          flag("--diff-algorithm", options?.algorithm),
          flag(`--unified=${options?.unified}`, options?.unified !== undefined),
          flag("--", options?.path),
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
    commits: {
      async create(summary, options) {
        const output = await run(
          gitOptions,
          "commit",
          flag("-m", summary),
          flag("-m", options?.body),
          trailerFlag(options?.trailers),
          flag("--all", options?.all),
          flag("--allow-empty", options?.allowEmpty),
          flag("--amend", options?.amend),
          flag("--author", userArg(options?.author)),
          signFlag("commit", options?.sign),
        );
        const hash = output.match(/^\[.+ (?<hash>[0-9a-f]+)\]/)?.groups?.hash;
        assertExists(hash, "Cannot find created commit");
        const [commit] = await repo.commits.log({
          maxCount: 1,
          range: { to: hash },
        });
        assertExists(commit, "Cannot find created commit");
        return commit;
      },
      async head() {
        const [commit] = await repo.commits.log({ maxCount: 1 });
        assertExists(commit, "No HEAD commit.");
        return commit;
      },
      async log(options) {
        const output = await run(
          gitOptions,
          ["log", `--format=${formatArg(LOG_FORMAT)}`],
          flag("--author", userArg(options?.author)),
          flag("--committer", userArg(options?.committer)),
          flag("--max-count", options?.maxCount),
          flag("--skip", options?.skip),
          flag("--pickaxe-regex", options?.text !== undefined),
          flag("-S", options?.text),
          flag("--", options?.path),
          rangeArg(options?.range),
        );
        return parseOutput(LOG_FORMAT, output) as Commit[];
      },
      async push(options) {
        const branch = typeof options?.branch === "string"
          ? options?.branch
          : options?.branch?.name;
        await run(
          gitOptions,
          ["push", options?.remote ?? "origin"],
          branch,
          flag(["--atomic", "--no-atomic"], options?.atomic),
          flag("--force", options?.force),
          flag("--tags", options?.tags),
        );
      },
      async pull(options) {
        const branch = typeof options?.branch === "string"
          ? options?.branch
          : options?.branch?.name;
        await run(
          gitOptions,
          ["pull", options?.remote ?? "origin"],
          branch,
          flag("--atomic", options?.atomic),
          flag(["--tags", "--no-tags"], options?.tags),
          signFlag("commit", options?.sign),
        );
      },
    },
    tags: {
      async create(name, options): Promise<Tag> {
        await run(
          gitOptions,
          ["tag", name],
          commitArg(options?.target),
          flag("-m", options?.subject),
          flag("-m", options?.body),
          flag("--force", options?.force),
          signFlag("tag", options?.sign),
        );
        const [tag] = await repo.tags.list({ name });
        assertExists(tag, "Cannot find created tag");
        return tag;
      },
      async list(options?: TagListOptions) {
        const output = await run(
          gitOptions,
          ["tag", "--list", `--format=${formatArg(TAG_FORMAT)}`],
          options?.name,
          flag("--contains", commitArg(options?.contains)),
          flag("--no-contains", commitArg(options?.noContains)),
          flag("--points-at", commitArg(options?.pointsAt)),
          flag("--sort=-version:refname", options?.sort === "version"),
        );
        const tags = parseOutput(TAG_FORMAT, output);
        return await Promise.all(tags.map(async (tag) => {
          assertExists(tag.name, "Tag name not filled");
          assertExists(tag.commit?.hash, "Commit hash not filled for tag");
          const [commit] = await repo.commits.log({
            maxCount: 1,
            range: { to: tag.commit.hash },
          });
          assertExists(commit, "Cannot find commit for tag");
          const name: string = tag.name;
          return { ...tag, name, commit };
        }));
      },
      async push(tag: Tag | string, options?: TagPushOptions) {
        await run(
          gitOptions,
          ["push", options?.remote ?? "origin", "tag"],
          tagArg(tag),
          flag("--force", options?.force),
        );
      },
    },
    remotes: {
      async get(name = "origin") {
        const remotes = (await run(gitOptions, "remote"))
          .split("\n").filter((x) => x);
        if (!remotes.includes(name)) throw new GitError("Remote not found");
        const info = await run(gitOptions, ["remote", "show", "-n", name]);
        const match = info.match(
          /\n\s*Fetch URL:\s*(?<fetchUrl>.+)\s*\n\s*Push\s+URL:\s*(?<pushUrl>.+)\s*(\n|$)/,
        );
        const { fetchUrl, pushUrl } = { ...match?.groups };
        assertExists(fetchUrl, "Cannot parse remote information");
        assertExists(pushUrl, "Cannot parse remote information");
        return { name, fetchUrl, pushUrl };
      },
      async add(url, name = "origin") {
        await run(gitOptions, ["remote", "add"], name, url);
        return repo.remotes.get(name);
      },
      async defaultBranch(name = "origin") {
        const info = await run(gitOptions, ["remote", "show", name]);
        const match = info.match(
          /\n\s*HEAD branch:\s*(?<defaultBranch>.+)\s*(\n|$)/,
        );
        const { defaultBranch } = { ...match?.groups };
        assertExists(defaultBranch, "Cannot parse remote information");
        return defaultBranch === "(unknown)" ? undefined : defaultBranch;
      },
    },
  };
  return repo;
}

async function run(
  options: GitOptions & { allowCode?: number[]; stderr?: boolean },
  ...commandArgs: (string | string[] | undefined)[]
): Promise<string> {
  const args = [
    options.cwd !== undefined ? ["-C", normalize(options.cwd)] : [],
    configFlags(options.config, "-c").flat(),
    "--no-pager",
    ...commandArgs,
  ].flat().filter((x) => x !== undefined);
  const command = new Deno.Command("git", {
    args,
    stdin: "null",
    stdout: "piped",
    env: { GIT_EDITOR: "true" },
  });
  try {
    const { code, stdout, stderr } = await command.output();
    if (code !== 0 && !(options.allowCode?.includes(code))) {
      const error = new TextDecoder().decode(stderr.length ? stderr : stdout);
      throw new GitError(
        `Error running git command: ${commandArgs[0]}\n\n${error}`,
        { cause: { command: "git", args, code } },
      );
    }
    return new TextDecoder().decode(options?.stderr ? stderr : stdout)
      .trimEnd();
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotCapable) {
      throw new GitError("Permission error (use `--allow-run=git`)", {
        cause: e,
      });
    }
    throw e;
  }
}

function flag(
  flag: string | [string, string],
  value: boolean | undefined,
): string[];
function flag(
  flag: string,
  value: number | string | string[] | undefined,
): string[];
function flag(
  flag: string | [string, string],
  value: boolean | number | string | string[] | undefined,
): string[] {
  if (typeof flag === "string") flag = [flag, ""];
  if (value === true) return [flag[0]];
  if (value === false && flag[1]) return [flag[1]];
  if (typeof value === "number") return [flag[0], value.toString()];
  if (typeof value === "string") return [flag[0], value];
  if (Array.isArray(value)) return [flag[0], ...value];
  return [];
}

function configFlags(config: Config | undefined, flag?: string): string[][] {
  if (config === undefined) return [];
  function args(
    config: Config,
  ): { key: string; value: string; opt: string | undefined }[] {
    return Object.entries(config).map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((value, index) => ({
          key,
          value,
          opt: index > 0 ? "--add" : undefined,
        }));
      }
      if (typeof value === "object") {
        const parent = key;
        return args(value).map(({ key, value, opt }) => (
          { key: `${parent}.${key}`, value, opt }
        ));
      }
      return [{ key, value: `${value}`, opt: undefined }];
    }).flat();
  }
  return args(config).map(({ key, value, opt }) => {
    return flag ? [flag, `${key}=${value}`] : [key, value, ...opt ? [opt] : []];
  });
}

function userArg(user: User | undefined): string | undefined {
  if (user === undefined) return undefined;
  return `${user.name} <${user.email}>`;
}

function trailerFlag(trailers: Record<string, string> | undefined): string[] {
  if (trailers === undefined) return [];
  return Object.entries(trailers)
    .map(([token, value]) => `--trailer=${token}: ${value}`);
}

function commitArg(commit: Commitish | undefined): string | undefined {
  if (commit === undefined) return undefined;
  return typeof commit === "string"
    ? commit
    : "name" in commit
    ? commit.name
    : commit.hash;
}

function tagArg(tag: Tag | string | undefined): string | undefined {
  if (tag === undefined) return undefined;
  return typeof tag === "string" ? tag : tag.name;
}

function signFlag(
  type: "commit" | "tag",
  sign: boolean | string | undefined,
): string[] {
  if (sign === undefined) return [];
  if (type === "tag") {
    if (sign === false) return ["--no-sign"];
    if (sign === true) return ["--sign"];
    return [`--local-user=${sign}`];
  }
  if (sign === false) return ["--no-gpg-sign"];
  if (sign === true) return ["--gpg-sign"];
  return [`--gpg-sign=${sign}`];
}

function rangeArg(range: RevisionRange | undefined): string | undefined {
  if (range === undefined) return undefined;
  const from = range.from && commitArg(range.from);
  const to = range.to && commitArg(range.to);
  if (from === undefined && to === undefined) return undefined;
  if (from === undefined) return to;
  return `${from}${range.symmetric ? "..." : ".."}${to ?? "HEAD"}`;
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
        transform(value: string, parent: Record<string, string>): T;
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

const LOG_FORMAT: FormatDescriptor<Commit> = {
  delimiter: "<%H>",
  kind: "object",
  fields: {
    hash: { kind: "string", format: "%H" },
    short: { kind: "string", format: "%h" },
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
    summary: { kind: "string", format: "%s" },
    body: {
      kind: "string",
      format: "%b%H%(trailers)",
      optional: true,
      transform(bodyAndTrailers: string, parent: Record<string, string>) {
        const hash = parent["hash"];
        assertExists(hash, "Cannot parse git output");
        let [body, trailers] = bodyAndTrailers.split(hash, 2);
        if (trailers && body && body.endsWith(trailers)) {
          body = body.slice(0, -trailers.length);
        }
        body = body?.trimEnd();
        return body || undefined;
      },
    },
    trailers: {
      kind: "string",
      format: "%(trailers:only=true,unfold=true,key_value_separator=: )",
      transform(trailers: string) {
        return trailers.split("\n").reduce((trailers, line) => {
          const [key, value] = line.split(": ", 2);
          if (key) trailers[key.trim()] = value?.trim() || "";
          return trailers;
        }, {} as Record<string, string>);
      },
    },
  },
} satisfies FormatDescriptor<Commit>;

const BRANCH_FORMAT: FormatDescriptor<Branch> = {
  delimiter: "<%(objectname)>",
  kind: "object",
  fields: {
    name: {
      kind: "string",
      format: "%(refname:short)",
    },
    push: {
      kind: "string",
      format: "%(if)%(push:short)%(then)%(push:short)%(else)%00%(end)",
      optional: true,
    },
    upstream: {
      kind: "string",
      format: "%(if)%(upstream:short)%(then)%(upstream:short)%(else)%00%(end)",
      optional: true,
    },
    commit: {
      kind: "object",
      fields: {
        hash: {
          kind: "string",
          format: "%(if)%(object)%(then)%(object)%(else)%(objectname)%(end)",
        },
        short: { kind: "skip" },
        summary: { kind: "skip" },
        body: { kind: "skip" },
        trailers: { kind: "skip" },
        author: { kind: "skip" },
        committer: { kind: "skip" },
      },
      optional: true,
    },
  },
} satisfies FormatDescriptor<Branch>;

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
        summary: { kind: "skip" },
        body: { kind: "skip" },
        trailers: { kind: "skip" },
        author: { kind: "skip" },
        committer: { kind: "skip" },
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
      format: "%(if)%(object)%(then)%(body)%(else)%00%(end)",
      transform(body: string) {
        body = body.trimEnd();
        return body || undefined;
      },
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
  parent: Record<string, string>,
  format: FormatFieldDescriptor<T>,
  parts: string[],
): [Partial<T> | undefined, string | undefined, number] {
  if (format.kind === "skip") return [undefined, undefined, 0];
  if (format.kind === "object") {
    const parsed: Record<string, string> = {};
    const result: Record<string, unknown> = {};
    const length = Object.values(mapValues(format.fields, (field, key) => {
      const [value, raw, length] = formattedObject(parsed, field, parts);
      if (value !== undefined) result[key] = value;
      if (raw !== undefined) parsed[key] = raw;
      return length;
    })).reduce((a, b) => a + b, 0);
    if (
      format.optional &&
      Object.values(result).every((v) => v === undefined || v === "\x00")
    ) {
      return [undefined, undefined, length];
    }
    return [result as Partial<T>, undefined, length];
  }
  const value = parts.shift();
  assertExists(value, "Cannot parse git output");
  if (format.optional && value === "\x00") {
    return [undefined, value, value.length];
  }
  const result = ("transform" in format)
    ? format.transform(value, parent)
    : value as T;
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
    const [object, _, length] = formattedObject({}, format, parts);
    assertExists(object, "Cannot parse git output");
    result.push(object);
    output = output.slice(length + (fields.length) * delimiter.length)
      .trimStart();
  }
  return result;
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
