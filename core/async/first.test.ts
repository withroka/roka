import { assertEquals, assertRejects } from "@std/assert";
import { first } from "./first.ts";

Deno.test("first() returns the first resolved result", async () => {
  const result = await first([
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ]);
  assertEquals(result, 1);
});

Deno.test("first() returns first resolved result even with delays", async () => {
  const result = await first([
    () => new Promise((resolve) => setTimeout(() => resolve(1), 100)),
    () => Promise.resolve(2),
    () => new Promise((resolve) => setTimeout(() => resolve(3), 50)),
  ]);
  assertEquals(result, 2); // resolves immediately
});

Deno.test("first() ignores rejections and returns first successful result", async () => {
  const result = await first([
    () => Promise.reject(new Error("first fails")),
    () => Promise.reject(new Error("second fails")),
    () => Promise.resolve(3),
  ]);
  assertEquals(result, 3);
});

Deno.test("first() handles mixed successes and failures", async () => {
  const result = await first([
    () => Promise.reject(new Error("fails")),
    () => new Promise((resolve) => setTimeout(() => resolve(2), 100)),
    () => Promise.resolve(3),
    () => Promise.reject(new Error("also fails")),
  ]);
  assertEquals(result, 3);
});

Deno.test("first() rejects with AggregateError when all promises reject", async () => {
  await assertRejects(
    () => first([
      () => Promise.reject(new Error("first fails")),
      () => Promise.reject(new Error("second fails")),
      () => Promise.reject(new Error("third fails")),
    ]),
    AggregateError,
    "All promises rejected",
  );
});

Deno.test("first() throws error for empty array", async () => {
  await assertRejects(
    () => first([]),
    Error,
    "Cannot get first result from empty array",
  );
});

Deno.test("first() handles iterable input", async () => {
  function* generator() {
    yield () => Promise.resolve(1);
    yield () => Promise.resolve(2);
    yield () => Promise.resolve(3);
  }
  const result = await first(generator());
  assertEquals(result, 1);
});

Deno.test("first() with mapper returns first mapped result", async () => {
  const result = await first(
    [1, 2, 3],
    (value) => Promise.resolve(value * 2),
  );
  assertEquals(result, 2); // 1 * 2
});

Deno.test("first() with mapper handles delays", async () => {
  const result = await first(
    [100, 50, 200],
    (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)),
  );
  assertEquals(result, 50); // fastest to resolve
});

Deno.test("first() with mapper ignores rejections", async () => {
  const result = await first(
    [1, 2, 3],
    (value) => value === 1 
      ? Promise.reject(new Error("first fails"))
      : Promise.resolve(value * 2),
  );
  assertEquals(result, 4); // 2 * 2
});

Deno.test("first() with mapper rejects when all mapped promises reject", async () => {
  await assertRejects(
    () => first(
      [1, 2, 3],
      () => Promise.reject(new Error("all fail")),
    ),
    AggregateError,
    "All promises rejected",
  );
});

Deno.test("first() with mapper throws error for empty array", async () => {
  await assertRejects(
    () => first([], (x: number) => Promise.resolve(x)),
    Error,
    "Cannot get first result from empty array",
  );
});

Deno.test("first() with mapper handles iterable input", async () => {
  function* generator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const result = await first(
    generator(),
    (value) => Promise.resolve(value * 2),
  );
  assertEquals(result, 2); // 1 * 2
});

Deno.test("first() maintains order independence", async () => {
  // Test that the function returns the first to resolve, not the first in order
  const results: number[] = [];
  
  // Run multiple times to ensure consistent behavior
  for (let i = 0; i < 5; i++) {
    const result = await first([
      () => new Promise((resolve) => setTimeout(() => resolve(1), Math.random() * 10)),
      () => Promise.resolve(2), // This should always win
      () => new Promise((resolve) => setTimeout(() => resolve(3), Math.random() * 10)),
    ]);
    results.push(result);
  }
  
  // All results should be 2 since it resolves immediately
  assertEquals(results.every(r => r === 2), true);
});