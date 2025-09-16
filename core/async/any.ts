/**
 * This module provides the {@linkcode any} function that returns the first
 * resolved result from a collection of promises.
 *
 * ```ts
 * import { any } from "@roka/async/any";
 * const result = await any([
 *   () => Promise.reject(new Error()),
 *   () => Promise.resolve().then(() => Promise.resolve("next tick")),
 *   () => Promise.resolve("first"),
 * ]);  // result will be "first"
 * ```
 *
 * If all promises reject, an `AggregateError` is thrown, containing all
 * individual errors. If the input array is empty, an `AggregateError` is also
 * thrown.
 *
 * This module is a thin wrapper around the standard `Promise.any` function,
 * with support for mapping input values to promises.
 *
 * @module any
 */

/**
 * Returns the first resolved result from a collection of promises. Rejections
 * are ignored unless all promises reject.
 *
 * @example Resolve to first available result from promises.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "@std/assert";
 * const result = await any([
 *   Promise.resolve().then(() => Promise.resolve(1)),
 *   Promise.reject(2),
 *   Promise.resolve(3),
 * ]);
 * assertEquals(result, 3);
 * ```
 *
 * @example Resolve to first available result from promise factories.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "@std/assert";
 * const result = await any([
 *   () => Promise.resolve().then(() => Promise.resolve(1)),
 *   () => Promise.reject(2),
 *   () => Promise.resolve(3),
 * ]);
 * assertEquals(result, 3);
 * ```
 *
 * @typeParam T The type of the input and output values.
 * @param array The promises to resolve.
 * @returns A promise that resolves to the first successful result.
 */
export function any<T>(
  array: Iterable<Promise<T>> | Iterable<() => Promise<T>>,
): Promise<T>;

/**
 * Transforms values to promises and returns the first resolved result.
 * Rejections are ignored unless all promises reject.
 *
 * @example Resolve to first available result from values.
 * ```ts
 * import { any } from "@roka/async/any";
 * import { assertEquals } from "@std/assert";
 * const result = await any([1, 2, 3], async (x) => {
 *   if (x !== 2) return Promise.reject(x);
 *   return Promise.resolve(x);
 * });
 * assertEquals(result, 2);
 * ```
 *
 * @typeParam T The type of the input values.
 * @typeParam R The type of the output values.
 * @param array The input values to map to promises.
 * @param iteratorFn The function to transform the values to promises.
 * @returns A promise that resolves to the first successful result.
 */
export function any<T, R>(
  array: Iterable<T>,
  iteratorFn: (value: T) => Promise<R>,
): Promise<R>;

export async function any<T, R>(
  array:
    | Iterable<Promise<T>>
    | Iterable<() => Promise<T>>
    | Iterable<T>,
  iteratorFn?: (value: T) => Promise<R>,
): Promise<T | R> {
  const promises = Array.from(array as Iterable<T | R>, (value) => {
    if (typeof iteratorFn === "function") {
      return Promise.resolve(value).then(() => iteratorFn(value as T));
    }
    return typeof value === "function"
      ? Promise.resolve(value)
        .then(() => (value as () => Promise<T>)())
      : value;
  });
  return await Promise.any(promises);
}
