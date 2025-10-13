/**
 * A library for making assertions, complementary to the standard
 * {@link https://jsr.io/@std/assert | **@std/assert**} library.
 *
 * ```ts
 * import { assertSameElements } from "@roka/assert";
 * assertSameElements(["Alice", "Bob"], ["Bob", "Alice"]);
 * ```
 *
 * ```ts
 * import { assertArrayObjectMatch } from "@roka/assert";
 * assertArrayObjectMatch(
 *   [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
 *   [{ name: "Alice" }, { name: "Bob" }],
 * );
 * ```
 *
 * @module assert
 */

import { assertEquals, assertExists, assertObjectMatch } from "@std/assert";

/** An array-like object that is not a string. */
export type ArrayLikeArg<T> = ArrayLike<T> & object;

/** Type of an object key. */
export type PropertyKey = string | number | symbol;

/**
 * Makes an assertion that two arrays contain the same elements, regardless of
 * their order.
 *
 * This function counts the number of times each element appears in both arrays
 * and then compares these tallies using `assertEquals` from the standard
 * {@link https://jsr.io/@std/assert | **@std/assert**} library.
 *
 * @throws {AssertionError} If the arrays differ in length or if the arrays
 * contain different groups of elements.
 *
 * @example Using `assertSameElements()`.
 * ```ts
 * import { assertSameElements } from "@roka/assert";
 *
 * assertSameElements(["Alice", "Bob"], ["Bob", "Alice"]); // passes
 * ```
 */
export function assertSameElements<T>(
  actual: ArrayLikeArg<T>,
  expected: ArrayLikeArg<T>,
  message?: string,
): void {
  function count(array: ArrayLikeArg<T>): Map<T, number> {
    const map = new Map<T, number>();
    for (const item of Array.from(array)) {
      map.set(item, (map.get(item) ?? 0) + 1);
    }
    return map;
  }
  assertEquals(
    count(actual),
    count(expected),
    message || "different elements",
  );
}

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
 * the standard {@link https://jsr.io/@std/assert | **@std/assert**}
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
 * assertArrayObjectMatch(actual, expected); // passes
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
  // deno-lint-ignore no-explicit-any
  actual: Record<PropertyKey, any>[],
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
