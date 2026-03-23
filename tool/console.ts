import { bold, green, red, stripAnsiCode } from "@std/fmt/colors";

export const SUCCESS = green(bold("✓"));
export const ERROR = red("✘");

export const console = {
  verbose: false,
  ttyAware(
    fn: typeof globalThis.console.log,
    pipe: typeof Deno.stdout,
    data: unknown[],
  ) {
    if (pipe.isTerminal()) return fn(...data);
    return fn(...data.map((x) => typeof x === "string" ? stripAnsiCode(x) : x));
  },
  debug: (...data: unknown[]) =>
    console.verbose
      ? console.ttyAware(globalThis.console.debug, Deno.stdout, data)
      : undefined,
  log: (...data: unknown[]) =>
    console.ttyAware(globalThis.console.log, Deno.stdout, data),
  warn: (...data: unknown[]) =>
    console.ttyAware(globalThis.console.warn, Deno.stdout, data),
  error: (...data: unknown[]) =>
    console.ttyAware(globalThis.console.error, Deno.stderr, data),
  row: (color: (data: string) => string, data: string[]) =>
    Deno.stdout.isTerminal() ? data.map((x) => color(x)) : data,
};
