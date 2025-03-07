/**
 * A library for working with asynchronous operations.
 *
 * This package only provides the {@link [pool]} module to limit the
 * concurrency of promises.
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
 * ## Modules
 *
 *  -  {@link [pool]}: Limit concurrency.
 *
 * @module async
 */
