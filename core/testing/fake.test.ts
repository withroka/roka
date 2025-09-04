// deno-lint-ignore-file no-console
import { assertEquals, assertFalse } from "@std/assert";
import { fakeConsole } from "./fake.ts";

Deno.test("fakeConsole() stubs console", () => {
  using mock = fakeConsole();
  console.debug("Hello, Debug!");
  console.log("Hello, Log!");
  console.info("Hello, Info!");
  console.warn("Hello, Warn!");
  console.error("Hello, Error!");
  assertEquals(mock.calls, [
    { level: "debug", data: ["Hello, Debug!"] },
    { level: "log", data: ["Hello, Log!"] },
    { level: "info", data: ["Hello, Info!"] },
    { level: "warn", data: ["Hello, Warn!"] },
    { level: "error", data: ["Hello, Error!"] },
  ]);
});

Deno.test("fakeConsole() implements spy like interface", () => {
  const console = fakeConsole();
  try {
    console.debug("Hello, Debug!");
    console.log("Hello, Log!");
    console.info("Hello, Info!");
    console.warn("Hello, Warn!");
    console.error("Hello, Error!");
    assertEquals(console.calls, [
      { level: "debug", data: ["Hello, Debug!"] },
      { level: "log", data: ["Hello, Log!"] },
      { level: "info", data: ["Hello, Info!"] },
      { level: "warn", data: ["Hello, Warn!"] },
      { level: "error", data: ["Hello, Error!"] },
    ]);
    assertFalse(console.restored);
  } finally {
    console.restore();
    assertEquals(console.restored, true);
  }
});

Deno.test("fakeConsole() captures multiple calls", () => {
  using console = fakeConsole();
  console.debug("first");
  console.debug("second");
  assertEquals(console.calls, [
    { level: "debug", data: ["first"] },
    { level: "debug", data: ["second"] },
  ]);
});

Deno.test("fakeConsole() captures multiple arguments", () => {
  using console = fakeConsole();
  console.debug("first", "second");
  assertEquals(console.calls, [
    { level: "debug", data: ["first", "second"] },
  ]);
});

Deno.test("fakeConsole().output() formats captured arguments", () => {
  using console = fakeConsole();
  console.debug("first", "second");
  assertEquals(console.output(), "first second");
});

Deno.test("fakeConsole().output() can filter by level", () => {
  using console = fakeConsole();
  console.info("first");
  console.debug("second");
  assertEquals(console.output({ level: "info" }), "first");
  assertEquals(console.output({ level: "debug" }), "second");
  assertEquals(console.output({ level: "error" }), "");
});

Deno.test("fakeConsole().output() can trim line ends", () => {
  using console = fakeConsole();
  console.info("first ");
  console.debug("second  \n ");
  console.log();
  assertEquals(console.output({ trimEnd: false }), "first \nsecond  \n \n");
  assertEquals(console.output({ trimEnd: true }), "first\nsecond\n\n");
});

Deno.test("fakeConsole().output() can wrap output", () => {
  using console = fakeConsole();
  console.info("first");
  console.debug("second");
  assertEquals(console.output({ wrap: "\n" }), "\nfirst\nsecond\n");
  assertEquals(console.output({ wrap: "'" }), "'first\nsecond'");
});

Deno.test("fakeConsole().output() ignores styling by default", () => {
  using console = fakeConsole();
  console.log("%clog", "color: red", "font-weight: bold");
  assertEquals(console.output(), "log");
});

Deno.test("fakeConsole().output() can capture styling", () => {
  using console = fakeConsole();
  console.log("%clog", "color: red", "font-weight: bold");
  assertEquals(
    console.output({ color: true }),
    "%clog color: red font-weight: bold",
  );
});
