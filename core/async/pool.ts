/**
 * Pooling functions for async iterables.
 *
 * This modules provides the {@linkcode pool} function which can be used to
 * resolve a collection of promises, limiting the maximum amount of concurrency.
 *
 * The function support several variants.
 *
 * @example
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * // resolves an iterable of functions that return promises
 * await pool([() => Promise.resolve(1), () => Promise.resolve(2)]);
 * // resolve an iterable mapped to promises
 * await pool([1, 2, 3], (x) => Promise.resolve(x * 2));
 * // resolves an async iterable
 * async function* promiseGenerator() { yield Promise.resolve(1); }
 * await pool(promiseGenerator());
 * // resolves an async iterable mapped to promises
 * async function* generator() { yield Promise.resolve(1); }
 * await pool(generator(), (x) => Promise.resolve(x * 2));
 * ```
 *
 * The accepted input types make sure that the starts only when the function
 * is called. An iterable of promises is not accepted, as execution would have
 * started by the time they are passed to the function.
 *
 * The concurrency is not limited by default, but can be set using the
 * `concurrency` option. The promises will be executed based on the order that
 * they are passed to the function, and the results will be in the same order.
 *
 * If an error is thrown from a function, no new executions will begin. All
 * currently executing functions are allowed to finish and still yielded on
 * success. After that, the rejections among them are gathered and thrown by the
 * iterator in an `AggregateError`.
 *
 * @module
 */

import { pooledMap } from "@std/async/pool";

/** Options for the pool function. */
export interface PoolOptions {
  /**
   * The maximum number of concurrent operations.
   * {@default Infinity}
   */
  concurrency?: number;
}

/**
 * Resolves a iterable of promises, limiting the maximum amount of concurrency.
 *
 * @example with iterables of promise functions
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const results = await pool(
 *   [
 *     () => Promise.resolve(1),
 *     () => Promise.resolve(2),
 *     () => Promise.resolve(3)
 *   ],
 *   { concurrency: 2 },
 * );
 *
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
 * const results = await pool(asyncGenerator(), { concurrency: 2 });
 *
 * assertEquals(results, [1, 2, 3]);
 * ```
 */
export async function pool<T>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T>,
  options?: PoolOptions,
): Promise<T[]>;
/**
 * Transforms values to an iterable of promises, and resolves them limiting the
 * maximum amount of concurrency.
 *
 * @example with iterables
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const results = await pool(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 *   { concurrency: 2 },
 * );
 *
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @example with async iterables
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * async function* asyncGenerator() {
 *   yield 1;
 *   yield 2;
 *   yield 3;
 * }
 * const results = await pool(
 *   asyncGenerator(),
 *   (value) => Promise.resolve(value * 2),
 *   { concurrency: 2 },
 * );
 *
 * assertEquals(results, [2, 4, 6]);
 * ```
 */
export async function pool<T, R>(
  array: Iterable<T> | AsyncIterable<T>,
  iteratorFn: (value: T) => Promise<R>,
  options?: PoolOptions,
): Promise<R[]>;

export async function pool<T, R>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T> | Iterable<T>,
  iteratorFnOrOptions?: ((value: T) => Promise<R>) | PoolOptions,
  options?: PoolOptions,
): Promise<(T | R)[]> {
  if (typeof iteratorFnOrOptions === "function") {
    const { concurrency = Infinity } = options ?? {};
    return await Array.fromAsync(
      pooledMap(
        concurrency,
        array as Iterable<T> | AsyncIterable<T>,
        iteratorFnOrOptions,
      ),
    );
  }
  const { concurrency = Infinity } = iteratorFnOrOptions ?? {};
  return await Array.fromAsync(
    Symbol.asyncIterator in array
      ? pooledMap(concurrency, array, (x) => Promise.resolve(x))
      : pooledMap(
        concurrency,
        array as Iterable<() => Promise<T>>,
        (x) => x(),
      ),
  );
}
