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
  compile(scripts: string[], options?: CompileOptions): Promise<void>;
  fmt(): Promise<void>;
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
   * @default {false}
   */
  permissionSet?: boolean;
  /**
   * Always throw if required permission wasn't passed.
   * @default {false}
   */
  noPrompt?: boolean;
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
   * Do not clear terminal screen when under watch mode.
   * @default {false}
   */
  noClearScreen?: boolean;
}

/**
 * Options for the {@linkcode Deno.compile} function.
 *
 * @see {@link https://docs.deno.com/go/compile `deno compile`, standalone executables}
 */
export interface CompileOptions extends TypeCheckingOptions, PermissionOptions {
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
  /** Hide terminal on Windows. */
  noTerminal?: boolean;
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
    async compile(scripts, options) {
      if (scripts.length === 0) {
        throw new DenoError("Provide at least one script to compile");
      }
      await run(
        denoOptions,
        "compile",
        ...typeCheckingArgs(options),
        ...permissionArgs(options),
        options?.exclude?.map((x) => ["--exclude", x]).flat(),
        options?.include?.map((x) => ["--include", x]).flat(),
        options?.icon && ["--icon", options.icon],
        options?.noTerminal && ["--no-terminal"],
        options?.output && ["--output", options.output],
        options?.target && ["--target", options.target],
        ...scripts,
      );
    },
    async fmt() {
      await run(denoOptions, "fmt", "--quiet");
    },
    async lint(files, options) {
      await run(
        denoOptions,
        "lint",
        ...fileWatchingArgs(options),
        options?.compact && ["--compact"],
        options?.fix && ["--fix"],
        options?.ignore?.map((x) => ["--ignore", x]).flat(),
        options?.json && ["--json"],
        options?.rulesExclude?.map((x) => ["--rules-exclude", x]).flat(),
        options?.rulesInclude?.map((x) => ["--rules-include", x]).flat(),
        options?.rulesTags?.map((x) => ["--rules-tags", x]).flat(),
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

function fileWatchingArgs(options?: FileWatchingOptions): string[] {
  if (!options?.watch && options?.watchExclude) {
    throw new DenoError("`watchExclude` requires `watch` to be enabled");
  }
  if (!options?.watch && options?.noClearScreen) {
    throw new DenoError("`noClearScreen` requires `watch` to be enabled");
  }

  return [
    options?.watch ? "--watch" : undefined,
    options?.watchExclude
      ? options.watchExclude.map((x) => ["--watch-exclude", x]).flat()
      : undefined,
    options?.noClearScreen ? "--no-clear-screen" : undefined,
  ].filter((x) => x !== undefined).flat();
}

function typeCheckingArgs(options?: TypeCheckingOptions): string[] {
  return [
    options?.check === true ? "--check" : undefined,
    options?.check === "all" ? "--check=all" : undefined,
    options?.check === false ? "--no-check" : undefined,
  ].filter((x) => x !== undefined);
}

function permissionArgs(options?: PermissionOptions): string[] {
  return [
    options?.allowAll ? "--allow-all" : undefined,
    options?.permissionSet ? "--permission-set" : undefined,
    options?.noPrompt ? "--no-prompt" : undefined,
  ].filter((x) => x !== undefined);
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
