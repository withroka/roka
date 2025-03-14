/**
 * This module provides common fake objects for testing. Currently, only the
 * {@linkcode fakeConsole} function is available.
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

import { stub } from "@std/testing/mock";

/** A fake console returned by the {@linkcode fakeConsole} function. */
export interface FakeConsole extends Disposable {
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
  /** Trim horizontal whitespace from output lines. */
  trimEnd?: boolean;
  /** Wrap the output with a string on both sides before returning it. */
  wrap?: string;
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
export function fakeConsole(): FakeConsole {
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
        .map((call) => call.data.map((x) => `${x}`).join(" "))
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
