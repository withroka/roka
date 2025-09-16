/**
 * This module provides the {@linkcode first} function that returns the first
 * resolved result from a collection of promises.
 *
 * ```ts
 * import { first } from "@roka/async/first";
 * const result = await first([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 * // result will be 1 (the first to resolve)
 * ```
 *
 * Unlike {@linkcode Promise.race}, this function only considers successful
 * resolutions and ignores rejections unless all promises reject.
 *
 * ```ts
 * import { first } from "@roka/async/first";
 * const result = await first([
 *   () => Promise.reject(new Error("failed")),
 *   () => new Promise(resolve => setTimeout(() => resolve(2), 100)),
 *   () => Promise.resolve(3),
 * ]);
 * // result will be 3 (first successful resolution)
 * ```
 *
 * @module first
 */

/**
 * Returns the first resolved result from a collection of promises or promise
 * factories. Rejections are ignored unless all promises reject.
 *
 * @example Return the first resolved result from promise factories.
 * ```ts
 * import { first } from "@roka/async/first";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await first([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 *
 * assertEquals(result, 1);
 * ```
 *
 * @example Return the first resolved result, ignoring rejections.
 * ```ts
 * import { first } from "@roka/async/first";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await first([
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
 * import { first } from "@roka/async/first";
 * import { assertRejects } from "jsr:@std/assert";
 *
 * await assertRejects(() => first([]), Error);
 * ```
 *
 * @typeParam T The type of the resolved values.
 * @param promises The promise factories to resolve.
 * @returns A promise that resolves to the first successful result.
 * @throws {Error} If the array is empty.
 * @throws {AggregateError} If all promises reject.
 */
export async function first<T>(
  promises: Iterable<() => Promise<T>>,
): Promise<T>;

/**
 * Returns the first resolved result from a collection of values mapped to
 * promises. Rejections are ignored unless all promises reject.
 *
 * @example Map values and return the first resolved result.
 * ```ts
 * import { first } from "@roka/async/first";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await first(
 *   [1, 2, 3],
 *   (value) => Promise.resolve(value * 2),
 * );
 *
 * assertEquals(result, 2); // 1 * 2
 * ```
 *
 * @example Map values with delayed promises.
 * ```ts
 * import { first } from "@roka/async/first";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const result = await first(
 *   [100, 50, 200],
 *   (ms) => new Promise(resolve => setTimeout(() => resolve(ms), ms)),
 * );
 *
 * assertEquals(result, 50); // fastest to resolve
 * ```
 *
 * @typeParam T The type of the input values.
 * @typeParam R The type of the resolved values.
 * @param values The input values to map to promises.
 * @param mapper The function to transform values to promises.
 * @returns A promise that resolves to the first successful result.
 * @throws {Error} If the array is empty.
 * @throws {AggregateError} If all promises reject.
 */
export async function first<T, R>(
  values: Iterable<T>,
  mapper: (value: T) => Promise<R>,
): Promise<R>;

export async function first<T, R>(
  input: Iterable<() => Promise<T>> | Iterable<T>,
  mapper?: (value: T) => Promise<R>,
): Promise<T | R> {
  if (mapper) {
    const promiseFactories = Array.from(input as Iterable<T>).map(
      (value) => () => mapper(value),
    );
    return firstInternal(promiseFactories);
  }

  return firstInternal(input as Iterable<() => Promise<T>>);
}

/**
 * Internal implementation of the first function.
 */
async function firstInternal<T>(
  promises: Iterable<() => Promise<T>>,
): Promise<T> {
  const promiseArray = Array.from(promises);

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
