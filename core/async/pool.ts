import { pooledMap as denoPooledMap } from "@std/async";

/**
 * Maps an array of data to an array of results with concurrency control.
 *
 * @example
 * ```ts
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const results = await pool([1, 2, 3], async (n) => n * 2, { concurrency: 2 });
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @template T The type of the input data.
 * @template R The type of the output data.
 * @param array The array of data to map.
 * @param iteratorFn The function to apply to each element of the array.
 * @param options Configuration options.
 * @param options.concurrency The maximum number of concurrent operations.
 * @returns A promise that resolves to an array of results.
 */
export async function pool<T, R>(
  array: Iterable<T> | AsyncIterable<T>,
  iteratorFn: (data: T) => Promise<R>,
  { concurrency = 1 } = {},
): Promise<R[]> {
  return await Array.fromAsync(denoPooledMap(concurrency, array, iteratorFn));
}
