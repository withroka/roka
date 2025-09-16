/**
 * A library for working with asynchronous operations, complementary to the
 * standard {@link https://jsr.io/@std/async | **@std/async**} library.
 *
 * ```ts
 * import { pool } from "@roka/async/pool";
 * const results = await pool(
 *   [1, 2, 3, 4, 5, 6],
 *   (x) => Promise.resolve(x * 2),
 *   { concurrency: 2 },
 * );  // results will be [2, 4, 6, 8, 10, 12]
 * ```
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
 * ## Modules
 *
 *  -  {@link [pool]}: Limit concurrency.
 *  -  {@link [any]}: Get first resolved result.
 *
 * @module async
 */
