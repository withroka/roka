import {
  assert,
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertStrictEquals,
} from "@std/assert";
import { assertType, type IsExact, type IsNever } from "@std/testing/types";
import { type Maybe, maybe } from "./maybe.ts";

const numberFn = () => maybe(() => 42);
assertType<IsExact<ReturnType<typeof numberFn>, Maybe<number>>>(true);
const promiseNumberFn = () => maybe(async () => await Promise.resolve(42));
assertType<IsExact<ReturnType<typeof promiseNumberFn>, Promise<Maybe<number>>>>(
  true,
);

Deno.test("maybe() returns success when function succeeds", () => {
  const { value, error } = maybe(() => 42);
  assertEquals(value, 42);
  assertEquals(error, undefined);
});

Deno.test("maybe() returns success when async function succeeds", async () => {
  const { value, error } = await maybe(async () => await Promise.resolve(42));
  assertEquals(value, 42);
  assertEquals(error, undefined);
});

Deno.test("maybe() captures thrown error", () => {
  const thrown = new Error("boom");
  const { value, error } = maybe(() => {
    // deno-lint-ignore no-constant-condition
    if (true) throw thrown;
    return 42;
  });
  assertEquals(value, undefined);
  assertStrictEquals(error, thrown);
});

Deno.test("maybe() captures thrown error from async function", async () => {
  const thrown = new Error("boom");
  const { value, error } = await maybe(async () => {
    // deno-lint-ignore no-constant-condition
    if (true) throw thrown;
    await Promise.resolve(42);
  });
  assertEquals(value, undefined);
  assertStrictEquals(error, thrown);
  assertEquals(error?.message, "boom");
});

Deno.test("maybe() captures thrown literal", () => {
  const { value, error } = maybe(() => {
    // deno-lint-ignore no-throw-literal
    throw "boom";
  });
  assertEquals(value, undefined);
  assertInstanceOf(error, Error);
  assertStrictEquals(error?.message, "boom");
  assertEquals(error?.cause, "boom");
});

Deno.test("maybe() captures thrown literal from async function", async () => {
  const { value, error } = await maybe(async () => {
    // deno-lint-ignore no-constant-condition
    if (true) {
      // deno-lint-ignore no-throw-literal
      throw "boom";
    }
    await Promise.resolve(42);
  });
  assertEquals(value, undefined);
  assertInstanceOf(error, Error);
  assertStrictEquals(error?.message, "boom");
  assertEquals(error?.cause, "boom");
});

Deno.test("maybe() handles undefined return value", () => {
  const { value, error } = maybe(() => undefined);
  assertEquals(value, undefined);
  assertEquals(error, undefined);
});

Deno.test("maybe() handles object return value", () => {
  const obj = { a: 1 };
  const { value, error } = maybe(() => obj);
  assertStrictEquals(value, obj);
  assertEquals(error, undefined);
});

Deno.test("maybe() handles optional return value", () => {
  const result: number | undefined = 42;
  const { value, error } = maybe(() => result);
  assertEquals(error, undefined);
  assertType<IsExact<typeof value, number | undefined>>(true);
  assertEquals(value, 42);
});

Deno.test("maybe() handles never return value", () => {
  const { value, error } = maybe(() => {
    throw new Error("boom");
  });
  assertType<IsNever<typeof value>>(true);
  assertExists(error);
});

Deno.test("maybe() executes function only once", () => {
  let calls = 0;
  const { value } = maybe(() => {
    calls += 1;
    return calls;
  });
  assert(value !== undefined);
  assertStrictEquals(value, 1);
  assertStrictEquals(calls, 1);
});

Deno.test("maybe() executes async function only once", async () => {
  let calls = 0;
  const { value } = await maybe(async () => {
    calls += 1;
    return await Promise.resolve(calls);
  });
  assert(value !== undefined);
  assertStrictEquals(value, 1);
  assertStrictEquals(calls, 1);
});

Deno.test("maybe() preserves result type", () => {
  const { value, error } = maybe(() => "hello");
  if (error) {
    assertType<IsExact<typeof value, undefined>>(true);
  } else {
    const upper = value.toUpperCase();
    assertStrictEquals(upper, "HELLO");
  }
});
