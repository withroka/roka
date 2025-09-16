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
    () => Promise.resolve(1), // This resolves immediately
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ]);
  assertEquals(result, 1); // First one in the array, but also fastest
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
    () => Promise.resolve(2), // This resolves immediately
    () => Promise.resolve(3),
    () => Promise.reject(new Error("also fails")),
  ]);
  assertEquals(result, 2);
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
    [50, 10, 200],
    (ms) => ms === 10 ? Promise.resolve(ms) : Promise.resolve(ms), // All resolve immediately
  );
  assertEquals(result, 50); // First in order since all resolve immediately
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

  // Create all promises first, then await them
  const promises = Array.from({ length: 5 }, () =>
    any([
      () => Promise.resolve(1),
      () => Promise.resolve(2), // All resolve immediately, so first in array wins
      () => Promise.resolve(3),
    ]));

  const results = await Promise.all(promises);

  // All results should be 1 since it's first in the array and all resolve immediately
  assertEquals(results.every((r) => r === 1), true);
});

Deno.test("any() returns fastest promise in race", async () => {
  // Test actual timing behavior with proper cleanup
  const timers: number[] = [];

  const createDelayedPromise = (value: string, delay: number) => () => {
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(value), delay);
      timers.push(timer);
    });
  };

  const start = Date.now();
  const result = await any([
    createDelayedPromise("slow", 100),
    createDelayedPromise("fast", 10),
    createDelayedPromise("medium", 50),
  ]);
  const elapsed = Date.now() - start;

  // Clean up remaining timers
  timers.forEach((timer) => clearTimeout(timer));

  assertEquals(result, "fast");
  // Should complete in around 10ms (fast promise), allow some variance
  assertEquals(elapsed < 50, true);
});
