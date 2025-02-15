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
 * Resolves a list of promises, limiting the maximum amount of concurrency.
 *
 * @example
 * ```ts
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const results = await pool(
 *   [Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)],
 *   { concurrency: 2 },
 * );
 * assertEquals(results, [1, 2, 3]);
 * ```
 */
export async function pool<T>(
  array: Iterable<Promise<T>> | AsyncIterable<Promise<T>>,
  { concurrency = 1 } = {},
): Promise<T[]> {
  return await Array.fromAsync(pooledMap(concurrency, array, (x) => x));
}
