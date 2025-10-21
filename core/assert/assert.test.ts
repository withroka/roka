import { AssertionError, assertThrows } from "@std/assert";
import { assertArrayObjectMatch, assertSameElements } from "./assert.ts";

Deno.test("assertSameElements() asserts arrays with same elements in different order", () => {
  assertSameElements(["Alice", "Bob"], ["Bob", "Alice"]);
});

Deno.test("assertSameElements() handles empty arrays", () => {
  assertSameElements([], []);
});

Deno.test("assertSameElements() rejects arrays with different lengths", () => {
  assertThrows(
    () => assertSameElements(["Alice"], []),
    AssertionError,
  );
  assertThrows(
    () => assertSameElements([], ["Bob"]),
    AssertionError,
  );
  assertThrows(
    () => assertSameElements(["Alice", "Bob"], ["Alice"]),
    AssertionError,
  );
  assertThrows(
    () => assertSameElements(["Alice"], ["Alice", "Bob"]),
    AssertionError,
  );
});

Deno.test("assertSameElements() rejects arrays with different elements", () => {
  assertThrows(
    () => assertSameElements(["Alice", "Bob"], ["Alice", "Charlie"]),
    AssertionError,
  );
});

Deno.test("assertSameElements() handles elements occurring multiple times", () => {
  assertSameElements(["Alice", "Bob", "Alice"], ["Bob", "Alice", "Alice"]);
});

Deno.test("assertSameElements() rejects different counts of same elements", () => {
  assertThrows(
    () => assertSameElements(["Alice", "Bob", "Alice"], ["Bob", "Alice"]),
    AssertionError,
  );
  assertThrows(
    () => assertSameElements(["Bob", "Alice"], ["Alice", "Bob", "Alice"]),
    AssertionError,
  );
});

Deno.test("assertSameElements() handles non-comparable elements", () => {
  assertSameElements(
    [{ id: 1 }, { id: 2 }],
    [{ id: 2 }, { id: 1 }],
  );
  assertThrows(() =>
    assertSameElements(
      [{ id: 1 }, { id: 2 }, { id: 1 }],
      [{ id: 2 }, { id: 1 }],
    ), AssertionError);
  assertThrows(() =>
    assertSameElements(
      [{ id: 2 }, { id: 1 }],
      [{ id: 1 }, { id: 2 }, { id: 1 }],
    ), AssertionError);
});

Deno.test("assertSameElements() asserts array elements are exact", () => {
  assertSameElements(
    [[1, 2], [3, 4]],
    [[3, 4], [1, 2]],
  );
  assertThrows(() =>
    assertSameElements(
      [[1, 2], [3]],
      [[3, 4], [1, 2]],
    ), AssertionError);
  assertThrows(() =>
    assertSameElements(
      [[1, 2], [3, 4], [1, 2]],
      [[3, 4], [1, 2]],
    ), AssertionError);
  assertThrows(() =>
    assertSameElements(
      [[3, 4], [1, 2]],
      [[1, 2], [3, 4], [1, 2]],
    ), AssertionError);
});

Deno.test("assertSameElements() fails with custom message", () => {
  assertThrows(
    () => assertSameElements(["Alice", "Bob"], ["Alice"], "custom-message"),
    AssertionError,
    "custom-message",
  );
});

Deno.test("assertArrayObjectMatch() asserts expected objects are subsets of actual objects", () => {
  const actual = [
    { id: 1, name: "Alice", age: 30 },
    { id: 2, name: "Bob", age: 25, extra: true },
  ];
  const expected = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ];

  assertArrayObjectMatch(actual, expected);
});

Deno.test("assertArrayObjectMatch() handles empty arrays", () => {
  assertArrayObjectMatch([], []);
});

Deno.test("assertArrayObjectMatch() asserts expected arrays are subsets of actual arrays ", () => {
  assertArrayObjectMatch([
    { id: 1, data: [1, 2, 3] },
    { id: 2, data: [4, 5, 6] },
  ], [
    { id: 1, data: [1, 2, 3] },
    { id: 2, data: [4, 5, 6] },
  ]);
  assertArrayObjectMatch([
    { id: 1, data: [1, 2, 3, 4] },
  ], [
    { id: 1, data: [1, 2, 3] },
  ]);
  assertThrows(() =>
    assertArrayObjectMatch([
      { id: 1, data: [1, 2, 3] },
    ], [
      { id: 1, data: [1, 2, 3, 4] },
    ]), AssertionError);
});

Deno.test("assertArrayObjectMatch() rejects length mismatch", () => {
  assertThrows(
    () => assertArrayObjectMatch([{ id: 1 }, { id: 2 }], [{ id: 1 }]),
    AssertionError,
    "different lengths",
  );
});

Deno.test("assertArrayObjectMatch() rejects length mismatch with custom message", () => {
  assertThrows(
    () =>
      assertArrayObjectMatch(
        [{ id: 1 }, { id: 2 }],
        [{ id: 1 }],
        "custom-message",
      ),
    AssertionError,
    "custom-message",
  );
});

Deno.test("assertArrayObjectMatch() rejects missing expected keys", () => {
  assertThrows(
    () =>
      assertArrayObjectMatch(
        [{ id: 1 }],
        [{ id: 1, name: "Alice" }],
      ),
    AssertionError,
    "name",
  );
});

Deno.test("assertArrayObjectMatch() rejects missing expected keys with custom message", () => {
  assertThrows(
    () =>
      assertArrayObjectMatch(
        [{ id: 1 }],
        [{ id: 1, name: "Alice" }],
        "custom-message",
      ),
    AssertionError,
    "custom-message",
  );
});

Deno.test("assertArrayObjectMatch() rejects undefined object", () => {
  assertThrows(() =>
    assertArrayObjectMatch(
      [undefined as unknown as Record<string, unknown>],
      [{}],
    )
  );
});
