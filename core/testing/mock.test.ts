import {
  assertEquals,
  assertFalse,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { MockError } from "@std/testing/mock";
import { assertType, type IsExact } from "@std/testing/types";
import { type Mock, mock } from "./mock.ts";

assertType<
  IsExact<
    ReturnType<typeof mock<typeof globalThis, "fetch">>,
    Mock<typeof fetch> & Disposable
  >
>(true);

Deno.test("mock() mocks a function", async (t) => {
  let originalCalls = 0;
  const self = {
    async original(a: number, b: number): Promise<number> {
      originalCalls++;
      return await Promise.resolve(a + b);
    },
  };
  using mocked = mock(t, self, "original");
  assertEquals(await Promise.all([mocked(2, 4), mocked(3, 5)]), [6, 8]);
  assertEquals(originalCalls, mocked.mode === "update" ? 2 : 0);
});

Deno.test("mock() mocks an arrow function", async (t) => {
  let originalCalls = 0;
  const self = {
    original: async (a: number, b: number) => {
      originalCalls++;
      return await Promise.resolve(a + b);
    },
  };
  using mocked = mock(t, self, "original");
  assertEquals(await Promise.all([mocked(2, 4), mocked(3, 5)]), [6, 8]);
  assertEquals(originalCalls, mocked.mode === "update" ? 2 : 0);
});

Deno.test("mock() mocks a class method", async (t) => {
  class Add {
    constructor(private a: number) {}
    async original(b: number): Promise<number> {
      return await Promise.resolve(this.a + b);
    }
  }
  const instance = new Add(2);
  using mocked = mock(t, instance, "original");
  assertEquals(await mocked(4), 6);
  assertEquals(await mocked(5), 7);
});

Deno.test("mock() implements spy like interface", async (t) => {
  const original = async (a: number, b: number) => await Promise.resolve(a + b);
  const self = { original };
  const mocked = mock(t, self, "original");
  assertEquals(mocked.original, original);
  assertEquals(self.original, self.original);
  assertFalse(mocked.restored);
  assertEquals(await mocked.original(2, 4), 6);
  assertEquals(await mocked(2, 4), 6);
  mocked.restore();
  assertEquals(mocked.restored, true);
  await assertRejects(() => mocked(2, 4), MockError);
});

Deno.test("mock() matches arguments", async (t) => {
  const self = {
    func: async (...args: (number | undefined)[]) =>
      await Promise.resolve(args[0] ?? args[1] ?? args[2]),
  };
  using mocked = mock(t, self, "func");
  assertEquals(
    await Promise.all([
      mocked(),
      mocked(1),
      mocked(2),
      mocked(2),
      mocked(1, 2),
      mocked(undefined),
      mocked(undefined, 2),
      mocked(undefined, 2),
      mocked(undefined, 2, undefined),
    ]),
    [undefined, 1, 2, 2, 1, undefined, 2, 2, 2],
  );
});

Deno.test("mock() can convert input synchronously", async (t) => {
  const self = { func: async (a: string) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func", {
    conversion: { input: { convert: (a: string) => [a.toUpperCase()] } },
  });
  if (mocked.mode === "update") assertEquals(await mocked("hello"), "hello");
  if (mocked.mode === "replay") assertEquals(await mocked("HELLO"), "hello");
});

Deno.test("mock() can convert input asynchronously", async (t) => {
  const self = { func: async (a: string) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func", {
    conversion: {
      input: {
        convert: async (a: string) => await Promise.resolve([a.toUpperCase()]),
      },
    },
  });
  if (mocked.mode === "update") assertEquals(await mocked("hello"), "hello");
  if (mocked.mode === "replay") assertEquals(await mocked("HELLO"), "hello");
});

Deno.test("mock() can convert output synchronously", async (t) => {
  const self = { func: async (a: string) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func", {
    conversion: { output: { convert: (a: string) => a.toUpperCase() } },
  });
  assertEquals(await mocked("hello"), "HELLO");
});

Deno.test("mock() can convert output asynchronously", async (t) => {
  const self = { func: async (a: string) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func", {
    conversion: {
      output: {
        convert: async (a: string) => await Promise.resolve(a.toUpperCase()),
      },
    },
  });
  assertEquals(await mocked("hello"), "HELLO");
});

Deno.test("mock() can revert output synchronously", async (t) => {
  const self = { func: async (a: string) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func", {
    conversion: { output: { revert: (a: string) => a.toLowerCase() } },
  });
  assertEquals(await mocked("HELLO"), "hello");
});

Deno.test("mock() can revert output asynchronously", async (t) => {
  const self = { func: async (a: string) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func", {
    conversion: {
      output: {
        revert: async (a: string) => await Promise.resolve(a.toLowerCase()),
      },
    },
  });
  assertEquals(await mocked("HELLO"), "hello");
});

Deno.test("mock() can store modified input", async (t) => {
  const self = {
    async pop(a: number[]) {
      a.pop();
      return await Promise.resolve(a);
    },
  };
  using mocked = mock(t, self, "pop", {
    conversion: { input: { convert: (a) => [a.slice()] } },
  });
  assertEquals(await mocked([1, 2, 3]), [1, 2]);
});

Deno.test("mock() can store consumable input", async (t) => {
  const self = { body: async (response: Response) => await response.text() };
  using mocked = mock(t, self, "body", {
    conversion: {
      input: {
        convert: async (response: Response) => [await response.clone().text()],
      },
    },
  });
  assertEquals(await mocked(new Response("body")), "body");
});

Deno.test("mock() can store consumable output", async (t) => {
  const self = {
    resp: async (body: string) => await Promise.resolve(new Response(body)),
  };
  using mocked = mock(t, self, "resp", {
    conversion: {
      output: {
        convert: async (resp) => await resp.clone().text(),
        revert: (body) => new Response(body),
      },
    },
  });
  assertEquals(await (await mocked("body")).text(), "body");
});

Deno.test("mock() checks missing mock file", async (t) => {
  const self = { func: async () => await Promise.resolve() };
  using mocked = mock(t, self, "func", {
    mode: "replay",
    dir: "__mocks__/missing",
  });
  await assertRejects(() => mocked(), MockError);
});

Deno.test("mock() checks no calls made", async (t) => {
  const self = { func: async () => await Promise.resolve() };
  await t.step("update", (t) => {
    const mocked = mock(t, self, "func", { mode: "update" });
    assertThrows(() => mocked.restore(), MockError);
  });
  await t.step("replay", (t) => {
    const mocked = mock(t, self, "func", { mode: "replay" });
    assertThrows(() => mocked.restore(), MockError);
  });
});

Deno.test("mock() checks call not recorded", async (t) => {
  const self = { func: async () => await Promise.resolve() };
  using mocked = mock(t, self, "func", { mode: "replay" });
  await assertRejects(() => mocked(), MockError);
});

Deno.test("mock() does not record errors", async (t) => {
  class MyError extends Error {}
  const self = {
    func: async () => {
      await Promise.resolve();
      throw new MyError();
    },
  };
  using mocked = mock(t, self, "func");
  await assertRejects(
    () => mocked(),
    mocked.mode === "update" ? MyError : MockError,
  );
});

Deno.test("mock() checks call not replayed", async (t) => {
  const self = { func: async () => await Promise.resolve() };
  const mocked = mock(t, self, "func");
  await mocked();
  if (mocked.mode === "update") {
    await mocked();
    mocked.restore();
  } else {
    assertThrows(() => mocked.restore(), MockError);
  }
});

Deno.test("mock() disposes silently after missing call", async (t) => {
  const self = { func: async (a: number) => await Promise.resolve(a) };
  using mocked = mock(t, self, "func");
  if (mocked.mode === "update") await mocked(2);
  if (mocked.mode === "replay") await assertRejects(() => mocked(5), MockError);
});

Deno.test("mock() records in custom directory", async (t) => {
  const self = { func: async () => await Promise.resolve(42) };
  using mocked = mock(t, self, "func", { dir: "__mocks__/custom" });
  assertEquals(await mocked(), 42);
});

Deno.test("mock() records in relative custom path", async (t) => {
  const self = { func: async () => await Promise.resolve(42) };
  using mocked = mock(t, self, "func", {
    path: "__mocks__/custom/mock.test.path.ts.mock",
  });
  assertEquals(await mocked(), 42);
});

Deno.test("mock() records in absolute custom path", async (t) => {
  const self = { func: async () => await Promise.resolve(42) };
  using mocked = mock(t, self, "func", {
    path: join(
      dirname(fromFileUrl(t.origin)),
      "__mocks__/custom/mock.test.path.ts.mock",
    ),
  });
  assertEquals(await mocked(), 42);
});

Deno.test("mock() records in custom name", async (t) => {
  const self = { func: async () => await Promise.resolve(42) };
  using mocked = mock(t, self, "func", { name: "custom name" });
  assertEquals(await mocked(), 42);
});

Deno.test("mock() records in custom mode", async (t) => {
  const self = { func: async () => await Promise.resolve(0) };
  using mocked = mock(t, self, "func", {
    mode: "replay",
    path: "__mocks__/custom/mock.test.mode.ts.mock",
  });
  assertEquals(await mocked(), 42);
});

Deno.test("mock() can mock multiple functions", async (t) => {
  const self = {
    func1: async () => await Promise.resolve(1),
    func2: async () => await Promise.resolve(2),
  };
  using mocked1 = mock(t, self, "func1");
  using mocked2 = mock(t, self, "func2");
  assertEquals(await Promise.all([mocked1(), mocked2()]), [1, 2]);
});

Deno.test("mock() can use test step context", async (t) => {
  await t.step("first", async (t) => {
    const self = { func: async () => await Promise.resolve(42) };
    using mocked = mock(t, self, "func");
    assertEquals(await mocked(), 42);
  });
  await t.step("second", async (t) => {
    const self = { func: async () => await Promise.resolve(24) };
    using mocked = mock(t, self, "func");
    assertEquals(await mocked(), 24);
  });
});

Deno.test("mock() can mock a function multiple times", async (t) => {
  const self = { func: async () => await Promise.resolve(42) };
  const mocked1 = mock(t, self, "func");
  assertEquals(await mocked1(), 42);
  mocked1.restore();
  const mocked2 = mock(t, self, "func");
  assertEquals(await mocked2(), 42);
  mocked2.restore();
  const mocked3 = mock(t, self, "func");
  assertEquals(await mocked3(), 42);
  mocked3.restore();
});

Deno.test("mock() checks write permission", {
  permissions: { write: false },
}, async (t) => {
  const self = { func: async () => await Promise.resolve(42) };
  const path = join(
    dirname(fromFileUrl(t.origin)),
    "__mocks__/custom/mock.test.path.ts.mock",
  );
  using mocked = mock(t, self, "func", { path, mode: "update" });
  await assertRejects(() => mocked(), Deno.errors.PermissionDenied);
});

Deno.test("mock() writes mocks on unload event", async (t) => {
  const self = { func: async () => await Promise.resolve("unload") };
  const path = join(
    dirname(fromFileUrl(t.origin)),
    "__mocks__/custom/mock.test.unload.ts.mock",
  );
  try {
    await Deno.remove(path);
  } catch {
    // ignore
  }
  using mocked = mock(t, self, "func", {
    mode: "update",
    path,
    name: "unload write",
  });
  assertEquals(await mocked(), "unload");
  dispatchEvent(new Event("unload"));
  const content = await Deno.readTextFile(path);
  assertEquals(content.includes("export const mock = {};"), true);
  assertEquals(content.includes("mock[`unload write`]"), true);
});
