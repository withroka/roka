/**
 * This module provides the {@linkcode any} function that returns the first
 * resolved result from a collection of promises.
 *
 * ```ts
 * import { any } from "@roka/async/any";
 * const result = await any([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 * // result will be 1 (the first to resolve)
 * ```
 *
 * Like {@linkcode Promise.any}, this function only considers successful
 * resolutions and ignores rejections unless all promises reject.
 *
 * ```ts
 * import { any } from "@roka/async/any";
 * const result = await any([
 *   () => Promise.reject(new Error("failed")),
 *   () => new Promise(resolve => setTimeout(() => resolve(2), 100)),
 *   () => Promise.resolve(3),
 * ]);
 * // result will be 3 (first successful resolution)
 * ```
 *
 * @module any
 */

/**
 * Returns the first resolved result from a collection of promises or promise
 * factories. Rejections are ignored unless all promises reject.
 *
 * @example Return the first resolved result from promise factories.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await any([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 *
 * assertEquals(result, 1);
 * ```
 *
 * @example Return the first resolved result from an async iterable.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * async function* asyncGenerator() {
 *   yield Promise.resolve(1);
 *   yield Promise.resolve(2);
 *   yield Promise.resolve(3);
 * }
 * const result = await any(asyncGenerator());
 *
 * assertEquals(result, 1);
 * ```
 *
 * @example Return the first resolved result, ignoring rejections.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await any([
 *   () => Promise.reject(new Error("failed")),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 *
 * assertEquals(result, 2);
 * ```
 *
 * @example Handle empty array.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertRejects } from "jsr:@std/assert";
 *
 * await assertRejects(() => any([]), Error);
 * ```
 *
 * @typeParam T The type of the resolved values.
 * @param array The promises to resolve.
 * @returns A promise that resolves to the first successful result.
 * @throws {Error} If the array is empty.
 * @throws {AggregateError} If all promises reject.
 */
export async function any<T>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T>,
): Promise<T>;

/**
 * Transforms values to promises and returns the first resolved result.
 * Rejections are ignored unless all promises reject.
 *
 * @example Map values and return the first resolved result.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await any(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 * );
 *
 * assertEquals(result, 2); // 1 * 2
 * ```
 *
 * @example Map values with delayed promises.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await any(
 *   [100, 50, 200],
 *   (ms) => new Promise(resolve => setTimeout(() => resolve(ms), ms)),
 * );
 *
 * assertEquals(result, 50); // fastest to resolve
 * ```
 *
 * @example Map values from an async iterable.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * async function* asyncGenerator() {
 *   yield 1;
 *   yield 2;
 *   yield 3;
 * }
 * const result = await any(
 *   asyncGenerator(),
 *   (value) => Promise.resolve(value * 2),
 * );
 *
 * assertEquals(result, 2); // 1 * 2
 * ```
 *
 * @typeParam T The type of the input values.
 * @typeParam R The type of the resolved values.
 * @param array The input values to map to promises.
 * @param iteratorFn The function to transform values to promises.
 * @returns A promise that resolves to the first successful result.
 * @throws {Error} If the array is empty.
 * @throws {AggregateError} If all promises reject.
 */
export async function any<T, R>(
  array: Iterable<T> | AsyncIterable<T>,
  iteratorFn: (value: T) => Promise<R>,
): Promise<R>;

export async function any<T, R>(
  array: Iterable<() => Promise<T>> | AsyncIterable<T> | Iterable<T>,
  iteratorFn?: (value: T) => Promise<R>,
): Promise<T | R> {
  if (iteratorFn) {
    return anyInternal(
      Symbol.asyncIterator in array
        ? anyAsync(array as AsyncIterable<T>, iteratorFn)
        : anySync(array as Iterable<T>, iteratorFn),
    );
  }

  if (Symbol.asyncIterator in array) {
    return anyInternal(anyAsyncDirect(array as AsyncIterable<T>));
  }

  return anyInternal(array as Iterable<() => Promise<T>>);
}

/**
 * Helper function to convert async iterable to promise factories with mapper.
 */
async function* anyAsync<T, R>(
  asyncIterable: AsyncIterable<T>,
  iteratorFn: (value: T) => Promise<R>,
): AsyncIterable<() => Promise<R>> {
  for await (const value of asyncIterable) {
    yield () => iteratorFn(value);
  }
}

/**
 * Helper function to convert sync iterable to promise factories with mapper.
 */
function* anySync<T, R>(
  iterable: Iterable<T>,
  iteratorFn: (value: T) => Promise<R>,
): Iterable<() => Promise<R>> {
  for (const value of iterable) {
    yield () => iteratorFn(value);
  }
}

/**
 * Helper function to convert async iterable of values to promise factories.
 */
async function* anyAsyncDirect<T>(
  asyncIterable: AsyncIterable<T>,
): AsyncIterable<() => Promise<T>> {
  for await (const value of asyncIterable) {
    yield () => Promise.resolve(value);
  }
}

/**
 * Internal implementation of the any function.
 */
async function anyInternal<T>(
  promises: Iterable<() => Promise<T>> | AsyncIterable<() => Promise<T>>,
): Promise<T> {
  const promiseArray = await Array.fromAsync(promises);

  if (promiseArray.length === 0) {
    throw new Error("Cannot get first result from empty array");
  }

  return new Promise<T>((resolve, reject) => {
    let resolvedCount = 0;
    let rejectedCount = 0;
    const errors: unknown[] = [];

    for (const promiseFactory of promiseArray) {
      promiseFactory()
        .then((value) => {
          if (resolvedCount === 0) {
            resolvedCount++;
            resolve(value);
          }
        })
        .catch((error) => {
          errors.push(error);
          rejectedCount++;

          // If all promises have rejected, reject with AggregateError
          if (rejectedCount === promiseArray.length) {
            reject(new AggregateError(errors, "All promises rejected"));
          }
        });
    }
  });
}
