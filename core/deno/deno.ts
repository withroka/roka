/**
 * A library for programmatically invoking [deno](https://docs.deno.com).
 *
 * This package provides incomplete functionality to run deno commands. It is
 * intended to be used as a building block for higher-level abstractions. It
 * uses the locally installed deno binary.
 *
 * @todo Add common deno options.
 * @todo Add dependency management options.
 * @todo Add support for URL.
 * @todo Add support for RegExp.
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
  /**
   * Run tests using Deno's built-in test runner.
   *
   * @see {@link https://docs.deno.com/go/test `deno test`
   */
  test(files: string[], options?: TestOptions): Promise<void>;
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
   *
   * The target can be an [LLVM](https://llvm.org/) target triple, which is the
   * combination of `${arch}-${vendor}-${os}`.
   *
   * @default {Deno.build.target}
   */
  target?: string;
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

/**
 * Options for the {@linkcode Deno.test} function.
 *
 * @see {@link https://docs.deno.com/go/test `deno test`}
 */
export interface TestOptions
  extends
    ScriptOptions,
    TypeCheckingOptions,
    FileWatchingOptions,
    DebuggingOptions,
    DependendencyManagementOptions,
    PermissionOptions {
  /**
   * Empty the temporary coverage profile data directory before running tests.
   *
   * Note: running multiple `deno test --clean` calls in series or parallel for
   * the same coverage directory may cause race conditions.
   *
   * @default {false}
   */
  clean?: boolean;
  /**
   * Collect coverage profile data into directory.
   *
   * If set to `true`, the coverage data will be written to `coverage/`.
   *
   * @default {false}
   */
  coverage?: boolean | string;
  /**
   * Only collect raw coverage data, without generating a report.
   * @default {false}
   */
  coverageRawDataOnly?: boolean;
  /**
   * Evaluate code blocks in JSDoc and Markdown.
   * @default {false}
   */
  doc?: boolean;
  /**
   * Stop after N errors.
   *
   * If set to `true`, stops after the first error.
   *
   * @default {false}
   */
  failFast?: boolean | number;
  /**
   * Run tests with this string or regular expression pattern in the test name.
   */
  filter?: string;
  /**
   * Write a JUnit XML test report to path.
   *
   * Writes to stdout if set to `-`.
   */
  junitPath?: string;
  /**
   * Run tests.
   *
   * If set to `false`, only caches the test modules, but doesn't run tests.
   *
   * @default {true}
   */
  run?: boolean;
  /**
   * Don't return an error code if no files were found
   * @default {false}
   */
  permitNoFiles?: boolean;
  /**
   * Select reporter to use.
   * @default {"pretty"}
   */
  reporter?: "pretty" | "dot" | "junit" | "tap";
  /**
   * Shuffle the order in which the tests are run.
   *
   * If set to a number, it will be used as the seed for the random number
   * generator.
   *
   * @default {false}
   */
  shuffle?: boolean | number;
  /**
   * Enable tracing of leaks.
   *
   * Useful when debugging leaking ops in test, but impacts test execution time.
   *
   * @default {false}
   */
  traceLeaks?: boolean;
}

/**
 * Options for commands that accept script arguments, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 */
export interface ScriptOptions {
  /** Arguments to pass to the script. */
  scriptArgs?: string[];
}

/**
 * Options for commands that accept type checking flags, such as the
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
 * Options for commands that accept file watching flags, such as the
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
 * Options for commands that accept debugging flags, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 *
 * @see {@link https://docs.deno.com/runtime/fundamentals/debugging/ Debugging}
 */
export interface DebuggingOptions {
  /**
   * Activate inspector on host:port.
   *
   * If set to `true`, the default host:port of `"127.0.0.1:9229" will be used.
   *
   * @default {false}
   */
  inspect?: string | true;
  /**
   * Activate inspector on host:port, wait for debugger to connect and break
   * at the start of user script.
   *
   * If set to `true`, the default host:port of `"127.0.0.1:9229" will be used.
   *
   * @default {false}
   */
  inspectBrk?: string | true;
  /**
   * Activate inspector on host:port and wait for debugger to connect before
   * running user code.
   *
   * If set to `true`, the default host:port of `"127.0.0.1:9229" will be used.
   *
   * @default {false}
   */
  inspectWait?: string | true;
}

/**
 * Options for commands that accept dependency management flags, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 *
 * @see {@link https://docs.deno.com/runtime/fundamentals/modules/ Modules and dependencies}
 * @see {@link https://docs.deno.com/runtime/fundamentals/node/ Node and npm Compatibility}
 */
export interface DependendencyManagementOptions {
  /**
   * Require that remote dependencies are already cached.
   * @default {false}
   */
  cachedOnly?: boolean;
  /**
   * Error out if lockfile is out of date.
   * @default {false}
   */
  frozen?: boolean;
  /**
   * Load import map file from local file or remote URL.
   * @default {false}
   */
  importMap?: string;
  /**
   * Check the specified lock file.
   *
   * Setting to `false` disables auto discovery of the lock file.
   *
   * @default {"./deno.lock"}
   */
  lock?: boolean | string;
  /**
   * Resolve npm modules.
   * @default {true}
   */
  npm?: boolean;
  /**
   * Resolve remote modules.
   * @default {true}
   */
  remote?: boolean;
  /**
   * Sets the node modules management mode for npm packages.
   * @default {"none"}
   */
  nodeModulesDir?: "auto" | "manual" | "none";
  /**
   * Reload source code cache (recompile TypeScript).
   *
   * If set to `true`, everything will be reloaded.
   *
   * @default {false}
   */
  reload?: boolean | string[];
  /**
   * Toggles local vendor folder usage for remote modules and a node_modules
   * folder for npm packages.
   * @default {false}
   */
  vendor?: boolean;
}

/**
 * Options for commands that accept permission flags, such as the
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
  /**
   * Enable stack traces in permission prompts.
   * @default {false}
   */
  tracePermissions?: boolean;
  /** Generate a JSONL file with all permissions accesses. */
  auditPermissions?: string;
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
        args([
          "compile",
          flag("--exclude", options?.exclude),
          flag("--include", options?.include),
          flag("--icon", options?.icon),
          flag("--no-terminal", options?.terminal === false),
          flag("--output", options?.output),
          flag("--target", options?.target),
          ...typeCheckingArgs(options),
          ...permissionArgs(options),
          script,
          options?.scriptArgs,
        ]),
        permissionEnv(options),
      );
    },
    async fmt(files, options) {
      await run(
        denoOptions,
        args([
          "fmt",
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
          ...fileWatchingArgs(options),
          ...files,
        ]),
      );
    },
    async lint(files, options) {
      await run(
        denoOptions,
        args([
          "lint",
          flag("--compact", options?.compact),
          flag("--fix", options?.fix),
          flag("--ignore=", options?.ignore),
          flag("--json", options?.json),
          flag("--rules-exclude=", options?.rulesExclude),
          flag("--rules-include=", options?.rulesInclude),
          flag("--rules-tags=", options?.rulesTags),
          ...fileWatchingArgs(options),
          ...files,
        ]),
      );
    },
    async test(files, options) {
      await run(
        denoOptions,
        args([
          "test",
          flag("--clean", options?.clean),
          flag("--coverage=", options?.coverage),
          flag("--coverage-raw-data-only", options?.coverageRawDataOnly),
          flag("--doc", options?.doc),
          flag("--fail-fast=", options?.failFast),
          flag("--filter", options?.filter),
          flag("--junit-path", options?.junitPath),
          flag("--no-run", options?.run === false),
          flag("--permit-no-files", options?.permitNoFiles),
          flag("--reporter", options?.reporter),
          flag("--shuffle=", options?.shuffle),
          flag("--trace-leaks", options?.traceLeaks),
          ...typeCheckingArgs(options),
          ...fileWatchingArgs(options),
          ...debugingArgs(options),
          ...dependendencyManagementArgs(options),
          ...permissionArgs(options),
          ...files,
          options?.scriptArgs,
        ]),
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
  return args([
    flag("--check=", options?.check),
    flag("--no-check", options?.check === false),
  ]);
}

function debugingArgs(
  options?: DebuggingOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--inspect=", options?.inspect),
    flag("--inspect-brk=", options?.inspectBrk),
    flag("--inspect-wait=", options?.inspectWait),
  ];
}

function dependendencyManagementArgs(
  options?: DependendencyManagementOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--cached-only", options?.cachedOnly),
    flag("--frozen", options?.frozen),
    flag("--import-map", options?.importMap),
    flag("--lock", typeof options?.lock === "string" && options?.lock),
    flag("--no-lock", options?.lock === false),
    flag("--no-npm", options?.npm === false),
    flag("--no-remote", options?.remote === false),
    flag("--node-modules-dir=", options?.nodeModulesDir),
    flag("--reload=", options?.reload),
    flag("--vendor", options?.vendor),
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

function permissionEnv(
  options?: PermissionOptions,
): Record<string, string> {
  return env({
    DENO_TRACE_PERMISSIONS: options?.tracePermissions,
    DENO_AUDIT_PERMISSIONS: options?.auditPermissions,
  });
}

type Value = boolean | number | string | string[];

function flag(
  flag: string,
  value: Value | undefined,
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

function args(args: (string | string[] | false | undefined)[]): string[] {
  return args.filter((x) => x !== false && x !== undefined).flat() as string[];
}

function env(env: Record<string, Value | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    if (value === true) {
      result[key] = "1";
    } else if (Array.isArray(value)) {
      result[key] = value.join(",");
    } else {
      result[key] = value.toString();
    }
  }
  return result;
}

async function run(
  options: DenoOptions,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  const { cwd = "." } = options ?? {};
  const command = new Deno.Command("deno", {
    cwd,
    args,
    stdin: "null",
    stdout: "piped",
    env: { NO_COLOR: "1", ...env },
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
