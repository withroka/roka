/**
 * A library for programmatically invoking [deno](https://docs.deno.com).
 *
 * This package provides incomplete functionality to run deno commands. It is
 * intended to be used as a building block for higher-level abstractions. It
 * uses the locally installed deno binary.
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
  lint(): Promise<void>;
  test(): Promise<void>;
}

export type TargetArchitecture =
  | "x86_64-unknown-linux-gnu"
  | "aarch64-unknown-linux-gnu"
  | "x86_64-pc-windows-msvc"
  | "x86_64-apple-darwin"
  | "aarch64-apple-darwin";

/**
 * Options common to operations that need a permission specification, such as
 * the {@linkcode Deno.compile} and {@linkcode Deno.test} functions.
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
 * Options for the {@linkcode Deno.compile} function.
 *
 * @see {@link https://docs.deno.com/go/compile `deno compile`, standalone executables}
 */
export interface CompileOptions extends PermissionOptions {
  /**
   * Excludes a files/directories in the compiled executable.
   */
  exclude?: string[];
  /**
   * Includes additional modules or files/directories in the compiled
   * executable.
   */
  include?: string[];
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
        ...permissionArgs(options),
        options?.exclude?.map((x) => ["--exclude", x]).flat(),
        options?.include?.map((x) => ["--include", x]).flat(),
        options?.output && ["--output", options.output],
        options?.target && ["--target", options.target],
        ...scripts,
      );
    },
    async fmt() {
      await run(denoOptions, "fmt", "--quiet");
    },
    async lint() {
      await run(denoOptions, "lint", "--quiet");
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
