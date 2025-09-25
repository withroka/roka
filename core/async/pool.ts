/**
 * This module provides the {@linkcode pool} and {@linkcode pooled} functions
 * that can be used to resolve a collection of promises. The former returns an
 * array of results, while the latter returns an asynchronous iterable.
 *
 * ```ts
 * import { pool } from "@roka/async/pool";
 * await pool([1, 2, 3], (x) => Promise.resolve(x * 2));
 * ```
 *
 * The maximum concurrency is not limited by default, but it can be set using
 * the {@linkcode PoolOptions.concurrency | concurrency} option. The promises
 * will be executed based on the order that they are passed to the function,
 * and the results will be in the same order.
 *
 * ```ts
 * import { pool } from "@roka/async/pool";
 * const results = pooled(
 *   [1, 2, 3],
 *   (x) => Promise.resolve(x * 2),
 *   { concurrency: 2 }
 * );
 * for await (const result of results) {
 *   // ...
 * }
 * ```
 *
 * If a promise is rejected, no new executions will begin. All currently
 * executing functions are allowed to finish. Subsequently, the rejections that
 * already occurred are gathered and thrown by the iterator in an
 * `AggregateError`.
 *
 * The accepted input types make sure that the asynchronous operations start
 * only when the pooling function is called. For example, an iterable of
 * promises is not accepted, as execution would have started by the time they
 * are passed to the function.
 *
 * This module is a thin wrapper with a more convenient API around the
 * `pooledMap` function from the standard
 * {@link https://github.com/denoland/std/tree/main/async | **@std/async**} library.
 *
 * @module pool
 */

import { pooledMap } from "@std/async/pool";

/** Options for the {@linkcode pool} function. */
export interface PoolOptions {
  /**
   * The maximum number of concurrent operations.
   * @default {Infinity}
   */
  concurrency?: number;
}

/**
 * Resolves an iterable of promises, and returns the results as an array,
 * while limiting the maximum amount of concurrency.
 *
 * @example Resolve an iterable of promises.
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const result = await pool([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 * assertEquals(result, [1, 2, 3]);
 * ```
 *
 * @example Resolve an iterable of promises with a concurrency limit.
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const result = await pool(
 *   [
 *     () => Promise.resolve(1),
 *     () => Promise.resolve(2),
 *     () => Promise.resolve(3),
 *   ],
 *   { concurrency: 2 }
 * );
 * assertEquals(result, [1, 2, 3]);
 * ```
 *
 * @example Eagerly resolve an async iterable of promises.
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * async function* asyncGenerator() {
 *   yield Promise.resolve(1);
 *   yield Promise.resolve(2);
 *   yield Promise.resolve(3);
 * }
 * const results = await pool(asyncGenerator());
 * assertEquals(results, [1, 2, 3]);
 * ```
 *
 * @typeParam T The type of the input and output values.
 * @param array The promises to resolve.
 * @returns A promise that resolves all inputs concurrently.
 */
export async function pool<T>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T>,
  options?: PoolOptions,
): Promise<T[]>;

/**
 * Transforms values to an iterable of promises, resolves them, and returns the
 * results as an array while limiting the maximum amount of concurrency.
 *
 * @example Resolve a mapping of promises.
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results = await pool(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 * );
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @example Resolve a mapping of promises with a concurrency limit.
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results = await pool(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 *   { concurrency: 2 },
 * );
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @example Eagerly resolve a mapping from an async iterable.
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * async function* asyncIterable() {
 *   yield 1;
 *   yield 2;
 *   yield 3;
 * }
 * const results = await pool(
 *   asyncIterable(),
 *   (value) => Promise.resolve(value * 2),
 * );
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @typeParam T The type of the input values.
 * @typeParam R The type of the output values.
 * @param array The input values to map to promises.
 * @param iteratorFn The function to transform the values to promises.
 * @returns A promise that resolves all mapped inputs concurrently.
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
  if (typeof iteratorFnOrOptions !== "function") {
    return await Array.fromAsync(
      Symbol.asyncIterator in array
        ? pooled(array, iteratorFnOrOptions)
        : pooled(array as Iterable<() => Promise<T>>, options),
    );
  }
  return await Array.fromAsync(pooled(
    array as Iterable<T> | AsyncIterable<T>,
    iteratorFnOrOptions,
    options,
  ));
}

/**
 * Resolves an iterable of promises, and yields the results as an async
 * iterable, while limiting the maximum amount of concurrency.
 *
 * @example Resolve an iterable of promises.
 * ```ts
 * import { pooled } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results: number[] = [];
 * const iterable = pooled([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 * for await (const number of iterable) {
 *   results.push(number);
 * }
 * assertEquals(results, [1, 2, 3]);
 * ```
 *
 * @example Resolve an iterable of promises with a concurrency limit.
 * ```ts
 * ```ts
 * import { pooled } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results: number[] = [];
 * const iterable = pooled(
 *   [
 *     () => Promise.resolve(1),
 *     () => Promise.resolve(2),
 *     () => Promise.resolve(3),
 *   ],
 *   { concurrency: 2 }
 * );
 * for await (const number of iterable) {
 *   results.push(number);
 * }
 * assertEquals(results, [1, 2, 3]);
 * ```
 *
 * @example Eagerly resolve an async iterable of promises.
 * ```ts
 * import { pooled } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * async function* asyncGenerator() {
 *   yield Promise.resolve(1);
 *   yield Promise.resolve(2);
 *   yield Promise.resolve(3);
 * }
 * const results = await Array.fromAsync(pooled(asyncGenerator()));
 * assertEquals(results, [1, 2, 3]);
 * ```
 *
 * @typeParam T The type of the input and output values.
 * @param array The promises to resolve.
 * @returns An async iterator for the resolved promises.
 */
export function pooled<T>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T>,
  options?: PoolOptions,
): AsyncIterableIterator<T>;

/**
 * Transforms values to an iterable of promises, resolves them, and yields the
 * results as an async iterable while limiting the maximum amount of
 * concurrency.
 *
 * @example Resolve a mapping of promises.
 * ```ts
 * import { pooled } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results: number[] = [];
 * const iterable = pooled(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 * );
 * for await (const number of iterable) {
 *   results.push(number);
 * }
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @example Resolve a mapping of promises with a concurrency limit.
 * ```ts
 * import { pooled } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results: number[] = [];
 * const iterable = pooled(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 *   { concurrency: 2 },
 * );
 * for await (const number of iterable) {
 *   results.push(number);
 * }
 *
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @example Eagerly resolve a mapping from an async iterable.
 * ```ts
 * import { pooled } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 * const results: number[] = [];
 * async function* asyncIterable() {
 *   yield 1;
 *   yield 2;
 *   yield 3;
 * }
 * for await (const number of pooled(
 *   asyncIterable(),
 *   (value) => Promise.resolve(value * 2),
 * )) {
 *   results.push(number);
 * }
 *
 * assertEquals(results, [2, 4, 6]);
 * ```
 *
 * @typeParam T The type of the input values.
 * @typeParam R The type of the output values.
 * @param array The input values to map to promises.
 * @param iteratorFn The function to transform the values to promises.
 * @returns An async iterator for the transformed and resolved promises.
 */
export function pooled<T, R>(
  array: Iterable<T> | AsyncIterable<T>,
  iteratorFn: (value: T) => Promise<R>,
  options?: PoolOptions,
): AsyncIterableIterator<R>;

export function pooled<T, R>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T> | Iterable<T>,
  iteratorFnOrOptions?: ((value: T) => Promise<R>) | PoolOptions,
  options?: PoolOptions,
): AsyncIterableIterator<T | R> {
  if (typeof iteratorFnOrOptions !== "function") {
    return Symbol.asyncIterator in array
      ? pooled(array, (x) => Promise.resolve(x), iteratorFnOrOptions)
      : pooled(
        array as Iterable<() => Promise<T>>,
        (x) => x(),
        iteratorFnOrOptions,
      );
  }
  const { concurrency = Infinity } = options ?? {};
  return pooledMap(
    concurrency,
    array as Iterable<T> | AsyncIterable<T>,
    iteratorFnOrOptions,
  );
}
