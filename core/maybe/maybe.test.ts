import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
} from "@std/assert";
import {
  assertType,
  type IsExact,
  type IsNever,
  type IsNullable,
} from "@std/testing/types";
import { type Maybe, maybe } from "./maybe.ts";

const numberFn = () => maybe(() => 42);
assertType<IsExact<ReturnType<typeof numberFn>, Maybe<number>>>(true);
const promiseNumberFn = () => maybe(async () => await Promise.resolve(42));
assertType<IsExact<ReturnType<typeof promiseNumberFn>, Promise<Maybe<number>>>>(
  true,
);

Deno.test("maybe() returns success when function succeeds", () => {
  const { value, error, errors } = maybe(() => 42);
  assertEquals(value, 42);
  assertEquals(error, undefined);
  assertEquals(errors, undefined);
});

Deno.test("maybe() returns success when async function succeeds", async () => {
  const { value, error, errors } = await maybe(async () =>
    await Promise.resolve(42)
  );
  assertEquals(value, 42);
  assertEquals(error, undefined);
  assertEquals(errors, undefined);
});

Deno.test("maybe() captures thrown error", () => {
  const thrown = new Error("boom");
  const { value, error, errors } = maybe(() => {
    // deno-lint-ignore no-constant-condition
    if (true) throw thrown;
    return 42;
  });
  assertEquals(value, undefined);
  assertStrictEquals(error, thrown);
  assertEquals(errors, [thrown]);
  assertStrictEquals(errors[0], thrown);
});

Deno.test("maybe() captures thrown error from async function", async () => {
  const thrown = new Error("boom");
  const { value, error, errors } = await maybe(async () => {
    // deno-lint-ignore no-constant-condition
    if (true) throw thrown;
    await Promise.resolve(42);
  });
  assertEquals(value, undefined);
  assertStrictEquals(error, thrown);
  assertEquals(errors, [thrown]);
  assertStrictEquals(errors[0], thrown);
});

Deno.test("maybe() captures thrown literal", () => {
  const { value, error, errors } = maybe(() => {
    // deno-lint-ignore no-throw-literal
    throw "boom";
  });
  assertEquals(value, undefined);
  assertInstanceOf(error, Error);
  assertEquals(error?.message, "boom");
  assertEquals(error?.cause, "boom");
  assertEquals(errors, [error]);
  assertStrictEquals(errors[0], error);
});

Deno.test("maybe() captures thrown literal from async function", async () => {
  const { value, error, errors } = await maybe(async () => {
    // deno-lint-ignore no-constant-condition
    if (true) {
      // deno-lint-ignore no-throw-literal
      throw "boom";
    }
    await Promise.resolve(42);
  });
  assertEquals(value, undefined);
  assertInstanceOf(error, Error);
  assertEquals(error?.cause, "boom");
  assertEquals(errors, [error]);
  assertStrictEquals(errors[0], error);
});

Deno.test("maybe() returns multiple errors from AggregateError", () => {
  const thrown1 = new Error("boom1");
  const thrown2 = "boom2";
  const aggregate = new AggregateError([thrown1, thrown2], "multiple");
  const { value, error, errors } = maybe(() => {
    // deno-lint-ignore no-constant-condition
    if (true) throw aggregate;
    return 42;
  });
  assertEquals(value, undefined);
  assertStrictEquals(error, aggregate);
  assertEquals(errors.length, 2);
  assertStrictEquals(errors[0], thrown1);
  assertInstanceOf(errors[1], Error);
  assertEquals(errors[1].message, String(thrown2));
  assertEquals(errors[1].cause, thrown2);
});

Deno.test("maybe() returns multiple errors from AggregateError from async function", async () => {
  const thrown1 = new Error("boom1");
  const thrown2 = "boom2";
  const aggregate = new AggregateError([thrown1, thrown2], "multiple");
  const { value, error, errors } = await maybe(async () => {
    // deno-lint-ignore no-constant-condition
    if (true) throw aggregate;
    await Promise.resolve(42);
  });
  assertEquals(value, undefined);
  assertStrictEquals(error, aggregate);
  assertEquals(errors.length, 2);
  assertStrictEquals(errors[0], thrown1);
  assertInstanceOf(errors[1], Error);
  assertEquals(errors[1].message, String(thrown2));
  assertEquals(errors[1].cause, thrown2);
});

Deno.test("maybe() handles undefined return value", () => {
  const { value, error, errors } = maybe(() => undefined);
  assertEquals(value, undefined);
  assertEquals(error, undefined);
  assertEquals(errors, undefined);
});

Deno.test("maybe() handles object return value", () => {
  const obj = { a: 1 };
  const { value, error, errors } = maybe(() => obj);
  assertStrictEquals(value, obj);
  assertEquals(error, undefined);
  assertEquals(errors, undefined);
});

Deno.test("maybe() handles optional return value", () => {
  const result: number | undefined = 42;
  const { value, error, errors } = maybe(() => result);
  assertType<IsExact<typeof value, number | undefined>>(true);
  assertEquals(value, 42);
  assertEquals(error, undefined);
  assertEquals(errors, undefined);
});

Deno.test("maybe() handles never return value", () => {
  const thrown = new Error("boom");
  const { value, error, errors } = maybe(() => {
    throw thrown;
  });
  assertType<IsNever<typeof value>>(true);
  assertEquals(value, undefined);
  assertStrictEquals(error, thrown);
  assertEquals(errors, [thrown]);
  assertStrictEquals(errors[0], thrown);
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
  const { value } = maybe(() => "hello");
  if (value) {
    const upper = value.toUpperCase();
    assertStrictEquals(upper, "HELLO");
  }
});

Deno.test("maybe() partially resolves types with value", () => {
  function fn(): string | undefined {
    return "hello";
  }
  const { value, error, errors } = maybe(fn);
  if (value !== undefined) {
    assertType<IsExact<typeof error, undefined>>(true);
    assertType<IsExact<typeof errors, undefined>>(true);
  } else {
    assertType<IsNullable<typeof error>>(true);
    assertType<IsNullable<typeof errors>>(true);
  }
});

Deno.test("maybe() fully resolves types with error", () => {
  const { value, error, errors } = maybe(() => "hello");
  if (error) {
    assertType<IsExact<typeof value, undefined>>(true);
    assertType<IsExact<typeof error, Error>>(true);
    assertType<IsExact<typeof errors, Error[]>>(true);
  } else {
    assertType<IsExact<typeof value, string>>(true);
    assertType<IsExact<typeof error, undefined>>(true);
    assertType<IsExact<typeof errors, undefined>>(true);
  }
});

Deno.test("maybe() fully resolves types with errors", () => {
  const { value, error, errors } = maybe(() => "hello");
  if (errors) {
    assertType<IsExact<typeof value, undefined>>(true);
    assertType<IsExact<typeof error, Error>>(true);
    assertType<IsExact<typeof errors, Error[]>>(true);
  } else {
    assertType<IsExact<typeof value, string>>(true);
    assertType<IsExact<typeof error, undefined>>(true);
    assertType<IsExact<typeof errors, undefined>>(true);
  }
});
