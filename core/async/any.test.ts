import { assertEquals, assertRejects } from "@std/assert";
import { any } from "./any.ts";

Deno.test("any() returns the first resolved result", async () => {
  const result = await any([
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ]);
  assertEquals(result, 1);
});

Deno.test("any() returns first resolved result even with delays", async () => {
  const result = await any([
    () => new Promise((resolve) => setTimeout(() => resolve(1), 100)),
    () => Promise.resolve(2),
    () => new Promise((resolve) => setTimeout(() => resolve(3), 50)),
  ]);
  assertEquals(result, 2); // resolves immediately
});

Deno.test("any() ignores rejections and returns first successful result", async () => {
  const result = await any([
    () => Promise.reject(new Error("first fails")),
    () => Promise.reject(new Error("second fails")),
    () => Promise.resolve(3),
  ]);
  assertEquals(result, 3);
});

Deno.test("any() handles mixed successes and failures", async () => {
  const result = await any([
    () => Promise.reject(new Error("fails")),
    () => new Promise((resolve) => setTimeout(() => resolve(2), 100)),
    () => Promise.resolve(3),
    () => Promise.reject(new Error("also fails")),
  ]);
  assertEquals(result, 3);
});

Deno.test("any() rejects with AggregateError when all promises reject", async () => {
  await assertRejects(
    () =>
      any([
        () => Promise.reject(new Error("first fails")),
        () => Promise.reject(new Error("second fails")),
        () => Promise.reject(new Error("third fails")),
      ]),
    AggregateError,
    "All promises rejected",
  );
});

Deno.test("any() throws error for empty array", async () => {
  await assertRejects(
    () => any([]),
    Error,
    "Cannot get first result from empty array",
  );
});

Deno.test("any() handles iterable input", async () => {
  function* generator() {
    yield () => Promise.resolve(1);
    yield () => Promise.resolve(2);
    yield () => Promise.resolve(3);
  }
  const result = await any(generator());
  assertEquals(result, 1);
});

Deno.test("any() handles async iterable input", async () => {
  async function* asyncGenerator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const result = await any(asyncGenerator());
  assertEquals(result, 1);
});

Deno.test("any() with mapper returns first mapped result", async () => {
  const result = await any(
    [1, 2, 3],
    (value) => Promise.resolve(value * 2),
  );
  assertEquals(result, 2); // 1 * 2
});

Deno.test("any() with mapper handles delays", async () => {
  const result = await any(
    [100, 50, 200],
    (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)),
  );
  assertEquals(result, 50); // fastest to resolve
});

Deno.test("any() with mapper ignores rejections", async () => {
  const result = await any(
    [1, 2, 3],
    (value) =>
      value === 1
        ? Promise.reject(new Error("first fails"))
        : Promise.resolve(value * 2),
  );
  assertEquals(result, 4); // 2 * 2
});

Deno.test("any() with mapper rejects when all mapped promises reject", async () => {
  await assertRejects(
    () =>
      any(
        [1, 2, 3],
        () => Promise.reject(new Error("all fail")),
      ),
    AggregateError,
    "All promises rejected",
  );
});

Deno.test("any() with mapper throws error for empty array", async () => {
  await assertRejects(
    () => any([], (x: number) => Promise.resolve(x)),
    Error,
    "Cannot get first result from empty array",
  );
});

Deno.test("any() with mapper handles iterable input", async () => {
  function* generator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const result = await any(
    generator(),
    (value) => Promise.resolve(value * 2),
  );
  assertEquals(result, 2); // 1 * 2
});

Deno.test("any() with mapper handles async iterable input", async () => {
  async function* asyncGenerator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const result = await any(
    asyncGenerator(),
    (value) => Promise.resolve(value * 2),
  );
  assertEquals(result, 2); // 1 * 2
});

Deno.test("any() maintains order independence", async () => {
  // Test that the function returns the first to resolve, not the first in order
  const results: number[] = [];

  // Run multiple times to ensure consistent behavior
  for (let i = 0; i < 5; i++) {
    const result = await any([
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(1), Math.random() * 10)
        ),
      () => Promise.resolve(2), // This should always win
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(3), Math.random() * 10)
        ),
    ]);
    results.push(result);
  }

  // All results should be 2 since it resolves immediately
  assertEquals(results.every((r) => r === 2), true);
});
