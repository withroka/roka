import { bold, green, red, stripAnsiCode } from "@std/fmt/colors";

/** Success log icon. */
export const SUCCESS: string = green(bold("✓"));
/** Error log icon. */
export const ERROR: string = red("✘");

/** TTY and verbose aware console, shared among the CLI tools. */
export const console = {
  verbose: false,
  print(
    fn: typeof globalThis.console.log,
    pipe: typeof Deno.stdout,
    data: unknown[],
  ) {
    if (pipe.isTerminal()) return fn(...data);
    return fn(...data.map((x) => typeof x === "string" ? stripAnsiCode(x) : x));
  },
  debug: (...data: unknown[]) =>
    console.verbose
      ? console.print(globalThis.console.debug, Deno.stdout, data)
      : undefined,
  log: (...data: unknown[]) =>
    console.print(globalThis.console.log, Deno.stdout, data),
  warn: (...data: unknown[]) =>
    console.print(globalThis.console.warn, Deno.stderr, data),
  error: (...data: unknown[]) =>
    console.print(globalThis.console.error, Deno.stderr, data),
  row: (color: (data: string) => string, data: string[]) =>
    Deno.stdout.isTerminal() ? data.map((x) => color(x)) : data,
};
