import { assert, assertEquals, assertFalse, assertGreater } from "@std/assert";
import { join } from "@std/path/join";

// NOT IMPLEMENTED
// - most configs
// - merge, rebase, conflict resolution
// - stash
// - submodules
// - dates
// - verify signatures
// - prune

/** An error while running a git command. */
export class GitError extends Error {
  /**
   * Construct GitError.
   *
   * @param message The error message to be associated with this error.
   */
  constructor(
    message: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

/** A local repository with git commands. */
export interface Git {
  /** Local repository directory. */
  directory: string;
  /** Returns the full path to a file in the repository. */
  path: (...parts: string[]) => string;
  /** Configures repository options. */
  config: (config: Config) => Promise<void>;
  /** Initializes a new git repository. */
  init: (options?: InitOptions) => Promise<void>;
  /** Clones a remote repository. */
  clone: (url: string, options?: CloneOptions) => Promise<void>;
  /** Switches to a commit, or an existing or new branch. */
  checkout: (options?: GitCheckoutOptions) => Promise<void>;
  /** Returns the current branch name. */
  branch: () => Promise<string | undefined>;
  /** Stages files for commit. */
  add: (pathspecs: string | string[]) => Promise<void>;
  /** Removes files from the index. */
  remove: (pathspecs: string | string[]) => Promise<void>;
  /** Creates a new commit in the repository. */
  commit: (
    summary: string,
    options?: CommitOptions,
  ) => Promise<Commit>;
  /** Returns the history of commits in the repository. */
  log: (options?: LogOptions) => Promise<Commit[]>;
  /** Creates a new tag in the repository. */
  tag: (name: string, options?: TagOptions) => Promise<Tag>;
  /** Lists all tags in the repository. */
  tagList: (options?: TagListOptions) => Promise<Tag[]>;
  /** Adds a remote to the repository. */
  addRemote: (url: string, options?: RemoteOptions) => Promise<void>;
  /** Returns the remote repository URL. */
  remote: (options?: RemoteOptions) => Promise<string>;
  /** Returns the remote head branch of the repository. */
  remoteDefaultBranch: (
    options?: RemoteOptions,
  ) => Promise<string | undefined>;
  /** Pushes commits to a remote. */
  push: (options?: PushOptions) => Promise<void>;
  /** Pushes a tag to a remote. */
  pushTag: (tag: Tag | string, options?: PushTagOptions) => Promise<void>;
  /** Pulls commits and tags from a remote. */
  pull: (options?: PullOptions) => Promise<void>;
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
  /** Commit body, excluding the first line from the message. */
  body: string;
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

/** A revision range. */
export interface RevisionRange {
  /** Match objects that are descendants of this revision. */
  from?: Commitish;
  /** Match objects that are ancestors of this revision. */
  to?: Commitish;
  /**
   * Match objects that are reachable from either end, but not from both.
   *
   * Ignored if either {@linkcode RevisionRange.from} or {@linkcode RevisionRange.to} is
   * not set.
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
  /** Tag configuration. */
  tag?: {
    /** Whether to sign tags. */
    gpgsign?: boolean;
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
   * Git configuration options.
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

/** Options for checkout. */
export interface GitCheckoutOptions {
  /**
   * Checkout at given commit or branch.
   * @default {"HEAD"}
   *
   * A commit target implies {@linkcode GitCheckoutOptions.detach} to be `true`.
   */
  target?: Commitish;
  /** Branch to create and checkout during checkout. */
  newBranch?: string;
  /**
   * Detach `HEAD` during checkout from the target branch.
   * @default {false}
   */
  detach?: boolean;
}

/** Options for creating git commits. */
export interface CommitOptions extends SignOptions {
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
}

/** Options for fetching git logs. */
export interface LogOptions {
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

/** Options for creating tags. */
export interface TagOptions extends SignOptions {
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
export interface TagListOptions {
  /** Tag selection pattern. Default is all tags. */
  name?: string;
  /** Only tags that contain the specific commit. */
  contains?: Commitish;
  /** Only tags that do not contain the specific commit. */
  noContains?: Commitish;
  /** Only tags of the given commit. */
  pointsAt?: Commitish;
  /**
   * Sort option.
   *
   * Setting to `version` uses semver order, returning latest versions first.
   *
   * @todo Handle pre-release versions.
   */
  sort?: "version";
}

/** Options for adding or querying remotes. */
export interface RemoteOptions {
  /**
   * Remote name.
   * @default {"origin"}
   */
  remote?: string;
}

/** Options for pulling from or pushing to a remote. */
export interface GitTransportOptions {
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

/** Options for pushing to a remote. */
export interface PushOptions extends GitTransportOptions, RemoteOptions {
  /** Remote branch to push to. Default is the tracked remote branch. */
  branch?: string;
  /** Force push to remote. */
  force?: boolean;
}

/** Options for pushing a tag to a remote. */
export interface PushTagOptions extends RemoteOptions {
  /** Force push to remote. */
  force?: boolean;
}

/** Options for pulling from a remote. */
export interface PullOptions
  extends RemoteOptions, GitTransportOptions, SignOptions {
  /** Remote branch to pull from. Default is the tracked remote branch. */
  branch?: string;
}

/** Creates a new Git instance for a local repository. */
export function git(options?: GitOptions): Git {
  const gitOptions = options ?? {};
  return {
    directory: options?.cwd ?? ".",
    path(...parts: string[]) {
      return join(this.directory, ...parts);
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
    async config(config) {
      for (const cfg of configArgs(config)) {
        await run(gitOptions, "config", cfg);
      }
    },
    async checkout(options) {
      await run(
        gitOptions,
        "checkout",
        options?.detach && "--detach",
        options?.newBranch !== undefined && ["-b", options.newBranch],
        options?.target !== undefined && commitArg(options.target),
      );
    },
    async branch() {
      const branch = await run(gitOptions, "branch", "--show-current");
      return branch ? branch : undefined;
    },
    async add(pathspecs) {
      await run(gitOptions, "add", pathspecs);
    },
    async remove(pathspecs) {
      await run(gitOptions, "rm", pathspecs);
    },
    async commit(summary, options) {
      const output = await run(
        gitOptions,
        "commit",
        ["-m", summary],
        options?.body && ["-m", options?.body],
        options?.all && "--all",
        options?.allowEmpty && "--allow-empty",
        options?.amend && "--amend",
        options?.author && ["--author", userArg(options.author)],
        options?.sign !== undefined && signArg(options.sign, "commit"),
      );
      const hash = output.match(/^\[.+ (?<hash>[0-9a-f]+)\]/)?.groups?.hash;
      assert(hash, "Cannot find created commit");
      const [commit] = await this.log({ maxCount: 1, range: { to: hash } });
      assert(commit, "Cannot find created commit");
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
        options?.text !== undefined && ["-S", options.text, "--pickaxe-regex"],
      );
      return parseOutput(LOG_FORMAT, output) as Commit[];
    },
    async tag(name, options): Promise<Tag> {
      await run(
        gitOptions,
        ["tag", name],
        options?.commit && commitArg(options.commit),
        options?.subject && ["-m", options.subject],
        options?.body && ["-m", options.body],
        options?.force && "--force",
        options?.sign !== undefined && signArg(options.sign, "tag"),
      );
      const [tag] = await this.tagList({ name });
      assert(tag, "Cannot find created tag");
      return tag;
    },
    async tagList(options) {
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
        assert(tag.commit?.hash, "Commit hash not filled for tag");
        const [commit] = await this.log({
          maxCount: 1,
          range: { to: tag.commit.hash },
        });
        assert(commit, "Cannot find tag commit");
        tag.commit = commit;
        return tag as Tag;
      }));
    },
    async addRemote(url, options) {
      await run(
        gitOptions,
        ["remote", "add"],
        options?.remote ?? "origin",
        url,
      );
    },
    async remote(options) {
      return await run(
        gitOptions,
        ["remote", "get-url"],
        options?.remote ?? "origin",
      );
    },
    async remoteDefaultBranch(options) {
      const info = await run(
        gitOptions,
        ["remote", "show", options?.remote ?? "origin"],
      );
      const match = info.match(/\n\s*HEAD branch:\s*(?<branch>.+)\s*\n/);
      if (!match?.groups?.branch) return undefined;
      if (match.groups.branch === "(unknown)") return undefined;
      return match.groups.branch;
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
    async pushTag(tag, options) {
      await run(
        gitOptions,
        ["push", options?.remote ?? "origin", "tag", tagArg(tag)],
        options?.force && "--force",
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
  };
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
  kind: "string" | "number";
  optional?: boolean;
  format: string;
} | {
  kind: "object";
  optional?: boolean;
  fields: { [key: string]: FormatField };
};

type FormatFieldDescriptor<T> =
  | { kind: "skip" }
  | (T extends object ? {
      kind: "object";
      fields: { [K in keyof T]: FormatFieldDescriptor<T[K]> };
    }
    : {
      kind: T extends string ? "string"
        : T extends number ? "number"
        : never;
      format: string;
    })
    & (undefined extends T ? { optional: true }
      : { optional?: false });

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
    body: { kind: "string", format: "%b" },
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

function formattedObject(
  format: FormatField,
  parts: string[],
): [string | number | Record<string, unknown> | undefined, number] {
  if (format.kind === "skip") return [undefined, 0];
  if (format.kind === "object") {
    const result: Record<string, unknown> = {};
    const length = Object.entries(format.fields).reduce((sum, [key, field]) => {
      const [value, length] = formattedObject(field, parts);
      if (value !== undefined) result[key] = value;
      return sum + length;
    }, 0);
    if (
      format.optional &&
      Object.values(result).every((v) => v === undefined || v === "\x00")
    ) {
      return [undefined, length];
    }
    return [result, length];
  }

  const value = parts.shift();
  assert(value !== undefined, "Cannot parse git output");
  if (format.optional && value === "\x00") return [undefined, value.length];
  if (format.kind === "number") return [parseInt(value), value.length];
  return [value, value.length];
}

function parseOutput<T>(
  format: FormatDescriptor<T>,
  output: string,
): Partial<T>[] {
  const result: Partial<T>[] = [];
  const fields = formatFields(format);
  while (output.length) {
    const delimiterEnd = output.indexOf("!");
    assertGreater(delimiterEnd, 0, "cannot parse git output");
    const delimiter = output.slice(0, delimiterEnd);
    output = output.slice(delimiter.length + 1);
    const parts = output.split(delimiter, fields.length);
    assertEquals(parts.length, fields.length, "cannot parse git output");
    assertFalse(parts.some((p) => p === undefined), "cannot parse git output");
    const [object, length] = formattedObject(format, parts);
    result.push(object as Partial<T>);
    output = output.slice(length + (fields.length) * delimiter.length)
      .trimStart();
  }
  return result;
}
