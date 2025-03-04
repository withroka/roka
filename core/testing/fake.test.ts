import { fakeConsole } from "@roka/testing/fake";
import { assertEquals, assertFalse } from "@std/assert";

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
  console.debug("First!");
  console.debug("Second!");
  assertEquals(console.calls, [
    { level: "debug", data: ["First!"] },
    { level: "debug", data: ["Second!"] },
  ]);
});

Deno.test("fakeConsole() captures multiple arguments", () => {
  using console = fakeConsole();
  console.debug("First!", "Second!");
  assertEquals(console.calls, [
    { level: "debug", data: ["First!", "Second!"] },
  ]);
});
