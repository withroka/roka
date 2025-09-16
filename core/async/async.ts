/**
 * A library for working with asynchronous operations.
 *
 * This package provides modules to limit the concurrency of promises and to
 * get the first resolved result from a collection of promises.
 *
 * ```ts
 * import { pool } from "@roka/async/pool";
 * const results = await pool(
 *   [1, 2, 3, 4, 5, 6],
 *   (x) => Promise.resolve(x * 2),
 *   { concurrency: 2 },
 * );
 * ```
 *
 * ```ts
 * import { first } from "@roka/async/first";
 * const result = await first([
 *   () => Promise.resolve(1),
 *   () => Promise.resolve(2),
 *   () => Promise.resolve(3),
 * ]);
 * ```
 *
 * ## Modules
 *
 *  -  {@link [pool]}: Limit concurrency.
 *  -  {@link [first]}: Get first resolved result.
 *
 * @module async
 */
