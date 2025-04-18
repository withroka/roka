import { assertEquals, assertRejects } from "@std/assert";
import { pool, pooled } from "./pool.ts";

Deno.test("pool() resolves promises with default concurrency", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results = await pool(array);
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() resolves promises with specified concurrency", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results = await pool(array, { concurrency: 2 });
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() maintains execution order", async () => {
  const order: number[] = [];
  const array = [
    () => {
      order.push(1);
      return Promise.resolve(1);
    },
    () => {
      order.push(2);
      return Promise.resolve(2);
    },
    () => {
      order.push(3);
      return Promise.resolve(3);
    },
  ];
  await pool(array, { concurrency: 1 });
  assertEquals(order, [1, 2, 3]);
});

Deno.test("pool() handles empty array", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await pool(array);
  assertEquals(results, []);
});

Deno.test("pool() handles empty array map", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await pool(array, (x) => x());
  assertEquals(results, []);
});

Deno.test("pool() handles iterable", async () => {
  function* generator() {
    yield () => Promise.resolve(1);
    yield () => Promise.resolve(2);
    yield () => Promise.resolve(3);
  }
  const results = await pool(generator());
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles iterable map", async () => {
  function* generator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await pool(generator(), (x) => Promise.resolve(x));
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles async iterable", async () => {
  async function* asyncGenerator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await pool(asyncGenerator());
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles async iterable map", async () => {
  async function* asyncGenerator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await pool(asyncGenerator(), (x) => Promise.resolve(x));
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles async iterable to promises map", async () => {
  async function* asyncGenerator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await pool(asyncGenerator(), (x) => Promise.resolve(x));
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() rejects failing promises", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.reject(new Error("error")),
    () => Promise.resolve(3),
  ];
  await assertRejects(() => pool(array), AggregateError);
});

Deno.test("pool() rejects iterable of promises", async () => {
  const array = [Promise.resolve(1), Promise.resolve(2)];
  await assertRejects(
    () => pool(array as unknown as Iterable<() => Promise<number>>),
    AggregateError,
  );
});

Deno.test("pooled() resolves promises with default concurrency", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results: number[] = [];
  for await (const x of pooled(array)) results.push(x);
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() resolves promises with specified concurrency", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.resolve(2),
    () => Promise.resolve(3),
  ];
  const results: number[] = [];
  for await (const x of pooled(array, { concurrency: 2 })) results.push(x);
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() maintains execution order", async () => {
  const order: number[] = [];
  const array = [
    () => {
      order.push(1);
      return Promise.resolve(1);
    },
    () => {
      order.push(2);
      return Promise.resolve(2);
    },
    () => {
      order.push(3);
      return Promise.resolve(3);
    },
  ];
  await Array.fromAsync(pooled(array));
  assertEquals(order, [1, 2, 3]);
});

Deno.test("pooled() handles empty array", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await Array.fromAsync(pooled(array));
  assertEquals(results, []);
});

Deno.test("pooled() handles empty array map", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await Array.fromAsync(pooled(array));
  assertEquals(results, []);
});

Deno.test("pooled() handles iterable", async () => {
  function* generator() {
    yield () => Promise.resolve(1);
    yield () => Promise.resolve(2);
    yield () => Promise.resolve(3);
  }
  const results = await Array.fromAsync(pooled(generator()));
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() handles iterable map", async () => {
  function* generator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await Array.fromAsync(
    pooled(generator(), (x) => Promise.resolve(x)),
  );
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() handles async iterable", async () => {
  async function* asyncGenerator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await Array.fromAsync(pooled(asyncGenerator()));
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() handles async iterable map", async () => {
  async function* asyncGenerator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await Array.fromAsync(
    pooled(asyncGenerator(), (x) => Promise.resolve(x)),
  );
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() handles async iterable to promises map", async () => {
  async function* asyncGenerator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await Array.fromAsync(
    pooled(asyncGenerator(), (x) => Promise.resolve(x)),
  );
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pooled() rejects failing promises", async () => {
  const array = [
    () => Promise.resolve(1),
    () => Promise.reject(new Error("error")),
    () => Promise.resolve(3),
  ];
  await assertRejects(() => Array.fromAsync(pooled(array)), AggregateError);
});

Deno.test("pooled() rejects iterable of promises", async () => {
  const array = [Promise.resolve(1), Promise.resolve(2)];
  await assertRejects(
    () =>
      Array.fromAsync(
        pooled(array as unknown as Iterable<() => Promise<number>>),
      ),
    AggregateError,
  );
});
