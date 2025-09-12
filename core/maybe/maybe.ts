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

export type Maybe<T, E extends Error = Error> =
  | { value: T; error: undefined }
  | { value: undefined; error: E };

/**
 * Overload for functions that never return (always throw).
 *
 * This overload allows the `maybe` function to be used with functions that
 * never return, such as those that always throw an exception. The return type
 * is a failure result with an `Error`.
 */
export function maybe(fn: () => never): { value: never; error: Error };

/**
 * Executes an asynchronous function, capturing exceptions as a failure result.
 *
 * @example Success case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assert, assertEquals } from "@std/assert";
 * const { value, error } = await maybe(async () => await Promise.resolve(42));
 * assertEquals(value, 42);
 * assertEquals(error, undefined);
 * ```
 *
 * @example Failure case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assert, assertEquals } from "@std/assert";
 * const { value, error } = await maybe(async () => {
 *   if(true) throw new Error("boom");
 *   return 42;
 * });
 * assertEquals(value, undefined);
 * assertEquals(error?.message, "boom");
 * ```
 */
export function maybe<T>(fn: () => Promise<T>): Promise<Maybe<T>>;

/**
 * Executes a synchronous function, capturing exceptions as a failure result.
 *
 * @example Success case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assert, assertEquals } from "@std/assert";
 * const { value, error } = maybe(() => 42);
 * assertEquals(value, 42);
 * assertEquals(error, undefined);
 * ```
 *
 * @example Failure case.
 * ```ts
 * import { maybe } from "@roka/maybe";
 * import { assert, assertEquals } from "@std/assert";
 * const { value, error } = maybe(() => {
 *   if(true) throw new Error("boom");
 *   return 42;
 * });
 * assertEquals(value, undefined);
 * assertEquals(error?.message, "boom");
 * ```
 */
export function maybe<T>(fn: () => T): Maybe<T>;

export function maybe<T>(
  fn: () => T | Promise<T>,
): Maybe<T> | Promise<Maybe<T>> {
  try {
    const value = fn();
    if (!(value instanceof Promise)) return { value: value, error: undefined };
    return value
      .then((value) => ({ value, error: undefined }))
      .catch((cause) => ({
        value: undefined,
        error: cause instanceof Error
          ? cause
          : new Error(String(cause), { cause }),
      }));
  } catch (cause) {
    return {
      value: undefined,
      error: cause instanceof Error
        ? cause
        : new Error(String(cause), { cause }),
    };
  }
}
