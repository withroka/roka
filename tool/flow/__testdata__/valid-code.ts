// Code example that will pass all checks

Deno.test("example test", () => {
  if (example() !== 42) throw new Error("fail");
});

/** Example function. */
export function example(): number {
  return 42;
}
