import { pool } from "@roka/async/pool";
import { assertEquals, assertRejects } from "@std/assert";

Deno.test("pool() resolves promises with default concurrency", async () => {
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
  const results = await pool(array, { concurrency: 1 });
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() resolves promises with specified concurrency", async () => {
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
  const results = await pool(array, { concurrency: 1 });
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles empty array", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await pool(array);
  assertEquals(results, []);
});

Deno.test("pool() map handles empty array", async () => {
  const array: (() => Promise<number>)[] = [];
  const results = await pool(array, (x) => x());
  assertEquals(results, []);
});

Deno.test("pool() handles iterable", async () => {
  const order: number[] = [];
  function* generator() {
    yield () => {
      order.push(1);
      return Promise.resolve(1);
    };
    yield () => {
      order.push(2);
      return Promise.resolve(2);
    };
    yield () => {
      order.push(3);
      return Promise.resolve(3);
    };
  }
  const results = await pool(generator());
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() map handles iterable", async () => {
  const order: number[] = [];
  function* generator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await pool(generator(), (x) => {
    order.push(x);
    return Promise.resolve(x);
  });
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles async iterable", async () => {
  const order: number[] = [];
  async function* asyncGenerator() {
    order.push(1);
    yield Promise.resolve(1);
    order.push(2);
    yield Promise.resolve(2);
    order.push(3);
    yield Promise.resolve(3);
  }
  const results = await pool(asyncGenerator());
  assertEquals(results, [1, 2, 3]);
  assertEquals(order, [1, 2, 3]);
});

Deno.test("pool() map handles async iterable", async () => {
  const order: number[] = [];
  async function* asyncGenerator() {
    yield 1;
    yield 2;
    yield 3;
  }
  const results = await pool(asyncGenerator(), (x) => {
    order.push(x);
    return Promise.resolve(x);
  });
  assertEquals(results, [1, 2, 3]);
  assertEquals(order, [1, 2, 3]);
});

Deno.test("pool() map handles async iterable of promises", async () => {
  const order: number[] = [];
  async function* asyncGenerator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await pool(asyncGenerator(), (x) => {
    order.push(x);
    return Promise.resolve(x);
  });
  assertEquals(results, [1, 2, 3]);
  assertEquals(order, [1, 2, 3]);
});

Deno.test("pool() throws AggregateError on error", async () => {
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
