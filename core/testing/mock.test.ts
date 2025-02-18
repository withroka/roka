import { MockError, mockFetch } from "@roka/testing/mock";
import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { STATUS_CODE } from "@std/http/status";
import { assertSnapshot } from "@std/testing/snapshot";

Deno.test("mockFetch() stubs fetch", async (t) => {
  using _fetch = mockFetch(t);
  const response = await fetch("https://example.com");
  assertEquals(response.status, STATUS_CODE.OK);
  await assertSnapshot(t, await response.text());
});

Deno.test("mockFetch() implements spy like interface", async (t) => {
  const original = globalThis.fetch;
  const fetch = mockFetch(t);
  try {
    assert(fetch.original === original);
    const response = await fetch("https://example.com");
    assertEquals(response.status, STATUS_CODE.OK);
    assertFalse(fetch.restored);
    await assertSnapshot(t, await response.text());
  } finally {
    fetch.restore();
    assert(fetch.restored);
  }
});

Deno.test("mockFetch() replays multiple calls", async (t) => {
  using fetch = mockFetch(t);
  await Promise.all([
    fetch("https://example.com"),
    fetch("https://example.com"),
  ]);
});

Deno.test("mockFetch() with URL", async (t) => {
  using fetch = mockFetch(t);
  await fetch(new URL("https://example.com"));
});

Deno.test("mockFetch() with Request", async (t) => {
  using fetch = mockFetch(t);
  await fetch(new Request("https://example.com"));
});

Deno.test("mockFetch() replays by method", async (t) => {
  using fetch = mockFetch(t);
  const responses = await Promise.all([
    fetch("https://example.com"), // GET
    fetch("https://example.com", { method: "GET" }),
    fetch("https://example.com", { method: "POST" }),
  ]);
  assertEquals(responses.map((r) => r.status), [
    STATUS_CODE.OK,
    STATUS_CODE.OK,
    STATUS_CODE.Forbidden,
  ]);
});

Deno.test("mockFetch() checks missing mock file", async (t) => {
  using fetch = mockFetch(t, { mode: "replay", dir: "__mocks__/missing" });
  await assertRejects(() => fetch("https://example.com"), MockError);
});

Deno.test("mockFetch() checks no call made", (t) => {
  const fetch = mockFetch(t, { mode: "replay" });
  assertThrows(() => fetch.restore(), MockError);
});

Deno.test("mockFetch() checks call not recorded", async (t) => {
  using fetch = mockFetch(t);
  await fetch("https://example.com");
  if (fetch.mode === "replay") {
    await assertRejects(() => fetch("https://example.com"));
  }
});

Deno.test("mockFetch() checks call not replayed", async (t) => {
  const fetch = mockFetch(t);
  await fetch("https://example.com");
  if (fetch.mode === "update") {
    await fetch("https://example.com");
    fetch.restore();
  } else {
    assertThrows(() => fetch.restore(), MockError);
  }
});

Deno.test("mockFetch() disposes silently after missing call", async (t) => {
  using fetch = mockFetch(t);
  if (fetch.mode === "update") await fetch("https://example.com");
  if (fetch.mode === "replay") {
    await assertRejects(
      async () => await fetch("http://example.com"),
      MockError,
    );
  }
});

Deno.test("mockFetch() matches body", async (t) => {
  using fetch = mockFetch(t);
  await Promise.all([
    fetch("https://example.com", { method: "POST", body: "body" }),
    fetch("https://example.com", { method: "POST", body: "" }),
    fetch("https://example.com", { method: "POST" }),
  ]);
});

Deno.test("mockFetch() records in default directory", async (t) => {
  using fetch = mockFetch(t);
  await fetch("https://example.com");
});

Deno.test("mockFetch() records in custom directory", async (t) => {
  using fetch = mockFetch(t, { dir: "__mocks__/custom" });
  await fetch("https://example.com");
});

Deno.test("mockFetch() records in custom path", async (t) => {
  using fetch = mockFetch(t, {
    path: "__mocks__/custom/mock.test.ts.custom.mock",
  });
  await fetch("https://example.com");
});

Deno.test("mockFetch() records with custom name", async (t) => {
  using fetch = mockFetch(t, { name: "custom name" });
  await fetch("https://example.com");
});

Deno.test("mockFetch() allows overriding mock mode", async (t) => {
  using fetch = mockFetch(t, {
    mode: "replay",
    path: "__mocks__/mock.test.ts.mode.mock",
  });
  await fetch("http://example.com");
});
