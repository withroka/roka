/**
 * Helpers for concurrency.
 *
 * Currently, the only function provided is {@link pool}.
 *
 * @example
 * ```ts
 * import { pool } from "@roka/async/pool";
 * import { assertEquals } from "jsr:@std/assert";
 *
 * const results = await pool(
 *   [1, 2, 3],
 *   (x) => Promise.resolve(x),
 *   { concurrency: 2 },
 * );
 * assertEquals(results, [1, 2, 3]);
 * ```
 *
 * @module
 */

export * from "./pool.ts";
