/**
 * A library for terminal-aware `console` logging.
 *
 * ```ts
 * import { console } from "@roka/cli/console";
 *
 * console.verbose = true;
 * console.debug("This will be printed");
 *
 * console.verbose = false;
 * console.debug("This will not be printed");
 *
 * console.log("This will always be printed");
 * ```
 *
 * @module console
 */

import { stripAnsiCode } from "@std/fmt/colors";

const original = globalThis.console;

/** Type of the {@linkcode console} object. */
export type Console = globalThis.Console & {
  /**
   * Controls whether the `console.debug` method prints anything.
   *
   * By default, this is `false`, so `console.debug` does not print anything.
   *
   * @default {false}
   */
  verbose: boolean;
};

/**
 * A console object with additional utilities.
 *
 * The `debug` method is controlled by the {@linkcode Console.verbose verbose}
 * property, and by default does not print anything.
 *
 * @example Disabling debug output
 * ```ts
 * import { console } from "@roka/cli/console";
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 *
 * using fake = fakeConsole();
 *
 * console.debug("This will not be printed");
 * console.verbose = true;
 * console.debug("This will be printed");
 *
 * assertEquals(fake.output(), "This will be printed");
 * ```
 *
 * @example Stripping ANSI codes when piped
 * ```ts
 * import { console } from "@roka/cli/console";
 * import { red } from "@std/fmt/colors";
 * import { fakeConsole } from "@roka/testing/fake";
 * import { assertEquals } from "@std/assert";
 *
 * using fake = fakeConsole();
 *
 * console.log(red("Red in terminal, but not when piped"));
 * assertEquals(fake.output(), "Red in terminal, but not when piped");
 * ```
 */
export const console: Console = {
  ...globalThis.console,
  verbose: false,
  debug: (...data: unknown[]): void =>
    console.verbose
      ? original.debug(
        ...data.map((x) => render(x, { terminal: Deno.stdout.isTerminal() })),
      )
      : undefined,
  log: (...data: unknown[]): void =>
    original.log(
      ...data.map((x) => render(x, { terminal: Deno.stdout.isTerminal() })),
    ),
  info: (...data: unknown[]): void =>
    original.info(
      ...data.map((x) => render(x, { terminal: Deno.stdout.isTerminal() })),
    ),
  warn: (...data: unknown[]): void =>
    original.warn(
      ...data.map((x) => render(x, { terminal: Deno.stderr.isTerminal() })),
    ),
  error: (...data: unknown[]): void =>
    original.error(
      ...data.map((x) => render(x, { terminal: Deno.stderr.isTerminal() })),
    ),
};

/** Options for the {@linkcode render} function. */
export interface RenderOptions {
  /**
   * Renders for a terminal output.
   * @default {Deno.stdout.isTerminal()}
   */
  terminal?: boolean;
}

/**
 * Renders a value for terminal output.
 *
 * Strips ANSI codes when the {@linkcode RenderOptions.terminal terminal}
 * option is `false`, otherwise returns the value as is.
 *
 * @example Render a string value
 * ```ts
 * import { render } from "@roka/cli/console";
 * import { red } from "@std/fmt/colors";
 * import { assertEquals } from "@std/assert";
 *
 * assertEquals(render(red("hello")), "hello");
 * ```
 */
export function render<T>(data: T, options?: RenderOptions): T {
  const { terminal = Deno.stdout.isTerminal() } = options ?? {};
  if (terminal) return data;
  if (typeof data === "string") return stripAnsiCode(data) as T;
  return data;
}
