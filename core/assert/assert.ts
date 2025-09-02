/**
 * This module provides functions for making assertions, and it is
 * complementary to the standard {@link https://jsr.io/@std/assert | **@std/assert**}
 * library.
 *
 * ```ts
 * assertArrayObjectMatch(
 *   [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
 *   [{ name: "Alice" }, { name: "Bob" }],
 * );
 * ```
 *
 * @module assert
 */

import { assertEquals, assertExists, assertObjectMatch } from "@std/assert";

/** Type of an object key. */
type PropertyKey = string | number | symbol;
export type { PropertyKey };

/**
 * Makes an assertion that the expected array is a list of objects that is a
 * subset of the corresponding objects in the actual array.
 *
 * This function checks that both arrays have the same length and that each
 * object in the `actual` array contains at least the same keys and
 * corresponding values as the object at the same index in the `expected` array.
 * Extra keys in the `actual` objects are ignored.
 *
 * This function is an array variant of the `assertObjectMatch` function from
 * the the standard {@link https://jsr.io/@std/assert | **@std/assert**}
 * library.
 *
 * @example Using `assertArrayObjectMatch()`.
 * ```ts
 * import { assertArrayObjectMatch } from "@roka/assert";
 *
 * const actual = [
 *   { id: 1, name: "Alice", age: 30 },
 *   { id: 2, name: "Bob", age: 25, extra: "data" },
 * ];
 * const expected = [
 *   { id: 1, name: "Alice" },
 *   { id: 2, name: "Bob" },
 * ];
 *
 * assertArrayObjectMatch(actual, expected);  // passes
 * ```
 *
 * @throws {AssertionError} If the arrays differ in length or if any object in
 * the `actual` array does not match the corresponding object in the `expected`
 * array.
 *
 * @param actual The actual value to be matched.
 * @param expected The expected value to match.
 * @param msg The optional message to display if the assertion fails.
 */
export function assertArrayObjectMatch(
  actual: Record<PropertyKey, unknown>[],
  expected: Record<PropertyKey, unknown>[],
  message?: string,
): void {
  assertEquals(
    actual.length,
    expected.length,
    message ? `${message} different lengths` : "different lengths",
  );
  for (let i = 0; i < expected.length; i++) {
    const actualItem = actual[i];
    const expectedItem = expected[i];
    assertExists(actualItem);
    assertExists(expectedItem);
    assertObjectMatch(actualItem, expectedItem, message);
  }
}
