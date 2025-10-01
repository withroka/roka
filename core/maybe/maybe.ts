/**
 * A library for handling operations that may fail.
 *
 * This package only provides the {@linkcode maybe} function, which executes a
 * function and captures any thrown exceptions as a failure result. It is an
 * alternative to using try-catch blocks for error handling.
 *
 * The function returns a result object of type {@linkcode Maybe}. If the
 * function executes successfully, the result object has a `value` property
 * containing the return value of the function, and `error` is `undefined`.
 *
 * If the function throws an exception, the result object has an `error`
 * property containing the thrown error, and `value` is `undefined`.
 *
 * If the thrown exception is an `AggregateError`, the `errors` property
 * contains an array of the individual errors contained in the `AggregateError`.
 * For other types of exceptions, `errors` is an array containing the single
 * thrown error.
 *
 * The `maybe` function can handle both synchronous and asynchronous functions.
 *
 * ```ts
 * import { maybe } from "@roka/maybe";
 * const { value, error } = maybe(() => {
 *   // some operation that may throw
 *   return 42;
 * });
 * if (error) {
 *   const failure = error.message;
 * } else {
 *   const result = value;
 * }
 * ```
 *
 * @module maybe
 */

import { assertExists } from "@std/assert";

/** The result of an operation returned by the {@linkcode maybe} function. */
export type Maybe<T, E extends Error = Error> =
  | { value: T; error: undefined; errors: undefined }
  | { value: undefined; error: E; errors: [Error, ...Error[]] };

/**
 * Overload for functions that never return (always throw).
 *
 * This overload allows the `maybe` function to be used with functions that
 * never return, such as those that always throw an exception. The return type
 * is a failure result with an `Error`.
 */
export function maybe(
  fn: () => never,
): { value: never; error: Error; errors: [Error, ...Error[]] };

/**
 * Executes an asynchronous function, capturing exceptions as a failure result.
 *
 * @example Success case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assertEquals } from "@std/assert";
 * const { value, error } = await maybe(async () => await Promise.resolve(42));
 * assertEquals(value, 42);
 * assertEquals(error, undefined);
 * ```
 *
 * @example Failure case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assertEquals } from "@std/assert";
 * const { value, error } = await maybe(async () => {
 *   if (true) throw new Error("boom");
 *   return 42;
 * });
 * assertEquals(value, undefined);
 * assertEquals(error?.message, "boom");
 * ```
 *
 * @example Multiple errors from `AggregateError`.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assertEquals } from "@std/assert";
 * const { value, error, errors } = await maybe(async () => {
 *   if (true) {
 *     throw new AggregateError(
 *       [new Error("boom"), new Error("boom")],
 *       "aggregate",
 *     );
 *   }
 *   return 42;
 * });
 * assertEquals(value, undefined);
 * assertEquals(error?.message, "aggregate");
 * assertEquals(errors?.[0]?.message, "boom");
 * assertEquals(errors?.[1]?.message, "boom");
 * ```
 */
export function maybe<T>(fn: () => Promise<T>): Promise<Maybe<T>>;

/**
 * Executes a synchronous function, capturing exceptions as a failure result.
 *
 * @example Success case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assertEquals } from "@std/assert";
 * const { value, error } = maybe(() => 42);
 * assertEquals(value, 42);
 * assertEquals(error, undefined);
 * ```
 *
 * @example Failure case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assertEquals } from "@std/assert";
 * const { value, error } = maybe(() => {
 *   if (true) throw new Error("boom");
 *   return 42;
 * });
 * assertEquals(value, undefined);
 * assertEquals(error?.message, "boom");
 * ```
 *
 * @example Multiple errors from `AggregateError`.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "@std/assert";
 * const { value, errors } = await maybe(() =>
 *   pool([1, 2, 3], async (_) => {
 *     // deno-lint-ignore no-constant-condition
 *     if (true) throw new Error("boom");
 *     await Promise.resolve(42);
 *   })
 * );
 * assertEquals(value, undefined);
 * assertEquals(errors?.[0]?.message, "boom");
 * assertEquals(errors?.[1]?.message, "boom");
 * assertEquals(errors?.[2]?.message, "boom");
 * ```
 */
export function maybe<T>(fn: () => T): Maybe<T>;

export function maybe<T>(
  fn: () => T | Promise<T>,
): Maybe<T> | Promise<Maybe<T>> {
  const error = (e: unknown) =>
    e instanceof Error ? e : new Error(String(e), { cause: e });
  const errors = (e: Error): [Error, ...Error[]] => {
    if (e instanceof AggregateError) {
      const result = e.errors.map(error);
      if (result.length === 0) return [e];
      assertExists(result[0]);
      return [result[0], ...result.slice(1)];
    }
    return [e];
  };
  try {
    const value = fn();
    if (!(value instanceof Promise)) {
      return { value: value, error: undefined, errors: undefined };
    }
    return value
      .then((value) => ({ value, error: undefined, errors: undefined }))
      .catch((cause) => {
        const e = error(cause);
        return {
          value: undefined,
          error: e,
          errors: errors(e),
        };
      });
  } catch (cause) {
    const e = error(cause);
    return {
      value: undefined,
      error: e,
      errors: errors(e),
    };
  }
}
