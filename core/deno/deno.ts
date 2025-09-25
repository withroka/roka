/**
 * A library for programmatically invoking [deno](https://docs.deno.com).
 *
 * This package provides incomplete functionality to run deno commands. It is
 * intended to be used as a building block for higher-level abstractions. It
 * uses the locally installed deno binary.
 *
 * @todo Add common deno options.
 * @todo Add dependency management options.
 * @todo Finish permission options.
 *
 * @module deno
 */

/**
 * An error thrown by the `deno` package.
 *
 * If the error is from running a deno command, the message will include the
 * command and its output.
 */
export class DenoError extends Error {
  /** Construct DenoError. */
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DenoError";
  }
}

/** The deno command interface returned by the {@linkcode deno} function. */
export interface Deno {
  /**
   * Compiles the given script into a self contained executable.
   *
   * @see {@link https://docs.deno.com/go/compile `deno compile`, standalone executables}
   */
  compile(script: string, options?: CompileOptions): Promise<void>;
  /**
   * Auto-format various file types.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/fmt/ `deno fmt`, code formatting}
   */
  fmt(files: string[], options?: FormatOptions): Promise<void>;
  /**
   * Lint JavaScript/TypeScript source code.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/lint/ `deno lint`, linter}
   */
  lint(files: string[], options?: LintOptions): Promise<void>;
  test(): Promise<void>;
}

export type TargetArchitecture =
  | "x86_64-unknown-linux-gnu"
  | "aarch64-unknown-linux-gnu"
  | "x86_64-pc-windows-msvc"
  | "x86_64-apple-darwin"
  | "aarch64-apple-darwin";

/**
 * Options for commands accepting script arguments, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 */
export interface ScriptOptions {
  /** Arguments to pass to the script. */
  scriptArgs?: string[];
}

/**
 * Options for commands accepting type checking arguments, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 *
 * @see {@link https://docs.deno.com/runtime/fundamentals/typescript/ TypeScript support}
 */
export interface TypeCheckingOptions {
  /**
   * Set type-checking behavior.
   *
   * Only local module are type-checked by default. If set to `"all"`, remote
   * modules are also checked.
   *
   * @default {true}
   */
  check?: boolean | "all";
}

/**
 * Options for commands accepting type permission arguments, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 *
 * @see {@link https://docs.deno.com/go/permissions Security and permissions}
 */
export interface PermissionOptions {
  /**
   * Allow all permissions.
   * @default {false}
   */
  allowAll?: boolean;
  /**
   * Loads the permission set from the config file.
   *
   * If set to `true`, the default permission set will be used.
   *
   * @default {false}
   */
  permissionSet?: boolean | string;
  /**
   * Prompt, instead of throwing, if required permission wasn't passed.
   * @default {true}
   */
  prompt?: boolean;
  /**
   * Allow file system read access.
   *
   * Optionally specify allowed paths.
   *
   * @default {false}
   */
  allowRead?: boolean | string[];
  /**
   * Deny file system read access.
   *
   * Optionally specify denied paths.
   *
   * @default {false}
   */
  denyRead?: boolean | string[];
  /**
   * Allow file system write access.
   *
   * Optionally specify allowed paths.
   *
   * @default {false}
   */
  allowWrite?: boolean | string[];
  /**
   * Deny file system write access.
   *
   * Optionally specify denied paths.
   *
   * @default {false}
   */
  denyWrite?: boolean | string[];
  /**
   * Allow importing from remote hosts.
   *
   * Optionally specify allowed IP addresses and host names, with ports as
   * necessary.
   *
   * @default {false}
   */
  allowImport?: boolean | string[];
  /**
   * Deny importing from remote hosts.
   *
   * Optionally specify denied IP addresses and host names, with ports as
   * necessary.
   *
   * @default {false}
   */
  denyImport?: boolean | string[];
  /**
   * Allow network access. Optionally specify allowed IP addresses and host
   * names, with ports as necessary.
   *
   * @default {false}
   */
  allowNet?: boolean | string[];
  /**
   * Deny network access.
   *
   * Optionally specify defined IP addresses and host names, with ports as necessary.
   *
   * @default {false}
   */
  denyNet?: boolean | string[];
  /**
   * Allow access to environment variables.
   *
   * Optionally specify accessible environment variables.
   */
  allowEnv?: boolean | string[];
  /**
   * Deny access to environment variables.
   *
   * Optionally specify inacessible environment variables.
   *
   * @default {false}
   */
  denyEnv?: boolean | string[];
  /**
   * Allow access to OS information.
   *
   * Optionally allow specific APIs by function name.
   *
   * @default {false}
   */
  allowSys?: boolean | string[];
  /**
   * Deny access to OS information.
   *
   * Optionally deny specific APIs by function name.
   *
   * @default {false}
   */
  denySys?: boolean | string[];
  /**
   * Allow running subprocesses.
   *
   * Optionally specify allowed runnable program names.
   *
   * @default {false}
   */
  allowRun?: boolean | string[];
  /**
   * Deny running subprocesses.
   *
   * Optionally specify denied runnable program names.
   *
   * @default {false}
   */
  denyRun?: boolean | string[];
  /**
   * Allow loading dynamic libraries.
   *
   * Optionally specify allowed directories or files.
   *
   * This is an unstable feature in Deno.
   *
   * @default {false}
   */
  allowFfi?: boolean | string[];
  /**
   * Deny loading dynamic libraries.
   *
   * Optionally specify denied directories or files.
   *
   * This is an unstable feature in Deno.
   *
   * @default {false}
   */
  denyFfi?: boolean | string[];
}

/**
 * Options for commands accepting file watching arguments, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 *
 * @see {@link https://docs.deno.com/runtime/getting_started/command_line_interface/#watch-mode Watch mode}
 */
export interface FileWatchingOptions {
  /**
   * Watch for file changes and restart process automatically.
   *
   * Only local files from entry point module graph are watched.
   *
   * @default {false}
   */
  watch?: boolean;
  /** Exclude provided files/patterns from watch mode. */
  watchExclude?: string[];
  /**
   * Clear terminal screen when under watch mode.
   * @default {true}
   */
  clearScreen?: boolean;
}

/**
 * Options for the {@linkcode Deno.compile} function.
 *
 * @see {@link https://docs.deno.com/go/compile `deno compile`, standalone executables}
 */
export interface CompileOptions
  extends ScriptOptions, TypeCheckingOptions, PermissionOptions {
  /**
   * Excludes files/directories in the compiled executable.
   */
  exclude?: string[];
  /**
   * Includes additional modules or files/directories in the compiled
   * executable.
   */
  include?: string[];
  /** Set the icon of the executable on Windows (.ico). */
  icon?: string;
  /**
   * Show terminal on Windows.
   * @default {true}
   */
  terminal?: boolean;
  /**
   * Output file for the compiled binary.
   * @default {"$PWD/<inferred-name>"}
   */
  output?: string;
  /**
   * Target OS architecture.
   * @default {Deno.build.target}
   */
  target?: TargetArchitecture;
}

/**
 * Options for the {@linkcode Deno.fmt} function.
 *
 * @see {@link https://docs.deno.com/runtime/reference/cli/fmt/ `deno fmt`, code formatting}
 */
export interface FormatOptions extends FileWatchingOptions {
  /** Check if the source files are formatted. */
  check?: boolean;
  /** Set content type of the supplied files. */
  ext?: string;
  /** Ignore formatting particular source files. */
  ignore?: string[];
  /**
   * Define indentation width.
   * @default {2}
   */
  indentWidth?: number;
  /**
   * Define maximum line width.
   * @default {80}
   */
  lineWidth?: number;
  /**
   * Use semicolons except where necessary.
   * @default {true}
   */
  semicolons?: boolean;
  /**
   * Define how prose should be wrapped.
   * @default {"always"}
   */
  proseWrap?: "always" | "never" | "preserve";
  /**
   * Use single quotes.
   * @default {false}
   */
  singleQuote?: boolean;
  /** Use tabs instead of spaces for indentation. */
  useTabs?: boolean;
  /** Enable formatting Svelte, Vue, Astro and Angular files. */
  unstableComponent?: boolean;
  /** Enable formatting SQL files. */
  unstableSql?: boolean;
}

/**
 * Options for the {@linkcode Deno.lint} function.
 *
 * @see {@link https://docs.deno.com/runtime/reference/cli/lint/ `deno lint`, linter}
 */
export interface LintOptions extends FileWatchingOptions {
  /**
   * Output lint result in compact format.
   * @default {false}
   */
  compact?: boolean;
  /**
   * Fix any linting errors for rules that support it.
   * @default {false}
   */
  fix?: boolean;
  /** Ignore linting particular source files. */
  ignore?: string[];
  /** Output lint result in JSON format. */
  json?: boolean;
  /** Exclude lint rules. */
  rulesExclude?: string[];
  /** Include lint rules. */
  rulesInclude?: string[];
  /** Use set of rules with a tag. */
  rulesTags?: string[];
}

/** Options for the {@linkcode deno} function. */
export interface DenoOptions {
  /**
   * Change the working directory for deno commands.
   * @default {"."}
   */
  cwd?: string;
}

/**
 * Creates a new {@linkcode Deno} instance for a directory for running
 * deno commands.
 */
export function deno(options?: DenoOptions): Deno {
  const denoOptions = options ?? {};
  return {
    async compile(script, options) {
      await run(
        denoOptions,
        "compile",
        ...typeCheckingArgs(options),
        ...permissionArgs(options),
        flag("--exclude", options?.exclude),
        flag("--include", options?.include),
        flag("--icon", options?.icon),
        flag("--no-terminal", options?.terminal === false),
        flag("--output", options?.output),
        flag("--target", options?.target),
        script,
        options?.scriptArgs,
      );
    },
    async fmt(files, options) {
      await run(
        denoOptions,
        "fmt",
        ...fileWatchingArgs(options),
        flag("--check", options?.check),
        flag("--ext", options?.ext),
        flag("--ignore=", options?.ignore),
        flag("--indent-width", options?.indentWidth),
        flag("--line-width", options?.lineWidth),
        flag("--no-semicolons", options?.semicolons === false),
        flag("--prose-wrap", options?.proseWrap),
        flag("--single-quote", options?.singleQuote),
        flag("--use-tabs", options?.useTabs),
        flag("--unstable-component", options?.unstableComponent),
        flag("--unstable-sql", options?.unstableSql),
        ...files,
      );
    },
    async lint(files, options) {
      await run(
        denoOptions,
        "lint",
        ...fileWatchingArgs(options),
        flag("--compact", options?.compact),
        flag("--fix", options?.fix),
        flag("--ignore=", options?.ignore),
        flag("--json", options?.json),
        flag("--rules-exclude=", options?.rulesExclude),
        flag("--rules-include=", options?.rulesInclude),
        flag("--rules-tags=", options?.rulesTags),
        ...files,
      );
    },
    async test() {
      await run(
        denoOptions,
        "test",
        // "--quiet",
        // options?.allowAll ? "--allow-all" : false,
        // options?.permissionSet ? `--allow=${options.permissionSet}` : false,
        // options?.noPrompt ? "--no-prompt" : false,
      );
    },
  };
}

function fileWatchingArgs(
  options?: FileWatchingOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--watch", options?.watch),
    flag("--watch-exclude=", options?.watchExclude),
    flag("--no-clear-screen", options?.clearScreen === false),
  ];
}

function typeCheckingArgs(
  options?: TypeCheckingOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--check=", options?.check),
    flag("--no-check", options?.check === false),
  ];
}

function permissionArgs(
  options?: PermissionOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--allow-all", options?.allowAll),
    flag("--permission-set=", options?.permissionSet),
    flag("--no-prompt", options?.prompt === false),
    flag("--allow-read=", options?.allowRead),
    flag("--deny-read=", options?.denyRead),
    flag("--allow-write=", options?.allowWrite),
    flag("--deny-write=", options?.denyWrite),
    flag("--allow-import=", options?.allowImport),
    flag("--deny-import=", options?.denyImport),
    flag("--allow-net=", options?.allowNet),
    flag("--deny-net=", options?.denyNet),
    flag("--allow-env=", options?.allowEnv),
    flag("--deny-env=", options?.denyEnv),
    flag("--allow-sys=", options?.allowSys),
    flag("--deny-sys=", options?.denySys),
    flag("--allow-run=", options?.allowRun),
    flag("--deny-run=", options?.denyRun),
    flag("--allow-ffi=", options?.allowFfi),
    flag("--deny-ffi=", options?.denyFfi),
  ];
}

function flag<T>(
  flag: string,
  value?: boolean | NonNullable<T> | NonNullable<T>[],
): string | string[] | undefined {
  const equalSign = flag.endsWith("=");
  if (equalSign) flag = flag.slice(0, -1);
  if (!value) return undefined;
  if (value === true) return flag;
  if (equalSign) {
    if (Array.isArray(value)) return `${flag}=${value.join(",")}`;
    return `${flag}=${value}`;
  } else {
    if (Array.isArray(value)) {
      return value.map((x) => [flag, x.toString()]).flat();
    }
    return [flag, value.toString()];
  }
}

async function run(
  options: DenoOptions,
  ...commandArgs: (string | string[] | false | undefined)[]
): Promise<string> {
  const { cwd = "." } = options ?? {};
  const args = commandArgs.filter((x) => x !== false && x !== undefined).flat();
  const command = new Deno.Command("deno", {
    cwd,
    args,
    stdin: "null",
    stdout: "piped",
    env: { NO_COLOR: "true" },
  });
  try {
    const { code, stdout, stderr } = await command.output();
    if (code !== 0) {
      const error = new TextDecoder().decode(stderr.length ? stderr : stdout);
      throw new DenoError(`Error running deno command: deno ${args}`, {
        cause: { command: "deno", args, code, error },
      });
    }
    return new TextDecoder().decode(stdout).trimEnd();
  } catch (e: unknown) {
    if (e instanceof Deno.errors.NotCapable) {
      throw new DenoError("Permission error (use `--allow-run=deno`)", {
        cause: e,
      });
    }
    throw e;
  }
}
