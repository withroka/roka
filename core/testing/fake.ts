/**
 * Fake objects to replace real equivalents in tests.
 *
 * @module
 */

import { stub } from "@std/testing/mock";

/** A fake console returned by {@linkcode fakeConsole}. */
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
  /** The recorded calls to the Console. */
  calls: {
    level: "debug" | "log" | "info" | "warn" | "error";
    data: unknown[];
  }[];
  /** Whether or not the original `console` instance has been restored. */
  restored: boolean;
  /** Restores the original `console` instance. */
  restore: () => void;
}

/**
 * Create a fake for common `console` methods.
 *
 * Useful for verifying output from command-line tools.
 *
 * @example
 * ```ts
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 *
 * Deno.test("fakeConsole", async (t) => {
 *  using console = fakeConsole();
 *  console.log("message");
 *  assertEquals(console.calls, [{ level: "log", data: ["message"] }]);
 * });
 * ```
 */

export function fakeConsole(): FakeConsole {
  const calls = [] as {
    level: "debug" | "log" | "info" | "warn" | "error";
    data: unknown[];
  }[];

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
