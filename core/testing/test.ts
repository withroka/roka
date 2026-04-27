/**
 * A library for writing tests in a cross-runtime way.
 *
 * This module provides the {@linkcode test} function, which is the global
 * equivalent under Deno runtime, but test shims for other runtimes.
 *
 * @module test
 */

import { assertExists } from "@std/assert";

const { Deno, testDefinitions } = typeof globalThis.Deno !== "undefined"
  ? { Deno: globalThis.Deno, testDefinitions: [] }
  : (await import("@deno/shim-deno-test"));

export const test = typeof globalThis.Deno !== "undefined"
  ? globalThis.Deno.test
  : await bunTest();

type TestFn = (t: Deno.TestContext) => void | Promise<void>;

async function bunTest() {
  const { test } = await import("node" + ":test");
  return (
    nameOrOptions: string | Omit<Deno.TestDefinition, "fn">,
    optionsOrFn?: Omit<Deno.TestDefinition, "fn" | "name"> | TestFn,
    maybeFn?: TestFn,
  ) => {
    // @ts-ignore not Deno code
    Deno.test(nameOrOptions, optionsOrFn, maybeFn);
    const definition = testDefinitions.pop();
    assertExists(definition);
    if (definition.ignore) {
      test.skip(definition.name, definition.fn);
    } else {
      test(definition.name, definition.fn);
    }
  };
}
