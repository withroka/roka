/**
 * This module provides common fake objects for testing.
 *
 * These fake objects override various standard global objects for testing.
 * They follow the mocking conventions of the Deno standard library. In
 * addition, fake objects implement the `Disposable` interface, allowing them
 * to be used with the `using` statement for automatic cleanup.
 *
 * The {@linkcode fakeArgs} function creates a fake script arguments array
 * that overrides `Deno.args`. Code being tested reads from this array to get
 * script arguments.
 *
 * ```ts
 * import { fakeArgs } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using _ = fakeArgs(["arg1", "arg2"]);
 * assertEquals(Deno.args, ["arg1", "arg2"]);
 * ```
 *
 * The {@linkcode fakeEnv} function creates a fake environment variables
 * object that overrides `Deno.env`. Code being tested reads from and updates
 * environment variables of this object.
 *
 * ```ts
 * import { fakeEnv } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using env = fakeEnv({ ENV: "value" });
 * assertEquals(env.get("ENV"), "value");
 * ```
 *
 * The {@linkcode fakeConsole} overrides the global `console` object and
 * records calls to its log methods. This object records calls to the console
 * from the code being tested.
 *
 * ```ts
 * // deno-lint-ignore-file no-console
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using console = fakeConsole();
 * console.log("I won't be printed");
 * assertEquals(console.output(), "I won't be printed");
 * ```
 *
 * The {@linkcode fakeCommand} function creates a fake replacement for the
 * `Deno.Command` class. This allows testing code that spawns subprocesses
 * without actually running commands.
 *
 * ```ts
 * import { fakeCommand } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using _ = fakeCommand({
 *   cat: [{ code: 0, stdout: "Hello, World!\n" }],
 * });
 * const cmd = new Deno.Command("cat", { args: ["greeting.txt"] });
 * const { stdout } = await cmd.output();
 * assertEquals(new TextDecoder().decode(stdout), "Hello, World!\n");
 * ```
 *
 * @module fake
 */

import { assertExists } from "@std/assert";
import { waitFor } from "@std/async/unstable-wait-for";
import { stripAnsiCode } from "@std/fmt/colors";
import { toArrayBuffer, toJson, toText } from "@std/streams";
import { MockError, stub } from "@std/testing/mock";

/** Fake script arguments returned by the {@linkcode fakeArgs} function. */
export interface FakeArgs {
  /** The fake script arguments. */
  args: string[];
  /** Whether the original `Deno.args` instance has been restored. */
  restored: boolean;
  /** Restores the original `Deno.args` instance. */
  restore(): void;
}

/**
 * Create a fake replacement for script arguments supplied by `Deno.args`.
 *
 * Useful for testing command-line applications.
 *
 * @example Use fake script arguments for testing.
 * ```ts
 * import { fakeArgs } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using _ = fakeArgs(["arg1", "arg2"]);
 * assertEquals(Deno.args, ["arg1", "arg2"]);
 * ```
 */
export function fakeArgs(args: string[]): FakeArgs & Disposable {
  const original = Object.getOwnPropertyDescriptor(Deno, "args");
  assertExists(original);
  if ("fake" in (original.get ?? {})) {
    throw new MockError("Cannot create fakeArgs: another fake is active");
  }
  const fake = {
    args,
    get restored() {
      return Object.getOwnPropertyDescriptor(Deno, "args")?.get ===
        original.get;
    },
    restore() {
      if (this.restored) {
        throw new MockError("Cannot restore: fakeArgs already restored");
      }
      Object.defineProperties(Deno, { args: original });
    },
    [Symbol.dispose]: () => fake.restore(),
  };
  Object.defineProperties(Deno, {
    args: {
      get: Object.defineProperties(() => fake.args, { fake: { value: true } }),
    },
  });
  return fake;
}

/** Fake environment variables returned by the {@linkcode fakeEnv} function. */
export interface FakeEnv extends Deno.Env {
  /** Whether the original `Deno.env` instance has been restored. */
  restored: boolean;
  /** Restores the original `Deno.env` instance. */
  restore(): void;
}

/**
 * Create a fake replacement for environment variables supplied by `Deno.env`.
 *
 * Useful for supplying and manipulating environment variables in tests.
 *
 * @example Use fake environment variables for testing.
 * ```ts
 * import { fakeEnv } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using env = fakeEnv({ ENV1: "value1", ENV2: "value2" });
 * assertEquals(env.get("ENV1"), "value1");
 * assertEquals(env.get("ENV2"), "value2");
 * ```
 *
 * @example Verify environment variable updated from code under test.
 * ```ts
 * import { fakeEnv } from "@roka/testing/fake";
 * import { assert, assertEquals, assertFalse } from "@std/assert";
 * using env = fakeEnv({});
 * assertFalse(env.has("ENV"));
 * env.set("ENV", "value");
 * assert(env.has("ENV"));
 * assertEquals(env.get("ENV"), "value");
 * env.delete("ENV");
 * assertFalse(env.has("ENV"));
 * ```
 */
export function fakeEnv(env: Record<string, string>): FakeEnv & Disposable {
  if ("restore" in Deno.env) {
    throw new MockError("Cannot create fakeEnv: another fake is active");
  }
  const original = Object.getOwnPropertyDescriptor(Deno, "env");
  assertExists(original);
  const fake = {
    get(key: string) {
      return env[key];
    },
    toObject() {
      return env;
    },
    set(key: string, value: string) {
      env[key] = value;
    },
    has(key: string) {
      return env[key] !== undefined;
    },
    delete(key: string) {
      delete env[key];
    },
    get restored() {
      return Object.getOwnPropertyDescriptor(Deno, "env")?.value ===
        original.value;
    },
    restore() {
      if (this.restored) {
        throw new MockError("Cannot restore: fakeEnv already restored");
      }
      Object.defineProperties(Deno, { env: original });
    },
    [Symbol.dispose]: () => fake.restore(),
  };
  Object.defineProperties(Deno, { env: { value: fake } });
  return fake;
}

/** A fake `console` returned by the {@linkcode fakeConsole} function. */
export interface FakeConsole {
  /** Logs a message with the `debug` level. */
  debug(...data: unknown[]): void;
  /** Logs a message with the `log` level. */
  log(...data: unknown[]): void;
  /** Logs a message with the `info` level. */
  info(...data: unknown[]): void;
  /** Logs a message with the `warn` level. */
  warn(...data: unknown[]): void;
  /** Logs a message with the `error` level. */
  error(...data: unknown[]): void;
  /** The string output of the recorded calls to the console. */
  output(options?: FakeConsoleOutputOptions): string;
  /** The recorded calls to the Console. */
  calls: {
    level: "debug" | "log" | "info" | "warn" | "error";
    data: unknown[];
  }[];
  /** Whether the original `console` instance has been restored. */
  restored: boolean;
  /** Restores the original `console` instance. */
  restore(): void;
}

/** Options for the {@linkcode fakeConsole} function. */
export interface FakeConsoleOutputOptions {
  /** Filter for the log level of the output. */
  level?: "debug" | "log" | "info" | "warn" | "error";
  /**
   * Trim horizontal whitespace from output lines.
   * @default {false}
   */
  trimEnd?: boolean;
  /** Wrap the output with a string on both sides before returning it. */
  wrap?: string;
  /**
   * Keep ANSI escape codes in output.
   *
   * @see {@link https://en.wikipedia.org/wiki/ANSI_escape_code ANSI escape code}
   *
   * @default {false}
   */
  ansi?: boolean;
  /**
   * Keep CSS styling in the output.
   *
   * @see {@link https://docs.deno.com/examples/color_logging/ Color logging}
   *
   * @default {false}
   */
  color?: boolean;
}

/**
 * Create a fake replacement for the global `console` by overriding calls to
 * its log methods.
 *
 * Useful for verifying output from command-line tools.
 *
 * @example Verify console output.
 * ```ts
 * // deno-lint-ignore-file no-console
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using console = fakeConsole();
 * console.log("PEACE");
 * console.error("WAR!");
 * assertEquals(console.output(), "PEACE\nWAR!");
 * ```
 *
 * @example Verify error output only.
 * ```ts
 * // deno-lint-ignore-file no-console
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using console = fakeConsole();
 * console.log("PEACE");
 * console.error("WAR!");
 * assertEquals(console.output({ level: "error" }), "WAR!");
 * ```
 *
 * @example Verify individual calls to the console.
 * ```ts
 * // deno-lint-ignore-file no-console
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using console = fakeConsole();
 * console.log("PEACE");
 * console.warn("HELP!");
 * console.error("WAR!");
 * assertEquals(console.calls, [
 *   { level: "log", data: ["PEACE"] },
 *   { level: "warn", data: ["HELP!"] },
 *   { level: "error", data: ["WAR!"] },
 * ]);
 * ```
 */
export function fakeConsole(): FakeConsole & Disposable {
  const calls: {
    level: "debug" | "log" | "info" | "warn" | "error";
    data: unknown[];
  }[] = [];

  const [debug, log, info, warn, error] = [
    stub(
      globalThis.console,
      "debug",
      (...data: unknown[]) => calls.push({ level: "debug", data }),
    ),
    stub(
      globalThis.console,
      "log",
      (...data: unknown[]) => calls.push({ level: "log", data }),
    ),
    stub(
      globalThis.console,
      "info",
      (...data: unknown[]) => calls.push({ level: "info", data }),
    ),
    stub(
      globalThis.console,
      "warn",
      (...data: unknown[]) => calls.push({ level: "warn", data }),
    ),
    stub(
      globalThis.console,
      "error",
      (...data: unknown[]) => calls.push({ level: "error", data }),
    ),
  ];

  const console = {
    debug: debug.fake,
    log: log.fake,
    info: info.fake,
    warn: warn.fake,
    error: error.fake,
    output(options?: FakeConsoleOutputOptions) {
      const { ansi = false, color = false } = options ?? {};
      const output = calls
        .filter((call) => !options?.level || call.level === options?.level)
        .map((call) => {
          if (
            !color &&
            typeof call.data[0] === "string" && call.data[0].startsWith?.("%c")
          ) return [call.data[0].slice(2)];
          const output = call.data.map((x) => `${x}`).join(" ");
          return ansi ? output : stripAnsiCode(output);
        })
        .join("\n").split("\n").map((line) =>
          options?.trimEnd ? line.replace(/[^\S\r\n]+$/, "") : line
        )
        .join("\n");
      return options?.wrap ? `${options.wrap}${output}${options.wrap}` : output;
    },
    calls,
    get restored() {
      return debug.restored && log.restored && info.restored &&
        warn.restored && error.restored;
    },
    restore() {
      debug.restore();
      log.restore();
      info.restore();
      warn.restore();
      error.restore();
    },
    [Symbol.dispose]: () => {
      console.restore();
    },
  };
  return console;
}

/** A fake `Deno.Command` returned by the {@linkcode fakeCommand} function. */
export interface FakeCommand {
  /** The recorded command invocations. */
  runs: FakeCommandRun[];
  /** Whether the original `Deno.Command` instance has been restored. */
  restored: boolean;
  /** Restores the original `Deno.Command` instance. */
  restore(): void;
}

/**
 * A fake command invocation recorded by the {@linkcode fakeCommand} function.
 */
export interface FakeCommandRun {
  /** The command that was invoked. */
  command: string | URL;
  /** The options passed to the command. */
  options?: Deno.CommandOptions;
  /** The standard input passed to the command. */
  stdin: Uint8Array<ArrayBuffer> | null;
  /** The child process created by the command. */
  process: Deno.ChildProcess;
}

/**
 * Options for a single command for the {@linkcode fakeCommand} function.
 */
export interface FakeCommandOptions {
  /**
   * Whether to make the fake process stay around.
   *
   * If this is set to `true`, the process will not end automatically and
   * needs to be ended manually by calling the `kill()` method on
   * the process supplied by {@linkcode FakeCommandRun.process}.
   *
   * @default {false}
   */
  keep?: boolean;
  /**
   * The exit code of the command.
   * @default {0}
   */
  code?: number;
  /**
   * The standard output of the command.
   * @default {""}
   */
  stdout?: string | Uint8Array<ArrayBuffer>;
  /**
   * The standard error output of the command.
   * @default {""}
   */
  stderr?: string | Uint8Array<ArrayBuffer>;
}

/**
 * Create a fake replacement for the `Deno.Command` class.
 *
 * Useful for testing subprocess execution without actually running commands.
 *
 * @example Use fake commands for testing.
 * ```ts
 * import { fakeCommand } from "@roka/testing/fake";
 * import { assert } from "@std/assert";
 * using _ = fakeCommand();
 * const cmd = new Deno.Command("cat", { args: ["greeting.txt"] });
 * const { success } = await cmd.output();
 * assert(success);
 * ```
 *
 * @example Control the result of fake commands.
 * ```ts
 * import { fakeCommand } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using _ = fakeCommand({
 *   cat: [
 *     { code: 0, stdout: "Hello, World!\n" },
 *     { code: 1, stdout: "Hello, Mars!\n" },
 *   ],
 * });
 * const cmd = new Deno.Command("cat", { args: ["greeting.txt"] });
 * const proc1 = cmd.spawn();
 * const proc2 = cmd.spawn();
 * assertEquals(await proc1.status, { success: true, code: 0, signal: null });
 * assertEquals(await proc2.status, { success: false, code: 1, signal: null });
 * ```
 *
 * @example Test an always-running process.
 * ```ts
 * import { fakeCommand } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using _ = fakeCommand({ sleep: [{ keep: true }] });
 * const cmd = new Deno.Command("sleep", { args: ["1000"] });
 * const process = cmd.spawn();
 * assertEquals(process.pid, 1);
 * process.kill();
 * const status = await process.status;
 * assertEquals(status.code, 1);
 * assertEquals(status.signal, "SIGTERM");
 * ```
 */
export function fakeCommand(
  commands?: Record<string, FakeCommandOptions[]>,
): FakeCommand & Disposable {
  const commandMap = new Map<string, FakeCommandOptions[]>(
    Object.entries(commands ?? {}),
  );
  let nextPid = 0;
  const runs: FakeCommandRun[] = [];
  function readable(
    data: Uint8Array<ArrayBuffer>,
  ): Deno.SubprocessReadableStream {
    const stream = ReadableStream.from([data]);
    return Object.assign(stream, {
      arrayBuffer: () => toArrayBuffer(stream),
      bytes: () => Promise.resolve(data),
      json: () => toJson(stream),
      text: () => toText(stream),
    });
  }
  function get<T>(name: string, value: T, pipe: "piped" | "inherit" | "null") {
    if (pipe !== "piped") {
      throw new TypeError(`Cannot get '${name}': '${name}' is not piped`);
    }
    return value;
  }
  class FakeCommand implements Deno.Command {
    command: string | URL;
    options?: Deno.CommandOptions;
    constructor(command: string | URL, options?: Deno.CommandOptions) {
      this.command = command;
      if (options) this.options = options;
    }
    async output(): Promise<Deno.CommandOutput> {
      if (this.options?.stdin === "piped") {
        throw new TypeError(
          "Piped stdin is not supported for this function, " +
            "use 'Deno.Command.spawn()' instead",
        );
      }
      return await this.spawn("piped").output();
    }
    outputSync(): Deno.CommandOutput {
      throw new MockError("Synchronous output not supported in fakeCommand");
    }
    spawn(pipe?: "piped" | "inherit" | "null"): Deno.ChildProcess {
      if (pipe === undefined) pipe = "inherit";
      nextPid += 1;
      const key = typeof this.command === "string"
        ? this.command
        : this.command.href;
      const options = this.options;
      const command = commandMap.get(key)?.shift() ?? {};
      const data = {
        stdin: [] as Uint8Array<ArrayBufferLike>[],
        stdout: typeof command.stdout === "string"
          ? new TextEncoder().encode(command.stdout)
          : command.stdout ?? new Uint8Array(),
        stderr: typeof command.stderr === "string"
          ? new TextEncoder().encode(command.stderr)
          : command.stderr ?? new Uint8Array(),
      };
      const stream = {
        stdin: new WritableStream({
          write(chunk) {
            data.stdin.push(chunk);
          },
        }),
        stdout: readable(data.stdout),
        stderr: readable(data.stderr),
      };
      let commandStatus: Deno.CommandStatus | undefined = command.keep
        ? undefined
        : {
          success: (command.code ?? 0) === 0,
          code: command.code ?? 0,
          signal: null,
        };
      const child: Deno.ChildProcess = {
        get stdin() {
          return get("stdin", stream.stdin, options?.stdin ?? "inherit");
        },
        get stdout() {
          return get("stdout", stream.stdout, options?.stdout ?? pipe);
        },
        get stderr() {
          return get("stderr", stream.stderr, options?.stderr ?? pipe);
        },
        pid: nextPid,
        status: commandStatus !== undefined
          ? Promise.resolve(commandStatus)
          : waitFor(
            () => commandStatus !== undefined,
            Number.MAX_SAFE_INTEGER,
            { step: 1 },
          ).then(() => {
            assertExists(commandStatus);
            return commandStatus;
          }).finally(() => {
            if (!commandStatus) throw new MockError("Fake process timed out");
          }),
        async output() {
          return {
            ...await this.status,
            get stdout() {
              return get("stdout", data.stdout, options?.stdout ?? pipe);
            },
            get stderr() {
              return get("stderr", data.stderr, options?.stderr ?? pipe);
            },
          };
        },
        kill(signo?: Deno.Signal) {
          if (commandStatus !== undefined) {
            throw new MockError("Cannot kill: process already ended");
          }
          commandStatus = {
            success: (command.code ?? 1) === 0,
            code: command.code ?? 1,
            signal: signo ?? "SIGTERM",
          };
        },
        ref: () => {},
        unref: () => {},
        async [Symbol.asyncDispose]() {
          this.kill();
          await Promise.resolve();
        },
      };
      runs.push({
        command: this.command,
        ...this.options && { options: this.options },
        ...{ debug: data },
        get stdin() {
          if (this.options?.stdin !== "piped") return null;
          return Uint8Array.from(data.stdin.flatMap((x) => Array.from(x)));
        },
        process: child,
      });
      return child;
    }
  }
  const fake = stub(Deno, "Command", (...args: unknown[]) => {
    const [command, options] = args as [string | URL, Deno.CommandOptions?];
    return new FakeCommand(command, options);
  });
  const command = {
    runs,
    get restored() {
      return fake.restored;
    },
    restore() {
      if (command.restored) {
        throw new MockError("Cannot restore: fakeCommand already restored");
      }
      fake.restore();
    },
    [Symbol.dispose]: () => {
      command.restore();
    },
  };
  return command;
}
