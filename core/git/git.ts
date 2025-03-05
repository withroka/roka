/**
 * Objects to interact with a local git repositories.
 *
 * This module provides, currently incomplete, functionality to interact with
 * a local git repository. It is intended to be used for simple operations
 * like creating commits, tags, and pushing to remotes.
 *
 * @example
 * ```ts
 * import { git } from "@roka/git";
 * import { tempDirectory } from "@roka/testing/temp";
 *
 * await using directory = await tempDirectory();
 * const repo = git({
 *   cwd: directory.path(),
 *   config: {
 *     user: { name: "name", email: "email" },
 *     commit: { gpgsign: false },
 *   },
 * });
 * await repo.init();
 * await repo.commits.create("Initial commit", { allowEmpty: true });
 * ```
 *
 * The `@roka/git/testing` module provides utilities to help write tests.
 *
 * @example
 * ```ts
 * import { tempRepository } from "@roka/git/testing";
 * await using repo = await tempRepository();
 * const commit = await repo.commits.create("Initial commit", { allowEmpty: true });
 * ```
 *
 * The `@roka/git/conventional` module provides utilities to work with
 * {@link https://www.conventionalcommits.org | Conventional Commits}.
 *
 * @example
 * ```ts
 * import { conventional } from "@roka/git/conventional";
 * import { testCommit } from "@roka/git/testing";
 * const conventionalCommit = conventional(testCommit({
 *   summary: "feat(cli): add command"
 * }));
 * ```
 *
 * @todo Extend `git().config.set()` with more configurations.
 * @todo Add `git().config.get()`
 * @todo Introduce the `Branch` object type.
 * @todo Add `git().branches.copy()`
 * @todo Add `git().branches.move()`
 * @todo Add `git().branches.track()`
 * @todo Handle merges, rebases, conflicts.
 * @todo Add `git().submodules`.
 * @todo Expose dates.
 * @todo Verify signatures.
 * @todo Add pruning.
 *
 * @module
 */

import { assert, assertEquals, assertFalse, assertGreater } from "@std/assert";
import { basename, join } from "@std/path";

/** An error while running a git command. */
export class GitError extends Error {
  /**
   * Construct GitError.
   *
   * @param message The error message to be associated with this error.
   */
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

/** A local repository returned by {@linkcode git}. */
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
  branches: {
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
  };
  /** Index (staged area) operations. */
  index: {
    /** Stages files for commit. */
    add: (pathspecs: string | string[]) => Promise<void>;
    /** Removes files from the index. */
    remove: (pathspecs: string | string[]) => Promise<void>;
  };
  /** Commit operations. */
  commits: {
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
  };
  /** Tag operations. */
  tags: {
    /** Creates a new tag in the repository. */
    create(name: string, options?: TagCreateOptions): Promise<Tag>;
    /** Lists all tags in the repository. */
    list(options?: TagListOptions): Promise<Tag[]>;
    /** Pushes a tag to a remote. */
    push: (tag: Tag | string, options?: TagPushOptions) => Promise<void>;
  };
  /**
   * Remote operations.
   *
   * Default remote name is `"origin"` for all remote methods.
   */
  remotes: {
    /** Returns the remote repository URL. */
    get: (name?: string) => Promise<Remote>;
    /** Adds a remote to the repository. */
    add: (url: string, name?: string) => Promise<Remote>;
    /** Queries the default branch on the remote. */
    defaultBranch: (name?: string) => Promise<string | undefined>;
  };
}

/** A git ref that points to a commit. */
export type Commitish = Commit | Tag | string;

/** A single commit in the Git history. */
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
  /** Committter, who created the commit. */
  committer: User;
}

/** A tag in the Git repository. */
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

/** A remote repository tracked locally. */
export interface Remote {
  /** Remote name. */
  name: string;
  /** Remote fetch URL. */
  fetchUrl: string;
  /** Remote push URL. */
  pushUrl: string;
}

/** A revision range. */
export interface RevisionRange {
  /** Match objects that are descendants of this revision. */
  from?: Commitish;
  /** Match objects that are ancestors of this revision. */
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

/** Git configuration options. */
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
}

/** An author or commiter on git repository. */
export interface User {
  /** Name of the user. */
  name: string;
  /** E-mail of the user. */
  email: string;
}

/** Common options for running git commands. */
export interface GitOptions {
  /**
   * Change working directory for git commands.
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

/** Options for initializing repositories. */
export interface InitOptions {
  /**
   * Create a bare repository.
   * @default {false}
   */
  bare?: boolean;
  /**
   * Name of the initial branch.
   *
   * Creates a new branch with this name for {@linkcode Git.init}, and checks out
   * this branch for {@linkcode Git.clone}.
   *
   * Default is `main`, if not overridden with git config.
   */
  branch?: string;
}

/** Options for cloning repositories. */
export interface CloneOptions extends InitOptions, RemoteOptions {
  /** Set config for new repository, after initialization but before fetch. */
  config?: Config;
  /**
   * Number of commits to clone at the tip.
   *
   * Implies {@linkcode CloneOptions.singleBranch} unless it is set to
   * `false` to fetch from the tip of all branches.
   */
  depth?: number;
  /**
   * Bypasses local transport optimization when set to `false`.
   *
   * When the remote repository is specified as a URL, this is ignored,
   * otherwise it is implied.
   */
  local?: boolean;
  /**
   * Clone only tip of a single branch.
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

/** Options for listing refs (branches or tags). */
export interface RefListOptions {
  /** Ref selection pattern. Default is all relevant refs. */
  name?: string;
  /** Only refs that contain the specific commit. */
  contains?: Commitish;
  /** Only refs that do not contain the specific commit. */
  noContains?: Commitish;
  /** Only refs that point to the given commit. */
  pointsAt?: Commitish;
}

/** Options for listing branches. */
export interface BranchListOptions extends RefListOptions {
  /**
   * Include remote branches.
   * @default {false}
   */
  all?: boolean;
  /**
   * Only remote branches.
   *
   * Implies {@linkcode BranchListOptions.all} to be `true`.
   *
   * @default {false}
   */
  remotes?: boolean;
}

/** Options for checkout. */
export interface BranchCheckoutOptions {
  /**
   * Checkout at given commit or branch.
   * @default {"HEAD"}
   *
   * A commit target implies {@linkcode BranchCheckoutOptions.detach} to be `true`.
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

/** Options for deleting branches. */
export interface BranchDeleteOptions {
  /**
   * Force delete the branch.
   * @default {false}
   */
  force?: boolean;
}

/** Options for creating git commits. */
export interface CommitCreateOptions extends SignOptions {
  /**
   * Automatically stage modified or deleted files known to git.
   * @default {false}
   */
  all?: boolean;
  /**
   * Allow empty commit.
   * @default {false}
   */
  allowEmpty?: boolean;
  /** Amend the last commit. */
  amend?: boolean;
  /** Author, who wrote the code. */
  author?: User | undefined;
  /** Commit body to append to the message.   */
  body?: string;
  /** Trailers to append to the commit message. */
  trailers?: Record<string, string>;
}

/** Options for fetching git logs. */
export interface CommitLogOptions {
  /** Only commits by an author. */
  author?: User;
  /** Only commits by a committer. */
  committer?: User;
  /** Only commts that any of the given paths. */
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

/** Options for pushing to a remote. */
export interface CommitPushOptions extends TransportOptions, RemoteOptions {
  /** Remote branch to push to. Default is the current branch. */
  branch?: string;
  /** Force push to remote. */
  force?: boolean;
}

/** Options for pulling from a remote. */
export interface CommitPullOptions
  extends RemoteOptions, TransportOptions, SignOptions {
  /** Remote branch to pull from. Default is the tracked remote branch. */
  branch?: string;
}

/** Options for creating tags. */
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

/** Options for listing tags. */
export interface TagListOptions extends RefListOptions {
  /**
   * Sort option.
   *
   * Setting to `version` uses semver order, returning latest versions first.
   *
   * @todo Handle pre-release versions.
   */
  sort?: "version";
}

/** Options for pushing a tag to a remote. */
export interface TagPushOptions extends RemoteOptions {
  /** Force push to remote. */
  force?: boolean;
}

/** Options for adding or querying remotes. */
export interface RemoteOptions {
  /**
   * Remote name.
   * @default {"origin"}
   */
  remote?: string;
}

/** Options for signing commits and tags. */
export interface SignOptions {
  /**
   * Sign the commit with GPG.
   *
   * If `true` or a string, object is signed with the default or given GPG key.
   *
   * If `false`, the commit is not signed.
   */
  sign?: boolean | string;
}

/** Options for pulling from or pushing to a remote. */
export interface TransportOptions {
  /** Either update all refs on the other side, or don't update any.*/
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
 * Creates a new Git instance for a local repository.
 *
 * @example
 * ```ts
 * import { git } from "@roka/git";
 * import { tempDirectory } from "@roka/testing/temp";
 * import { assertEquals } from "@std/assert";
 *
 * await using directory = await tempDirectory();
 * const repo = git({ cwd: directory.path() });
 * await repo.init();
 * await repo.config.set({ user: { name: "name", email: "email" } });
 *
 * await Deno.writeTextFile(repo.path("file.txt"), "content");
 * await repo.index.add("file.txt");
 * const commit = await repo.commits.create("Initial commit", { sign: false });
 * assertEquals(await repo.commits.head(), commit);
 * assertEquals(await repo.commits.log(), [commit]);
 *
 * const tag = await repo.tags.create("release", { sign: false });
 * assertEquals(await repo.tags.list(), [tag]);
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
    index: {
      async add(pathspecs) {
        await run(gitOptions, "add", pathspecs);
      },
      async remove(pathspecs) {
        await run(gitOptions, "rm", pathspecs);
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
        assert(hash, "Cannot find created commit");
        const [commit] = await git.commits.log({
          maxCount: 1,
          range: { to: hash },
        });
        assert(commit, "Cannot find created commit");
        return commit;
      },
      async head() {
        const [commit] = await git.commits.log({ maxCount: 1 });
        assert(commit, "No HEAD commit.");
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
        assert(tag, "Cannot find created tag");
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
          assert(tag.name, "Tag name not filled");
          assert(tag.commit?.hash, "Commit hash not filled for tag");
          const [commit] = await git.commits.log({
            maxCount: 1,
            range: { to: tag.commit.hash },
          });
          assert(commit, "Cannot find commit for tag");
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
        assert(fetchUrl && pushUrl, "Cannot parse remote information");
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
        assert(defaultBranch, "Cannot parse remote information");
        return defaultBranch === "(unknown)" ? undefined : defaultBranch;
      },
    },
  };
  return git;
}

async function run(
  options: GitOptions,
  ...commandArgs: (string | string[] | false | undefined)[]
): Promise<string> {
  const args = [
    options.cwd && ["-C", options.cwd],
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
    const { code, stdout, stderr } = await command.output();
    if (code !== 0) {
      const escapedArgs = args.map((x) => JSON.stringify(x)).join(" ");
      const error = new TextDecoder().decode(stderr.length ? stderr : stdout)
        .split("\n")
        .map((l) => `  ${l}`);
      throw new GitError(
        [
          "Error running git command",
          `  command: git ${escapedArgs}`,
          `  exit code: ${code}`,
          error,
        ].flat().join("\n"),
      );
    }
    return new TextDecoder().decode(stdout).trim();
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotCapable) {
      throw new GitError("Permission error. Use `--allow-run=git`.");
    }
    throw e;
  }
}

function configArgs(
  config: Config,
  flag?: string,
): string[][] {
  return Object.entries(config).map(([group, cfg]) =>
    Object.entries(cfg).map(([key, value]) =>
      flag
        ? [flag, `${group}.${key}=${value}`]
        : [`${group}.${key}`, `${value}`]
    )
  ).flat();
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

function rangeArg(range: RevisionRange): string {
  const from = range.from && commitArg(range.from);
  const to = (range.to && commitArg(range.to)) ?? "HEAD";
  if (from === undefined) return to;
  return `${from}${range.symmetric ? "..." : ".."}${to}`;
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
        assert(hash, "Cannot parse git output");
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
  assert(value !== undefined, "Cannot parse git output");
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
    assert(object, "Cannot parse git output");
    result.push(object);
    output = output.slice(length + (fields.length) * delimiter.length)
      .trimStart();
  }
  return result;
}
