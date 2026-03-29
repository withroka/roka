import { fakeConsole } from "@roka/testing/fake";
import { assertEquals, assertStrictEquals } from "@std/assert";
import { red } from "@std/fmt/colors";
import { assertType, type Has } from "@std/testing/types";
import { console, render } from "./console.ts";

assertType<Has<typeof console, globalThis.Console>>(true);

Deno.test("console defaults verbose to false", () => {
  assertEquals(console.verbose, false);
});

Deno.test("console css output is consistent with global console", () => {
  using fake = fakeConsole();
  console.log("%cmessage", "color: red");
  globalThis.console.log("%cmessage", "color: red");
  assertEquals(fake.calls[0]?.data[0], fake.calls[1]?.data[0]);
});

Deno.test("console JSON output is consistent with global console", () => {
  using fake = fakeConsole();
  const data = { key: "value" };
  console.log(data);
  globalThis.console.log(data);
  assertStrictEquals(
    fake.calls[0]?.data[0],
    fake.calls[1]?.data[0],
  );
});

Deno.test("console error output is consistent with global console", () => {
  using fake = fakeConsole();
  const error = new Error("message");
  console.log(error);
  globalThis.console.log(error);
  assertStrictEquals(
    fake.calls[0]?.data[0],
    fake.calls[1]?.data[0],
  );
});

Deno.test("console.debug() is silent when not verbose", () => {
  using fake = fakeConsole();
  console.verbose = false;
  console.debug("hidden");
  assertEquals(fake.output(), "");
});

Deno.test("console.debug() outputs when verbose", () => {
  using fake = fakeConsole();
  console.verbose = true;
  try {
    console.debug("visible");
    assertEquals(fake.output(), "visible");
  } finally {
    console.verbose = false;
  }
});

Deno.test("console.debug() strips ANSI codes when not in terminal", () => {
  using fake = fakeConsole();
  console.verbose = true;
  try {
    console.debug(red("message"));
    assertEquals(fake.output({ stripAnsi: false }), "message");
  } finally {
    console.verbose = false;
  }
});

Deno.test("console.log strips ANSI codes when not in terminal", () => {
  using fake = fakeConsole();
  console.log(red("message"));
  assertEquals(fake.output({ stripAnsi: false }), "message");
});

Deno.test("console.info strips ANSI codes when not in terminal", () => {
  using fake = fakeConsole();
  console.info(red("message"));
  assertEquals(fake.output({ stripAnsi: false }), "message");
});

Deno.test("console.warn strips ANSI codes when not in terminal", () => {
  using fake = fakeConsole();
  console.warn(red("message"));
  assertEquals(fake.output({ stripAnsi: false }), "message");
});

Deno.test("console.error strips ANSI codes when not in terminal", () => {
  using fake = fakeConsole();
  console.error(red("message"));
  assertEquals(fake.output({ stripAnsi: false }), "message");
});

Deno.test("render() does not stringify non-string values", () => {
  assertEquals(render(true), true);
  assertEquals(render(42), 42);
  assertEquals(render({ key: "value" }), { key: "value" });
});

Deno.test("render() does not strip ANSI codes when in terminal", () => {
  assertEquals(
    render(red("hello"), { terminal: true }),
    red("hello"),
  );
});

Deno.test("render() strips ANSI codes when not in terminal", () => {
  assertEquals(
    render(red("hello"), { terminal: false }),
    "hello",
  );
});
