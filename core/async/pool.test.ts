import { pool } from "@roka/async/pool";
import { assertEquals } from "@std/assert";

Deno.test("pool() resolves promises with default concurrency", async () => {
  const promises = [Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)];
  const results = await pool(promises);
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() resolves promises with specified concurrency", async () => {
  const promises = [Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)];
  const results = await pool(promises, { concurrency: 2 });
  assertEquals(results, [1, 2, 3]);
});

Deno.test("pool() handles empty array", async () => {
  const promises: Promise<number>[] = [];
  const results = await pool(promises);
  assertEquals(results, []);
});

Deno.test("pool() handles iterable", async () => {
  function* generator() {
    yield Promise.resolve(1);
    yield Promise.resolve(2);
    yield Promise.resolve(3);
  }
  const results = await pool(generator());
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
