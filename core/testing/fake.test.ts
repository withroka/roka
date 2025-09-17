// deno-lint-ignore-file no-console
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import { MockError } from "@std/testing/mock";
import { fakeArgs, fakeConsole, fakeEnv } from "./fake.ts";

Deno.test("fakeArgs() provides fake script arguments", () => {
  const original = Deno.args;
  const fake = fakeArgs(["arg1", "arg2"]);
  assertEquals(Deno.args, ["arg1", "arg2"]);
  fake.restore();
  assertEquals(Deno.args, original);
});

Deno.test("fakeArgs() provides a disposable object", () => {
  const original = Deno.args;
  {
    using _ = fakeArgs(["arg1", "arg2"]);
    assertEquals(Deno.args, ["arg1", "arg2"]);
  }
  assertEquals(Deno.args, original);
});

Deno.test("fakeArgs() implements spy like interface", () => {
  const original = Deno.args;
  const fake = fakeArgs(["arg1", "arg2"]);
  assertEquals(fake.args, Deno.args);
  assertFalse(fake.restored);
  fake.restore();
  assert(fake.restored);
  assertEquals(Deno.args, original);
  assertThrows(() => fake.restore(), MockError);
});

Deno.test("fakeEnv() provides fake environment variables", () => {
  assertEquals(Deno.env.get("FAKE_ENV"), undefined);
  const env = fakeEnv({ FAKE_ENV: "value" });
  assertEquals(env.toObject(), { FAKE_ENV: "value" });
  assertEquals(Deno.env.get("FAKE_ENV"), "value");
  env.set("FAKE_ENV", "new_value");
  assertEquals(Deno.env.get("FAKE_ENV"), "new_value");
  assert(env.has("FAKE_ENV"));
  env.delete("FAKE_ENV");
  assertEquals(Deno.env.get("FAKE_ENV"), undefined);
  assertFalse(env.has("FAKE_ENV"));
  env.delete("FAKE_ENV");
  assertFalse(env.has("FAKE_ENV"));
  env.restore();
  assertEquals(Deno.env.get("FAKE_ENV"), undefined);
});

Deno.test("fakeEnv() provides a disposable object", () => {
  assertEquals(Deno.env.get("FAKE_ENV"), undefined);
  {
    using _ = fakeEnv({ FAKE_ENV: "value" });
    assertEquals(Deno.env.get("FAKE_ENV"), "value");
  }
  assertEquals(Deno.env.get("FAKE_ENV"), undefined);
});

Deno.test("fakeEnv() implements spy like interface", () => {
  const env = fakeEnv({ FAKE_ENV: "value" });
  assertFalse(env.restored);
  env.restore();
  assert(env.restored);
  assertThrows(() => env.restore(), MockError);
});

Deno.test("fakeEnv() handles variables without permissions", () => {
  using env = fakeEnv({ UNKNOWN1: "value" });
  assertEquals(env.get("UNKNOWN1"), "value");
  env.set("UNKNOWN2", "value");
  assertEquals(env.get("UNKNOWN2"), "value");
  assert(env.has("UNKNOWN1"));
  assert(env.has("UNKNOWN2"));
});

Deno.test("fakeEnv() isolates from test environments", () => {
  try {
    assertFalse(Deno.env.has("FAKE_ENV"));
    Deno.env.set("FAKE_ENV", "original");
    const env = fakeEnv({});
    assertFalse(env.has("FAKE_ENV"));
    Deno.env.set("FAKE_ENV", "modified");
    assertEquals(Deno.env.get("FAKE_ENV"), "modified");
    assert(env.has("FAKE_ENV"));
    env.restore();
    assertEquals(Deno.env.get("FAKE_ENV"), "original");
  } finally {
    Deno.env.delete("FAKE_ENV");
  }
});

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
  console.restore();
  assert(console.restored);
  assertThrows(() => console.restore(), MockError);
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
