/**
 * Pooling functions for async iterables.
 *
 * @module
 */

import { pooledMap } from "@std/async";

/** Options for the pool function. */
export interface PoolOptions {
  /**
   * The maximum number of concurrent operations.
   * {@default 1}
   */
  concurrency?: number;
}

/**
 * Resolves a iterable of promises, limiting the maximum amount of concurrency.
 *
 * @example with iterables of promises
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const results = await pool(
 *   [Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)],
 *   { concurrency: 2 },
 * );
 * assertEquals(results, [1, 2, 3]);
 * ```
 *
 * @example with async iterables
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * async function* asyncGenerator() {
 *   yield Promise.resolve(1);
 *   yield Promise.resolve(2);
 *   yield Promise.resolve(3);
 * }
 *
 * const results = await pool(asyncGenerator());
 * assertEquals(results, [1, 2, 3]);
 * ```
 */
export async function pool<T>(
  array: Iterable<Promise<T>> | AsyncIterable<T>,
  { concurrency = 1 } = {},
): Promise<T[]> {
  return await Array.fromAsync(
    Symbol.asyncIterator in array
      ? pooledMap(concurrency, array, (x) => Promise.resolve(x))
      : pooledMap(concurrency, array, (x) => x),
  );
}
