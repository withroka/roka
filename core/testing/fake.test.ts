// deno-lint-ignore-file no-console
import { assertArrayObjectMatch } from "@roka/assert";
import { pool } from "@roka/async/pool";
import {
  assert,
  assertEquals,
  assertExists,
  assertFalse,
  assertNotEquals,
  assertObjectMatch,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { MockError } from "@std/testing/mock";
import { fakeArgs, fakeCommand, fakeConsole, fakeEnv } from "./fake.ts";

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

Deno.test("fakeArgs() rejects recursive use", () => {
  using _ = fakeArgs(["arg1", "arg2"]);
  assertThrows(() => fakeArgs(["arg3", "arg4"]), MockError);
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

Deno.test("fakeEnv() rejects recursive use", () => {
  using _ = fakeEnv({ FAKE_ENV: "value" });
  assertThrows(() => fakeEnv({ FAKE_ENV: "other" }), MockError);
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

Deno.test("fakeConsole() rejects recursive use", () => {
  using _ = fakeConsole();
  assertThrows(() => fakeConsole(), MockError);
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
  console.debug("first", "second", 3);
  assertEquals(console.output(), "first second 3");
});

Deno.test("fakeConsole().output() formats captured object", () => {
  using console = fakeConsole();
  console.debug({ first: 1, second: 2 });
  assertEquals(console.output(), "{ first: 1, second: 2 }");
});

Deno.test("fakeConsole().output({ level }) filters by level", () => {
  using console = fakeConsole();
  console.info("first");
  console.debug("second");
  assertEquals(console.output({ level: "info" }), "first");
  assertEquals(console.output({ level: "debug" }), "second");
  assertEquals(console.output({ level: "error" }), "");
});

Deno.test("fakeConsole().output({ stripAnsi }) strips ANSI escape codes", () => {
  using console = fakeConsole();
  console.log("\u001b[31mred\u001b[0m");
  assertEquals(console.output(), "\u001b[31mred\u001b[0m");
  assertEquals(console.output({ stripAnsi: true }), "red");
});

Deno.test("fakeConsole().output({ stripCss }) strips CSS styling", () => {
  using console = fakeConsole();
  console.log("%clog", "color: red", "font-weight: bold");
  assertEquals(console.output(), "%clog color: red font-weight: bold");
  assertEquals(console.output({ stripCss: true }), "log");
});

Deno.test("fakeConsole().output({ trimEnd }) trims line ends", () => {
  using console = fakeConsole();
  console.info("first ");
  console.debug("second  \n ");
  console.log();
  assertEquals(console.output({ trimEnd: false }), "first \nsecond  \n \n");
  assertEquals(console.output({ trimEnd: true }), "first\nsecond\n\n");
});

Deno.test("fakeConsole().output({ wrap }) wraps output with text", () => {
  using console = fakeConsole();
  console.info("first");
  console.debug("second");
  assertEquals(console.output({ wrap: "\n" }), "\nfirst\nsecond\n");
  assertEquals(console.output({ wrap: "'" }), "'first\nsecond'");
});

Deno.test("fakeCommand() stubs Deno.Command", async () => {
  using mock = fakeCommand({
    echo: [{ code: 0, stdout: "output", stderr: "error" }],
  });
  const command = new Deno.Command("echo", { args: ["Hello, World!"] });
  const output = await command.output();
  assertObjectMatch(output, {
    success: true,
    code: 0,
    signal: null,
  });
  assertEquals(new TextDecoder().decode(output.stdout), "output");
  assertEquals(new TextDecoder().decode(output.stderr), "error");
  assertArrayObjectMatch(mock.runs, [{
    command: "echo",
    options: { args: ["Hello, World!"] },
    stdin: null,
  }]);
});

Deno.test("fakeCommand() implements spy like interface", async () => {
  const command = fakeCommand({
    echo: [{ code: 0, stdout: "output", stderr: "error" }],
  });
  const cmd = new Deno.Command("echo", { args: ["Hello, World!"] });
  assertFalse(command.restored);
  assertEquals(command.runs, []);
  await cmd.output();
  assertArrayObjectMatch(command.runs, [{
    command: "echo",
    options: { args: ["Hello, World!"] },
    stdin: null,
  }]);
  command.restore();
  assertThrows(() => command.restore(), MockError);
  assertEquals(command.restored, true);
});

Deno.test("fakeCommand() rejects recursive use", () => {
  using _ = fakeCommand();
  assertThrows(() => fakeCommand(), MockError);
});

Deno.test("fakeCommand() succeeds by default", async () => {
  using command = fakeCommand();
  assertEquals(command.runs, []);
  const cmd = new Deno.Command("echo", { args: ["Hello, World!"] });
  assertEquals(await cmd.output(), {
    success: true,
    code: 0,
    signal: null,
    stdout: new TextEncoder().encode(""),
    stderr: new TextEncoder().encode(""),
  });
});

Deno.test("fakeCommand() handles multiple commands", async () => {
  using command = fakeCommand({
    echo: [
      { code: 0, stdout: new TextEncoder().encode("output"), stderr: "" },
      { code: 1, stdout: "", stderr: new TextEncoder().encode("error") },
    ],
    ls: [{ code: 0, stdout: "list", stderr: "" }],
  });
  assertEquals(command.runs, []);
  const cmd1 = new Deno.Command("echo", { args: ["Hello, World!"] });
  const cmd2 = new Deno.Command("echo", { args: ["Hello, Mars!"] });
  const cmd3 = new Deno.Command("echo", { args: ["Hello, Venus!"] });
  const cmd4 = new Deno.Command("ls");
  assertEquals(await cmd1.output(), {
    success: true,
    code: 0,
    signal: null,
    stdout: new TextEncoder().encode("output"),
    stderr: new TextEncoder().encode(""),
  });
  assertEquals(await cmd2.output(), {
    success: false,
    code: 1,
    signal: null,
    stdout: new TextEncoder().encode(""),
    stderr: new TextEncoder().encode("error"),
  });
  assertEquals(await cmd3.output(), {
    success: true,
    code: 0,
    signal: null,
    stdout: new TextEncoder().encode(""),
    stderr: new TextEncoder().encode(""),
  });
  assertEquals(await cmd4.output(), {
    success: true,
    code: 0,
    signal: null,
    stdout: new TextEncoder().encode("list"),
    stderr: new TextEncoder().encode(""),
  });
  assertArrayObjectMatch(command.runs, [
    { command: "echo", options: { args: ["Hello, World!"] } },
    { command: "echo", options: { args: ["Hello, Mars!"] } },
    { command: "echo", options: { args: ["Hello, Venus!"] } },
    { command: "ls" },
  ]);
});

Deno.test("fakeCommand() handles multiple spawns", () => {
  using mock = fakeCommand();
  const cmd = new Deno.Command("sleep", { args: ["0.1"] });
  const proc1 = cmd.spawn();
  const proc2 = cmd.spawn();
  const proc3 = cmd.spawn();
  assertNotEquals(proc1.pid, proc2.pid);
  assertNotEquals(proc2.pid, proc3.pid);
  assertArrayObjectMatch(
    mock.runs,
    [
      { command: "sleep", options: { args: ["0.1"] } },
      { command: "sleep", options: { args: ["0.1"] } },
      { command: "sleep", options: { args: ["0.1"] } },
    ],
  );
});

Deno.test("fakeCommand() rejects piping when disabled", async () => {
  using mock = fakeCommand();
  const cmd = new Deno.Command("null", {
    stdin: "null",
    stdout: "null",
    stderr: "null",
  });
  const proc = cmd.spawn();
  assertThrows(() => proc.stdin, TypeError);
  assertThrows(() => proc.stdout, TypeError);
  assertThrows(() => proc.stderr, TypeError);
  const output = await cmd.output();
  assertThrows(() => output.stdout, TypeError);
  assertThrows(() => output.stderr, TypeError);
  assertArrayObjectMatch(mock.runs, [{
    command: "null",
    options: { stdin: "null", stdout: "null", stderr: "null" },
    stdin: null,
  }, {
    command: "null",
    options: { stdin: "null", stdout: "null", stderr: "null" },
    stdin: null,
  }]);
});

Deno.test("fakeCommand() rejects output() when stdin is piped", async () => {
  using mock = fakeCommand();
  const cmd = new Deno.Command("null", {
    stdin: "piped",
    stdout: "null",
    stderr: "null",
  });
  const proc = cmd.spawn();
  assertExists(proc.stdin);
  await assertRejects(() => cmd.output(), TypeError);
  assertArrayObjectMatch(mock.runs, [{
    command: "null",
    options: { stdin: "piped", stdout: "null", stderr: "null" },
    stdin: new Uint8Array(),
  }]);
});

Deno.test("fakeCommand() ends processes by default", async () => {
  using command = fakeCommand();
  assertEquals(command.runs, []);
  const process = new Deno.Command("sleep", { args: ["1"] }).spawn();
  assertEquals(await process.status, {
    success: true,
    code: 0,
    signal: null,
  });
  assertThrows(() => process.kill(), MockError);
});

Deno.test("fakeCommand({ keep }) can keep processes alive", async () => {
  using command = fakeCommand({
    sleep: [{ code: 0, keep: true }, { code: 1, keep: true }],
  });
  assertEquals(command.runs, []);
  new Deno.Command("sleep", { args: ["10"], stdin: "piped" }).spawn();
  new Deno.Command("sleep", { args: ["10"], stdin: "piped" }).spawn();
  assertEquals(
    await pool(command.runs, async (run) => {
      ReadableStream
        .from([
          new TextEncoder().encode("Hello, "),
          new TextEncoder().encode("World!"),
        ])
        .pipeTo(run.process.stdin);
      let statusResolved = false;
      const statusPromise = run.process.status.then((status) => {
        statusResolved = true;
        return status;
      });
      await Promise.resolve();
      assertFalse(statusResolved);
      run.process.kill();
      await Promise.resolve();
      assertFalse(statusResolved);
      const status = await statusPromise;
      assertExists(run.stdin);
      assertEquals(new TextDecoder().decode(run.stdin), "Hello, World!");
      assert(statusResolved);
      assertThrows(() => run.process.kill(), MockError);
      return status;
    }, {
      concurrency: 2,
    }),
    [
      { success: true, code: 0, signal: "SIGTERM" },
      { success: false, code: 1, signal: "SIGTERM" },
    ],
  );
});
