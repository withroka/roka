/**
 * A library for interacting with local git repositories.
 *
 * This package provides incomplete functionality to run git commands. It is
 * intended to be used for simple operations like creating commits, tags, and
 * pushing to remotes.
 *
 * The main module provides the {@linkcode git} function that exposes git
 * operations, as well as the {@linkcode Commit}, {@linkcode Tag}, and similar
 * git objects.
 *
 * ```ts
 * import { git } from "@roka/git";
 * (async () => {
 *   const repo = git();
 *   const branch = await repo.branches.current();
 *   if (branch === "main") {
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
 *     {@link https://www.conventionalcommits.org | Conventional Commits}.
 *  -  {@link [testing]}: Write tests using temporary git repositories.
 *
 * @todo Extend `git().config.set()` with more configurations.
 * @todo Add `git().config.get()`
 * @todo Add stash management.
 * @todo Introduce the `Branch` object type.
 * @todo Add `git().branches.copy()`
 * @todo Add `git().branches.move()`
 * @todo Add `git().branches.track()`
 * @todo Add `git().index.move()`
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
import { slidingWindows } from "@std/collections";
import { basename, join, normalize } from "@std/path";

/**
 * An error thrown by the `git` package.
 *
 * If the error is from running a git command, the message will include the
 * command and its output.
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
  path: (...parts: string[]) => string;
  /** Initializes a new git repository. */
  init: (options?: InitOptions) => Promise<void>;
  /** Clones a remote repository. */
  clone: (url: string, options?: CloneOptions) => Promise<void>;
  /** Config operations. */
  config: {
    /** Configures repository options. */
    set: (config: Config) => Promise<void>;
  };
  /** Branch operations. */
  branches: Branches;
  /** Ignore (exclusion) operations. */
  ignore: Ignore;
  /** Index (staged area) operations. */
  index: Index;
  /** Commit operations. */
  commits: Commits;
  /** Tag operations. */
  tags: Tags;
  /** Remote operations. */
  remotes: Remotes;
}

/** Branch operations from {@linkcode Git.branches}. */
export interface Branches {
  /** Returns the current branch name. */
  current: () => Promise<string | undefined>;
  /** List branches in the repository alphabetically. */
  list: (options?: BranchListOptions) => Promise<string[]>;
  /** Switches to a commit, or an existing or new branch. */
  checkout: (options?: BranchCheckoutOptions) => Promise<void>;
  /** Creates a branch. */
  create: (name: string) => Promise<void>;
  /** Deletes a branch. */
  delete: (name: string, options?: BranchDeleteOptions) => Promise<void>;
}

/** Ignore operations from {@linkcode Git.ignore}. */
export interface Ignore {
  /** Checks paths against gitignore list and returns the ignored patterns. */
  check: (
    paths: string | string[],
    options?: IgnoreCheckOptions,
  ) => Promise<string[]>;
}

/** Index operations from {@linkcode Git.index}. */
export interface Index {
  /** Stages files for commit. */
  add: (path: string | string[], options?: IndexAddOptions) => Promise<void>;
  /** Removes files from the index. */
  remove: (
    path: string | string[],
    options?: IndexRemoveOptions,
  ) => Promise<void>;
  /** Returns the status of the index and the local working tree. */
  status: (options?: IndexStatusOptions) => Promise<Status>;
}

/** Commit operations from {@linkcode Git.commits}. */
export interface Commits {
  /** Creates a new commit in the repository. */
  create: (summary: string, options?: CommitCreateOptions) => Promise<Commit>;
  /** Returns the commit at the tip of `HEAD`. */
  head: () => Promise<Commit>;
  /** Returns the history of commits in the repository. */
  log: (options?: CommitLogOptions) => Promise<Commit[]>;
  /** Pushes commits to a remote. */
  push: (options?: CommitPushOptions) => Promise<void>;
  /** Pulls commits and tags from a remote. */
  pull: (options?: CommitPullOptions) => Promise<void>;
}

/** Tag operations from {@linkcode Git.tags}. */
export interface Tags {
  /** Creates a new tag in the repository. */
  create(name: string, options?: TagCreateOptions): Promise<Tag>;
  /** Lists all tags in the repository. */
  list(options?: TagListOptions): Promise<Tag[]>;
  /** Pushes a tag to a remote. */
  push: (tag: Tag | string, options?: TagPushOptions) => Promise<void>;
}

/**
 * Remote operations from {@linkcode Git.remotes}.
 *
 * Default remote name is `"origin"` for all remote methods.
 */
export interface Remotes {
  /** Returns the remote repository URL. */
  get: (name?: string) => Promise<Remote>;
  /** Adds a remote to the repository. */
  add: (url: string, name?: string) => Promise<Remote>;
  /** Queries the default branch on the remote. */
  defaultBranch: (name?: string) => Promise<string | undefined>;
}

/** Configuration for a git repository. */
export interface Config {
  /** Commit configuration. */
  commit?: {
    /** Whether to sign commits. */
    gpgsign?: boolean;
  };
  /** Init configuration. */
  init?: {
    /** Default branch name. */
    defaultBranch?: string;
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
  status: "modified" | "added" | "deleted";
}

/** Status of a renamed file in the index and the working tree. */
export interface RenamedPathStatus {
  /** Path to the file. */
  path: string;
  /** Status of the file. */
  status: "renamed";
  /** Previous file path. */
  from: string;
}

/** Status of an untracked or ignored file in the index and the working tree. */
export interface UntrackedPathStatus {
  /** Path to the file. */
  path: string;
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
export type Commitish = Commit | Tag | string;

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
   * Default is `main`, if not overridden with git config.
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
   * Implies {@linkcode CloneOptions.singleBranch | singleBranch}, unless it is
   * set to `false` to fetch from the tip of all branches.
   */
  depth?: number;
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
   * Implies {@linkcode BranchListOptions.all | all} to be `true`.
   *
   * @default {false}
   */
  remotes?: boolean;
}

/** Options for the {@linkcode Branches.checkout} function. */
export interface BranchCheckoutOptions {
  /**
   * Checkout at the given commit or branch.
   * @default {"HEAD"}
   *
   * A commit target implies {@linkcode BranchCheckoutOptions.detach} to be
   * `true`.
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
   * {@linkcode IndexStatusOptions.untracked | untracked} is set to `"all"`. If
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
  paths?: string[];
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
  branch?: string;
  /** Force push to remote. */
  force?: boolean;
}

/** Options for the {@linkcode Commits.pull} function. */
export interface CommitPullOptions
  extends RemoteOptions, TransportOptions, SignOptions {
  /** Remote branch to pull from. The default is the tracked remote branch. */
  branch?: string;
}

/** Options for the {@linkcode Tags.create} function. */
export interface TagCreateOptions extends SignOptions {
  /**
   * Commit to tag.
   * @default {"HEAD"}
   */
  commit?: Commitish;
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
   * Setting to `version` uses {@link https://semver.org | semantic version}
   * order, returning the latest versions first.
   *
   * By default, pre-release versions are sorted lexically, and they are
   * considered newer than the release versions. To change this behavior, set
   * the {@linkcode Config.versionsort.suffix | versionsort.suffix} config
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
 * @example Create a new git repository and add a file.
 * ```ts
 * import { git } from "@roka/git";
 * import { tempDirectory } from "@roka/fs/temp";
 * import { assertEquals } from "@std/assert";
 * await using directory = await tempDirectory();
 * const repo = git({ cwd: directory.path() });
 * await repo.init();
 * await repo.config.set({ user: { name: "name", email: "email" } });
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.index.add("file.txt");
 * const commit = await repo.commits.create("Initial commit", { sign: false });
 * assertEquals(await repo.commits.log(), [commit]);
 * ```
 */
export function git(options?: GitOptions): Git {
  const directory = options?.cwd ?? ".";
  const gitOptions = options ?? {};
  const git: Git = {
    path(...parts: string[]) {
      return join(directory, ...parts);
    },
    async init(options) {
      await run(
        gitOptions,
        "init",
        options?.bare && "--bare",
        options?.branch !== undefined && ["--initial-branch", options.branch],
      );
    },
    async clone(url, options) {
      await run(
        gitOptions,
        ["clone", url, "."],
        options?.bare && "--bare",
        options?.config && configArgs(options.config, "--config").flat(),
        options?.depth !== undefined && ["--depth", `${options.depth}`],
        options?.local === false && "--no-local",
        options?.local === true && "--local",
        options?.remote !== undefined && ["--origin", options.remote],
        options?.branch !== undefined && ["--branch", options.branch],
        options?.singleBranch === false && "--no-single-branch",
        options?.singleBranch === true && "--single-branch",
      );
    },
    config: {
      async set(config) {
        for (const cfg of configArgs(config)) {
          // deno-lint-ignore no-await-in-loop
          await run(gitOptions, "config", cfg);
        }
      },
    },
    branches: {
      async current() {
        const branch = await run(gitOptions, "branch", "--show-current");
        return branch ? branch : undefined;
      },
      async list(options) {
        const branches = await run(
          gitOptions,
          ["branch", "--list", "--format=%(refname)"],
          options?.name,
          options?.all && "--all",
          options?.remotes && "--remotes",
          options?.contains !== undefined &&
            ["--contains", commitArg(options.contains)],
          options?.noContains !== undefined &&
            ["--no-contains", commitArg(options.noContains)],
          options?.pointsAt !== undefined &&
            ["--points-at", commitArg(options.pointsAt)],
        );
        // Reimplementing `refname:short`, which behaves differently on
        // different git versions. This has a bug when a branch name really
        // ends with `/HEAD`. This will be fixed when branches are objects.
        return branches
          .split("\n")
          .filter((x) => x)
          .filter((x) => basename(x) !== "HEAD")
          .filter((x) => !x.includes(" "))
          .map((x) => x.replace(/^refs\/heads\//, ""))
          .map((x) => x.replace(/^refs\/remotes\//, ""));
      },
      async checkout(options) {
        await run(
          gitOptions,
          "checkout",
          options?.detach && "--detach",
          options?.new !== undefined && ["-b", options.new],
          options?.target !== undefined && commitArg(options.target),
        );
      },
      async create(name) {
        await run(gitOptions, "branch", name);
      },
      async delete(name, options) {
        await run(
          gitOptions,
          "branch",
          options?.force ? "-D" : "-d",
          name,
        );
      },
    },
    ignore: {
      async check(paths, options) {
        if (typeof paths === "string") paths = [paths];
        if (paths.length === 0) return [];
        const output = await run(
          { ...gitOptions, allowCode: [1] },
          "check-ignore",
          options?.matching === false && ["--non-matching", "--verbose"],
          options?.index === false && "--no-index",
          paths,
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
          options?.force && "--force",
          options?.executable === false && "--chmod=-x",
          options?.executable === true && "--chmod=+x",
          path,
        );
      },
      async remove(path, options?: IndexRemoveOptions) {
        await run(gitOptions, "rm", options?.force && "--force", path);
      },
      async status(options?: IndexStatusOptions) {
        const { path, untracked = true, ignored = false, renames = true } =
          options ?? {};
        const output = await run(
          gitOptions,
          "status",
          ["--porcelain=1", "-z"],
          path && ["--", ...typeof path === "string" ? [path] : path],
          untracked === false && "--untracked-files=no",
          untracked === true && "--untracked-files=normal",
          untracked === "all" && "--untracked-files=all",
          ignored === false && "--ignored=no",
          ignored === true && "--ignored=traditional",
          renames === false && "--no-renames",
          renames === true && "--renames",
        );
        const lines = output.split("\0").filter((x) => x);
        const status: Status = {
          staged: [],
          unstaged: [],
          untracked: [],
          ignored: [],
        };
        const xyToStatus: Record<string, TrackedPathStatus["status"]> = {
          "M": "modified",
          "T": "modified",
          "A": "added",
          "C": "added",
          "D": "deleted",
          "R": "renamed",
        };
        let rename = false;
        for (
          const [line, next] of slidingWindows(lines, 2, { partial: true })
        ) {
          assertExists(line, "Cannot parse status line");
          if (rename) {
            rename = false;
            continue;
          }
          const [x, y, path] = [line[0], line[1], line.slice(3)];
          assertExists(x, "Cannot parse status line");
          assertExists(y, "Cannot parse status line");
          assertExists(path, "Cannot parse status line");
          rename = x === "R" || y === "R";
          if (x === "?") {
            status.untracked.push({ path });
            continue;
          }
          if (x === "!") {
            status.ignored.push({ path });
            continue;
          }
          if (x !== " ") {
            const type = xyToStatus[x] ?? "modified";
            if (type === "renamed") {
              assertExists(next, "Cannot parse status line");
              status.staged.push({ path, status: "renamed", from: next });
            } else {
              status.staged.push({ path, status: type });
            }
          }
          if (y !== " ") {
            const type = xyToStatus[y] ?? "modified";
            if (type === "renamed") {
              assertExists(next, "Cannot parse status line");
              status.unstaged.push({ path, status: "renamed", from: next });
            } else {
              status.unstaged.push({ path, status: type });
            }
          }
        }
        return status;
      },
    },
    commits: {
      async create(summary, options) {
        const output = await run(
          gitOptions,
          "commit",
          ["-m", summary],
          options?.body !== undefined && ["-m", options?.body],
          options?.trailers && trailerArg(options.trailers),
          options?.all && "--all",
          options?.allowEmpty && "--allow-empty",
          options?.amend && "--amend",
          options?.author && ["--author", userArg(options.author)],
          options?.sign !== undefined && signArg(options.sign, "commit"),
        );
        const hash = output.match(/^\[.+ (?<hash>[0-9a-f]+)\]/)?.groups?.hash;
        assertExists(hash, "Cannot find created commit");
        const [commit] = await git.commits.log({
          maxCount: 1,
          range: { to: hash },
        });
        assertExists(commit, "Cannot find created commit");
        return commit;
      },
      async head() {
        const [commit] = await git.commits.log({ maxCount: 1 });
        assertExists(commit, "No HEAD commit.");
        return commit;
      },
      async log(options) {
        const output = await run(
          gitOptions,
          ["log", `--format=${formatArg(LOG_FORMAT)}`],
          options?.author && ["--author", userArg(options.author)],
          options?.committer && ["--committer", userArg(options.committer)],
          options?.maxCount !== undefined &&
            ["--max-count", `${options.maxCount}`],
          options?.paths && ["--", ...options.paths],
          options?.range !== undefined && rangeArg(options.range),
          options?.skip !== undefined && ["--skip", `${options.skip}`],
          options?.text !== undefined &&
            ["-S", options.text, "--pickaxe-regex"],
        );
        return parseOutput(LOG_FORMAT, output) as Commit[];
      },
      async push(options) {
        await run(
          gitOptions,
          ["push", options?.remote ?? "origin"],
          options?.branch,
          options?.atomic === false && "--no-atomic",
          options?.atomic === true && "--atomic",
          options?.force && "--force",
          options?.tags && "--tags",
        );
      },
      async pull(options) {
        await run(
          gitOptions,
          "pull",
          options?.remote ?? "origin",
          options?.branch,
          options?.atomic && "--atomic",
          options?.sign !== undefined && signArg(options.sign, "commit"),
          options?.tags === false && "--no-tags",
          options?.tags === true && "--tags",
        );
      },
    },
    tags: {
      async create(name, options): Promise<Tag> {
        await run(
          gitOptions,
          ["tag", name],
          options?.commit && commitArg(options.commit),
          options?.subject && ["-m", options.subject],
          options?.body !== undefined && ["-m", options.body],
          options?.force && "--force",
          options?.sign !== undefined && signArg(options.sign, "tag"),
        );
        const [tag] = await git.tags.list({ name });
        assertExists(tag, "Cannot find created tag");
        return tag;
      },
      async list(options?: TagListOptions) {
        const output = await run(
          gitOptions,
          ["tag", "--list", `--format=${formatArg(TAG_FORMAT)}`],
          options?.name,
          options?.contains !== undefined &&
            ["--contains", commitArg(options.contains)],
          options?.noContains !== undefined &&
            ["--no-contains", commitArg(options.noContains)],
          options?.pointsAt !== undefined &&
            ["--points-at", commitArg(options.pointsAt)],
          options?.sort === "version" && "--sort=-version:refname",
        );
        const tags = parseOutput(TAG_FORMAT, output);
        return await Promise.all(tags.map(async (tag) => {
          assertExists(tag.name, "Tag name not filled");
          assertExists(tag.commit?.hash, "Commit hash not filled for tag");
          const [commit] = await git.commits.log({
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
          ["push", options?.remote ?? "origin", "tag", tagArg(tag)],
          options?.force && "--force",
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
        return git.remotes.get(name);
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
  return git;
}

async function run(
  options: GitOptions & { allowCode?: number[] },
  ...commandArgs: (string | string[] | false | undefined)[]
): Promise<string> {
  const args = [
    options.cwd !== undefined ? ["-C", normalize(options.cwd)] : [],
    options.config && configArgs(options.config, "-c").flat(),
    "--no-pager",
    ...commandArgs,
  ].filter((x) => x !== false && x !== undefined).flat();
  const command = new Deno.Command("git", {
    args,
    stdin: "null",
    stdout: "piped",
    env: { GIT_EDITOR: "true" },
  });
  try {
    const { code, stdout, stderr, success } = await command.output();
    if (!success && !(options.allowCode?.includes(code))) {
      const error = new TextDecoder().decode(stderr.length ? stderr : stdout);
      const args = commandArgs.filter((x) => x !== false && x !== undefined)
        .flat().map((x) => x.match(/\s/) ? `"${x}"` : x).join(" ");
      throw new GitError(`Error running git command: git ${args}`, {
        cause: { command: "git", args, code, error },
      });
    }
    return new TextDecoder().decode(stdout).trimEnd();
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotCapable) {
      throw new GitError("Permission error (use `--allow-run=git`)", {
        cause: e,
      });
    }
    throw e;
  }
}

function configArgs(config: Config, flag?: string): string[][] {
  function args(
    cfg: object,
  ): { key: string; value: string; opt: string | undefined }[] {
    return Object.entries(cfg).map(([key, value]) => {
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

function userArg(user: User): string {
  return `${user.name} <${user.email}>`;
}

function trailerArg(trailers: Record<string, string>): string[] {
  return Object.entries(trailers)
    .map(([token, value]) => `--trailer=${token}: ${value}`);
}

function commitArg(commit: Commitish): string {
  return typeof commit === "string"
    ? commit
    : "commit" in commit
    ? commit.commit.hash
    : commit.hash;
}

function tagArg(tag: Tag | string): string {
  return typeof tag === "string" ? tag : tag.name;
}

function signArg(sign: boolean | string, type: "commit" | "tag"): string {
  if (type === "tag") {
    if (sign === false) return "--no-sign";
    if (sign === true) return "--sign";
    return `--local-user=${sign}`;
  }
  if (sign === false) return "--no-gpg-sign";
  if (sign === true) return "--gpg-sign";
  return `--gpg-sign=${sign}`;
}

function rangeArg(range: RevisionRange): string | undefined {
  const from = range.from && commitArg(range.from);
  const to = range.to && commitArg(range.to);
  if (from === undefined && to === undefined) return undefined;
  if (from === undefined) return to;
  return `${from}${range.symmetric ? "..." : ".."}${to ?? "HEAD"}`;
}

type FormatField = { kind: "skip" } | {
  kind: "string";
  optional?: boolean;
  transform?: (value: string, parent: Record<string, string>) => unknown;
  format: string;
} | {
  kind: "object";
  optional?: boolean;
  fields: { [key: string]: FormatField };
};

type FormatFieldDescriptor<T> =
  | { kind: "skip" }
  | (
    & (
      | {
        kind: "string";
        format: string;
        transform: (value: string, parent: Record<string, string>) => T;
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
      transform: (bodyAndTrailers: string, parent: Record<string, string>) => {
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
      transform: (trailers: string) => {
        return trailers.split("\n").reduce((trailers, line) => {
          const [key, value] = line.split(": ", 2);
          if (key) trailers[key.trim()] = value?.trim() || "";
          return trailers;
        }, {} as Record<string, string>);
      },
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
      transform: (body: string) => {
        body = body.trimEnd();
        return body || undefined;
      },
    },
  },
} satisfies FormatDescriptor<Tag>;

function formatFields(format: FormatField): string[] {
  if (format.kind === "skip") return [];
  if (format.kind === "object") {
    return Object.values(format.fields).map((f) => formatFields(f)).flat();
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
  format: FormatField,
  parts: string[],
): [Partial<T> | undefined, string | undefined, number] {
  if (format.kind === "skip") return [undefined, undefined, 0];
  if (format.kind === "object") {
    const parsed: Record<string, string> = {};
    const result: Record<string, unknown> = {};
    const length = Object.entries(format.fields).reduce((sum, [key, field]) => {
      const [value, raw, length] = formattedObject(parsed, field, parts);
      if (value !== undefined) result[key] = value;
      if (raw !== undefined) parsed[key] = raw;
      return sum + length;
    }, 0);
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
  const result = format.transform ? format.transform(value, parent) : value;
  return [result as Partial<T>, value, value.length];
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
