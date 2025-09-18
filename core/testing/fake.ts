/**
 * This module provides common fake objects for testing.
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
 * records calls to its log methods. This objects records calls to the console
 * from the code being tested.
 *
 * ```ts
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 * using console = fakeConsole();
 * console.log("I won't be printed");
 * assertEquals(console.output(), "I won't be printed");
 * ```
 *
 * @module fake
 */

import { assertExists } from "@std/assert";
import { MockError, stub } from "@std/testing/mock";

/** Fake environment variables returned by the {@linkcode fakeEnv} function. */
export interface FakeEnv extends Deno.Env {
  /** Whether the original `Deno.env` instance has been restored. */
  restored: boolean;
  /** Restores the original `Deno.env` instance. */
  restore: () => void;
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

/** A fake console returned by the {@linkcode fakeConsole} function. */
export interface FakeConsole {
  /** Logs a message with the `debug` level. */
  debug: (...data: unknown[]) => void;
  /** Logs a message with the `log` level. */
  log: (...data: unknown[]) => void;
  /** Logs a message with the `info` level. */
  info: (...data: unknown[]) => void;
  /** Logs a message with the `warn` level. */
  warn: (...data: unknown[]) => void;
  /** Logs a message with the `error` level. */
  error: (...data: unknown[]) => void;
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
  restore: () => void;
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
   * Keep CSS styling in the output.
   *
   * @default {false}
   *
   * @see {@link https://docs.deno.com/examples/color_logging/ Color logging}
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
      const output = calls
        .filter((call) => !options?.level || call.level === options?.level)
        .map((call) => {
          if (
            !options?.color &&
            typeof call.data[0] === "string" && call.data[0].startsWith?.("%c")
          ) return [call.data[0].slice(2)];
          return call.data.map((x) => `${x}`).join(" ");
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
