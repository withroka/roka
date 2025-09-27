/**
 * A library for programmatically invoking [deno](https://docs.deno.com).
 *
 * This package provides incomplete functionality to run deno commands. It is
 * intended to be used as a building block for higher-level abstractions. It
 * uses the locally installed deno binary.
 *
 * @todo Add suppot for global flags.
 * @todo Add support for unstable features.
 *
 * @module deno
 */

import { omit } from "@std/collections";

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
   * Retrieve the help text from the deno binary.
   *
   * If `command` is provided, the help text for that specific command is
   * returned. Otherwise, the general help text is returned.
   */
  help(command?: keyof Deno, options?: HelpOptions): Promise<string>;
  /**
   * Download and type-check without execution.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/check/ `deno check`}
   */
  check(files: string[], options?: CheckOptions): Promise<void>;
  /**
   * Compiles the given script into a self contained executable.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/compile/ `deno compile`}
   */
  compile(script: string, options?: CompileOptions): Promise<void>;
  /**
   * Auto-format various file types.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/fmt/ `deno fmt`}
   */
  fmt(files: string[], options?: FormatOptions): Promise<void>;
  /**
   * Lint JavaScript/TypeScript source code.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/lint/ `deno lint`}
   */
  lint(files: string[], options?: LintOptions): Promise<void>;
  /**
   * Run tests using Deno's built-in test runner.
   *
   * @see {@link https://docs.deno.com/runtime/reference/cli/test/ `deno test`}
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
  /**
   * Configure different aspects of deno including TypeScript, linting, and
   * code formatting.
   *
   * Typically the configuration file will be called `deno.json` or `deno.jsonc`
   * and automatically detected; in that case this flag is not necessary.
   *
   * If set to `false`, automatic loading of the configuration file will be
   * disabled.
   *
   * @see {@link https://docs.deno.com/runtime/fundamentals/configuration/ Configuration in Deno}
   *
   * @default {true}
   */
  config?: boolean | string;
  /**
   * Suppress diagnostic output.
   * @default {false}
   */
  quiet?: boolean;
}

/**
 * Options for the {@linkcode Deno.help} function.
 */
export interface HelpOptions {
  /**
   * Configure the help context for a specific command.
   *
   * If set to `"unstable"`, the help text for unstable features is shown. If
   * set to `"full"`, the help text for all features is shown. Default is the
   * general help text mainly for stable features.
   *
   * @default {undefined}
   */
  context?: "unstable" | "full";
}

/** Options for the {@linkcode Deno.check} function. */
export interface CheckOptions
  extends
    Omit<DenoOptions, "ext">,
    Pick<RuntimeOptions, "cert" | "conditions" | "codeCache" | "preload">,
    DependendencyManagementOptions,
    Pick<PermissionOptions, "allowImport" | "denyImport"> {
  /**
   * Type-check all code, including remote modules and npm packages
   * @default {false}
   */
  all?: boolean;
  /**
   * Type-check code blocks in JSDoc as well as actual code.
   *
   * If set to `"only"`, only code blocks in JSDoc are checked.
   *
   * @default {false}
   */
  doc?: boolean | "only";
}

/** Options for the {@linkcode Deno.compile} function. */
export interface CompileOptions
  extends
    DenoOptions,
    Omit<FileOptions<ScriptExtension>, "permitNoFiles">,
    RuntimeOptions,
    TypeCheckingOptions,
    DependendencyManagementOptions,
    PermissionOptions,
    ScriptOptions {
  /** Excludes files/directories in the compiled executable. */
  exclude?: string[];
  /**
   * Includes additional modules or files/directories in the compiled
   * executable.
   */
  include?: (string | URL)[];
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

/** Options for the {@linkcode Deno.fmt} function. */
export interface FormatOptions
  extends DenoOptions, FileOptions<FileExtension>, FileWatchingOptions {
  /** Check if the source files are formatted. */
  check?: boolean;
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

/** Options for the {@linkcode Deno.lint} function. */
export interface LintOptions
  extends
    DenoOptions,
    FileOptions<FileExtension>,
    FileWatchingOptions,
    Pick<PermissionOptions, "allowImport" | "denyImport"> {
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

/** Options for the {@linkcode Deno.test} function. */
export interface TestOptions
  extends
    DenoOptions,
    FileOptions<ScriptExtension>,
    Omit<RuntimeOptions, "codeCache">,
    TypeCheckingOptions,
    FileWatchingOptions,
    DebuggingOptions,
    DependendencyManagementOptions,
    PermissionOptions,
    ScriptOptions {
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
  filter?: string | RegExp;
  /** Ignore files. */
  ignore?: string[];
  /**
   * Write a JUnit XML test report to path.
   *
   * Writes to stdout if set to `-`.
   */
  junitPath?: string;
  /**
   * Run test modules in parallel.
   *
   * If set to `true`, parallelism defaults to the number of available CPUs or
   * the value of the `DENO_JOBS` environment variable.
   *
   * @default {false}
   */
  parallel?: boolean | number;
  /**
   * Run tests.
   *
   * If set to `false`, only caches the test modules, but doesn't run tests.
   *
   * @default {true}
   */
  run?: boolean;
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
   * Hide stack traces for errors in failure test results.
   * @default {false}
   */
  hideStacktraces?: boolean;
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
 * Options for commands that run on a list of files, such as the
 * {@linkcode Deno.lint} and {@linkcode Deno.format} functions.
 */
export interface FileOptions<Extensions extends string> {
  /**
   * Set content type of the supplied files.
   */
  ext?: Extensions;
  /**
   * Don't return an error code if no files were found
   * @default {false}
   */
  permitNoFiles?: boolean;
}

/**
 * Options for commands that accept runtime flags, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 */
export interface RuntimeOptions {
  /**
   * Allow running npm lifecycle scripts for the given packages.
   *
   * If set to `true`, scripts will be allowed for all packages.
   *
   * Scripts will only be executed when using a node_modules directory
   * ({@linkcode DependendencyManagementOptions.nodeModulesDir}).
   *
   * @default {false}
   */
  allowScripts?: boolean | string[];
  /** Load certificate authority from PEM encoded file. */
  cert?: string;
  /**
   * Require that remote dependencies are already cached.
   * @default {false}
   */
  cachedOnly?: boolean;
  /**
   * Use V8 code cache feature.
   * @default {true}
   */
  codeCache?: boolean;
  /** Specify custom conditions for npm package exports. */
  conditions?: string[];
  /**
   * Load environment variables from local file.
   *
   * Only the first environment variable with a given key is used.
   *
   * Existing process environment variables are not overwritten, so if
   * variables with the same names already exist in the environment, their
   * values will be preserved.
   *
   * Where multiple declarations for the same environment variable exist in
   * your .env file, the first one encountered is applied. This is determined
   * by the order of the files you pass as arguments.
   *
   * If set to `true`, the default file of `.env` will be used.
   */
  envFile?: boolean | string;
  /** Value of `globalThis.location` used by some web APIs. */
  location?: string | URL;
  /** A list of files that will be executed before the main module. */
  preload?: (string | URL)[];
  /** Set the random number generator seed. */
  seed?: number;
  /** Set V8 command line options. */
  v8Flags?: string[];
}

/**
 * Options for commands that accept type checking flags, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
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
 */
export interface DebuggingOptions {
  /**
   * Activate inspector on host:port.
   *
   * If set to `true`, the default host:port of `"127.0.0.1:9229" will be used.
   *
   * @default {false}
   */
  inspect?: boolean | string;
  /**
   * Activate inspector on host:port, wait for debugger to connect and break
   * at the start of user script.
   *
   * If set to `true`, the default host:port of `"127.0.0.1:9229" will be used.
   *
   * @default {false}
   */
  inspectBrk?: boolean | string;
  /**
   * Activate inspector on host:port and wait for debugger to connect before
   * running user code.
   *
   * If set to `true`, the default host:port of `"127.0.0.1:9229" will be used.
   *
   * @default {false}
   */
  inspectWait?: boolean | string;
}

/**
 * Options for commands that accept dependency management flags, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 */
export interface DependendencyManagementOptions {
  /**
   * Error out if lockfile is out of date.
   * @default {false}
   */
  frozen?: boolean;
  /**
   * Load import map file from local file or remote URL.
   * @default {false}
   */
  importMap?: string | URL;
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
   * Resolve remote modules.
   * @default {true}
   */
  remote?: boolean;
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
 * Options for commands that accept script arguments, such as the
 * {@linkcode Deno.run} and {@linkcode Deno.test} functions.
 */
export interface ScriptOptions {
  /** Arguments to pass to the script. */
  scriptArgs?: string[];
}

export type ScriptExtension =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "mts"
  | "mjs"
  | "cts"
  | "cjs";

export type FileExtension =
  | ScriptExtension
  | "md"
  | "json"
  | "jsonc"
  | "css"
  | "scss"
  | "sass"
  | "less"
  | "html"
  | "svelte"
  | "vue"
  | "astro"
  | "yml"
  | "yaml"
  | "ipynb"
  | "sql"
  | "vto"
  | "njk";

/**
 * Creates a new {@linkcode Deno} instance for a directory for running
 * deno commands.
 */
export function deno(options?: DenoOptions): Deno {
  function merge<T extends DenoOptions>(other?: T): DenoOptions {
    return { ...omit(options ?? {}, ["cwd"]), ...other ?? {} };
  }
  return {
    async help(command, options) {
      return await run(
        merge({}),
        args([
          command ?? "help",
          flag("--help=", options?.context ?? command !== undefined),
        ]),
      );
    },
    async check(files, options) {
      options = merge(options);
      await run(
        options,
        args([
          "check",
          ...commonArgs(options),
          ...runtimeArgs(options),
          ...dependendencyManagementArgs(options),
          ...permissionArgs(options),
          flag("--all", options?.all),
          flag("--doc", options?.doc === true),
          flag("--doc-only", options?.doc === "only"),
          ...files,
        ]),
        permissionEnv(options),
      );
    },
    async compile(script, options) {
      options = merge(options);
      await run(
        options,
        args([
          "compile",
          ...commonArgs(options),
          ...runtimeArgs(options),
          ...typeCheckingArgs(options),
          ...dependendencyManagementArgs(options),
          ...permissionArgs(options),
          flag("--exclude", options?.exclude),
          flag("--include", options?.include),
          flag("--icon", options?.icon),
          flag("--no-terminal", options?.terminal === false),
          flag("--output", options?.output),
          flag("--target", options?.target),
          script,
          options?.scriptArgs,
        ]),
        permissionEnv(options),
      );
    },
    async fmt(files, options) {
      options = merge(options);
      await run(
        options,
        args([
          "fmt",
          ...commonArgs(options),
          ...fileArgs(options),
          ...fileWatchingArgs(options),
          flag("--check", options?.check),
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
        ]),
      );
    },
    async lint(files, options) {
      options = merge(options);
      await run(
        options,
        args([
          "lint",
          ...commonArgs(options),
          ...fileArgs(options),
          ...fileWatchingArgs(options),
          ...permissionArgs(options),
          flag("--compact", options?.compact),
          flag("--fix", options?.fix),
          flag("--ignore=", options?.ignore),
          flag("--json", options?.json),
          flag("--rules-exclude=", options?.rulesExclude),
          flag("--rules-include=", options?.rulesInclude),
          flag("--rules-tags=", options?.rulesTags),
          ...files,
        ]),
      );
    },
    async test(files, options) {
      options = merge(options);
      await run(
        options,
        args([
          "test",
          ...commonArgs(options),
          ...fileArgs(options),
          ...runtimeArgs(options),
          ...typeCheckingArgs(options),
          ...fileWatchingArgs(options),
          ...debugingArgs(options),
          ...dependendencyManagementArgs(options),
          ...permissionArgs(options),
          flag("--clean", options?.clean),
          flag("--coverage=", options?.coverage),
          flag("--coverage-raw-data-only", options?.coverageRawDataOnly),
          flag("--doc", options?.doc),
          flag("--fail-fast=", options?.failFast),
          flag("--filter", options?.filter),
          flag("--ignore=", options?.ignore),
          flag("--junit-path", options?.junitPath),
          flag("--parallel", !!(options?.parallel ?? false)),
          flag("--no-run", options?.run === false),
          flag("--reporter", options?.reporter),
          flag("--shuffle=", options?.shuffle),
          flag("--hide-stacktraces", options?.hideStacktraces),
          flag("--trace-leaks", options?.traceLeaks),
          ...files,
          options?.scriptArgs,
        ]),
        {
          ...typeof options?.parallel === "number" &&
            { DENO_JOBS: options.parallel.toString() },
          ...permissionEnv(options),
        },
      );
    },
  };
}

function commonArgs(
  options?: DenoOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--config", options?.config),
    flag("--no-config", options?.config === false),
    flag("--quiet", options?.quiet),
  ];
}

function fileArgs(
  options?: FileOptions<FileExtension>,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--ext=", options?.ext),
    flag("--permit-no-files", options?.permitNoFiles),
  ];
}

function runtimeArgs(
  options?: RuntimeOptions,
): (ReturnType<typeof flag>)[] {
  return [
    flag("--allow-scripts=", options?.allowScripts),
    flag("--cert", options?.cert),
    flag("--cached-only", options?.cachedOnly),
    flag("--conditions=", options?.conditions),
    flag("--no-code-cache", options?.codeCache === false),
    flag("--env-file=", options?.envFile),
    flag("--location", options?.location),
    flag("--preload", options?.preload),
    flag("--seed", options?.seed),
    flag("--v8-flags=", options?.v8Flags),
  ];
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

type Value = boolean | number | string | RegExp | URL | (string | URL)[];

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

function args(args: (string | string[] | undefined)[]): string[] {
  return args.filter((x) => x !== undefined).flat() as string[];
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
      throw new DenoError(
        `Error running deno command: ${args[0]}\n\n${error}`,
        {
          cause: { command: "deno", args, code, error },
        },
      );
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
