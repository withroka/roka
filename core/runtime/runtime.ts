/**
 * A library for writing code compatible with multiple JavaScript runtimes.
 *
 * The interface matches Deno's global builtins, but provides shims for other
 * runtimes like Bun. This allows writing code that can run in both Deno and
 * other runtimes without modification.
 *
 * ```ts
 * import { command } from "@roka/compat";
 * import { command } from "@roka/testing/test";
 *
 * test("compat()", async () => {
 *   const result = await new Command("echo", ["Hello, world!"]).output();
 *   assertEquals(result.stdout, "Hello, world!\n");
 * });
 * ```
 *
 * @module compat
 */

const Deno = typeof globalThis.Deno !== "undefined"
  ? globalThis.Deno
  : (await import("@deno/" + "shim-deno")).Deno;

if (typeof globalThis.Deno === "undefined") globalThis.Deno = Deno;

export interface Runtime {
  title: string;
  args: string[];
  build: typeof Deno.build;
  chdir: typeof Deno.chdir;
  cwd: typeof Deno.cwd;
  command(
    command: string,
    options?: Deno.CommandOptions,
  ): Deno.Command;
  inspect: typeof Deno.inspect;
}

export const runtime: Runtime = {
  // deno-lint-ignore no-process-global
  title: typeof globalThis.Deno !== "undefined" ? "deno" : process.title,
  args: Deno.args,
  build: Deno.build,
  chdir: Deno.chdir,
  cwd: Deno.cwd,
  command(
    command: string,
    options: Deno.CommandOptions = {},
  ) {
    if (typeof globalThis.Deno !== "undefined") {
      return new Deno.Command(command, { ...options });
    } else {
      return {
        output: () => ({
          success: false,
        }),
      };
    }
  },
  inspect: Deno.inspect,
};

/** Cross-runtime `errors` object. */
export const errors: typeof Deno.cwd = Deno.errors;
