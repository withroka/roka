import { test } from "@roka/testing/test";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { pool, pooled } from "./pool.ts";

test("pool() resolves all promises", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results = await pool(array);
  assertEquals(results, [1, 2, 3]);
});

test("pool() handles empty array", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await pool(array);
  assertEquals(results, []);
});

test("pool() handles empty array map", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await pool(array, (x) => x());
  assertEquals(results, []);
});

test("pool() handles iterable", async () => {
  function* iterable() {
    yield () => Promise.resolve(1);
    yield () => Promise.resolve(2);
    yield () => Promise.resolve(3);
  }
  const results = await pool(iterable());
  assertEquals(results, [1, 2, 3]);
});

test("pool() handles iterable map", async () => {
  function* iterable() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await pool(iterable(), (x) => Promise.resolve(x));
  assertEquals(results, [1, 2, 3]);
});

test("pooled() handles async iterable", async () => {
  async function* asyncIterable() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await Array.fromAsync(pooled(asyncIterable()));
  assertEquals(results, [1, 2, 3]);
});

test("pool() handles async iterable map", async () => {
  async function* asyncIterable() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await pool(asyncIterable(), (x) => Promise.resolve(x));
  assertEquals(results, [1, 2, 3]);
});

test("pool() handles async iterable of promises map", async () => {
  async function* asyncIterable() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await pool(asyncIterable(), (x) => Promise.resolve(x));
  assertEquals(results, [1, 2, 3]);
});

test("pool() rejects failing promises", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.reject(new Error("error")),
    () => Promise.resolve(3),
  ];
  await assertRejects(() => pool(array), AggregateError);
});

test("pool() rejects iterable of promises", async () => {
  const array = [Promise.resolve(1), Promise.resolve(2)];
  await assertRejects(
    () => pool(array as unknown as Iterable<() => Promise<number>>),
    AggregateError,
  );
});

test("pool({ concurrency }) limits async operation concurrency", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results = await pool(array, { concurrency: 2 });
  assertEquals(results, [1, 2, 3]);
});

test("pool({ concurrency }) maintains execution order", async () => {
  const order: number[] = [];
  await pool([1, 2, 3], async (number) => {
    order.push(number);
    order.push(number);
    return await Promise.resolve(number);
  }, { concurrency: 1 });
  assertEquals(order, [1, 1, 2, 2, 3, 3]);
});

test("pool({ concurrency }) rejects zero", async () => {
  await assertRejects(
    () => pool([], (x) => Promise.resolve(x), { concurrency: 0 }),
    RangeError,
    "concurrency",
  );
});

test("pool({ concurrency }) rejects infinity", async () => {
  await assertRejects(
    () => pool([], (x) => Promise.resolve(x), { concurrency: Infinity }),
    RangeError,
    "concurrency",
  );
});

test("pool({ concurrency }) rejects floating point", async () => {
  await assertRejects(
    () => pool([], (x) => Promise.resolve(x), { concurrency: 2.5 }),
    RangeError,
    "concurrency",
  );
});

test("pool({ concurrency }) rejects negative numbers", async () => {
  await assertRejects(
    () => pool([], (x) => Promise.resolve(x), { concurrency: -1 }),
    RangeError,
    "concurrency",
  );
});

test("pooled() resolves all promises", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results: number[] = [];
  for await (const x of pooled(array)) results.push(x);
  assertEquals(results, [1, 2, 3]);
});

test("pooled() handles empty array", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await Array.fromAsync(pooled(array));
  assertEquals(results, []);
});

test("pooled() handles empty array map", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await Array.fromAsync(pooled(array));
  assertEquals(results, []);
});

test("pooled() handles iterable", async () => {
  function* iterable() {
    yield () => Promise.resolve(1);
    yield () => Promise.resolve(2);
    yield () => Promise.resolve(3);
  }
  const results = await Array.fromAsync(pooled(iterable()));
  assertEquals(results, [1, 2, 3]);
});

test("pooled() handles iterable map", async () => {
  function* iterable() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await Array.fromAsync(
    pooled(iterable(), (x) => Promise.resolve(x)),
  );
  assertEquals(results, [1, 2, 3]);
});

test("pooled() handles async iterable", async () => {
  async function* asyncIterable() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await Array.fromAsync(pooled(asyncIterable()));
  assertEquals(results, [1, 2, 3]);
});

test("pooled() handles async iterable map", async () => {
  async function* asyncIterable() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await Array.fromAsync(
    pooled(asyncIterable(), (x) => Promise.resolve(x)),
  );
  assertEquals(results, [1, 2, 3]);
});

test("pooled() rejects failing promises", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.reject(new Error("error")),
    () => Promise.resolve(3),
  ];
  await assertRejects(() => Array.fromAsync(pooled(array)), AggregateError);
});

test("pooled() rejects iterable of promises", async () => {
  const array = [Promise.resolve(1), Promise.resolve(2)];
  await assertRejects(
    () =>
      Array.fromAsync(
        pooled(array as unknown as Iterable<() => Promise<number>>),
      ),
    AggregateError,
  );
});

test("pooled({ concurrency }) limits async operation concurrency", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results: number[] = [];
  for await (const x of pooled(array, { concurrency: 2 })) results.push(x);
  assertEquals(results, [1, 2, 3]);
});

test("pooled({ concurrency }) maintains execution order", async () => {
  const order: number[] = [];
  await Array.fromAsync(pooled([1, 2, 3], async (number) => {
    order.push(number);
    order.push(number);
    return await Promise.resolve(number);
  }, { concurrency: 1 }));
  assertEquals(order, [1, 1, 2, 2, 3, 3]);
});

test("pooled({ concurrency }) rejects zero", () => {
  assertThrows(
    () => pooled([], (x) => Promise.resolve(x), { concurrency: 0 }),
    RangeError,
    "concurrency",
  );
});

test("pooled({ concurrency }) rejects negative numbers", () => {
  assertThrows(
    () => pooled([], (x) => Promise.resolve(x), { concurrency: -1 }),
    RangeError,
    "concurrency",
  );
});

test("pooled({ concurrency }) rejects floating point", () => {
  assertThrows(
    () => pooled([], (x) => Promise.resolve(x), { concurrency: 2.5 }),
    RangeError,
    "concurrency",
  );
});

test("pooled({ concurrency }) rejects infinity", () => {
  assertThrows(
    () => pooled([], (x) => Promise.resolve(x), { concurrency: Infinity }),
    RangeError,
    "concurrency",
  );
});
