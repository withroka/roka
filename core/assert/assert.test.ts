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
    () => assertSameElements(["Alice", "Bob"], ["Alice"]),
    AssertionError,
  );
});

Deno.test("assertSameElements() rejects arrays with different elements", () => {
  assertThrows(
    () => assertSameElements(["Alice", "Bob"], ["Alice", "Charlie"]),
    AssertionError,
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
