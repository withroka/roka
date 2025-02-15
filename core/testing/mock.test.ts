import { MockError, mockFetch } from "@roka/testing/mock";
import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";

Deno.test("mockFetch() records in default directory", async (t) => {
  using fetch = mockFetch(t);
  await fetch("https://example.com");
});

Deno.test("mockFetch() records in custom directory", async (t) => {
  using fetch = mockFetch(t, { dir: "__test__" });
  await fetch("https://example.com");
});

Deno.test("mockFetch() stubs fetch", async (t) => {
  using _fetch = mockFetch(t);
  const response = await fetch("https://example.com");
  assertEquals(response.status, 200);
  await assertSnapshot(t, await response.text());
});

Deno.test("mockFetch() allows overriding mock mode", async (t) => {
  await t.step("update", async () => {
    using fetch = mockFetch(t, { mode: "update" });
    await fetch("https://example.com");
  });
  await t.step("replay", async () => {
    using fetch = mockFetch(t, { mode: "replay" });
    await fetch("https://example.com");
  });
});

Deno.test("mockFetch() implements spy like interface", async (t) => {
  const original = globalThis.fetch;
  const fetch = mockFetch(t);
  try {
    assert(fetch.original === original);
    const response = await fetch("https://example.com");
    assertEquals(response.status, 200);
    assertFalse(fetch.restored);
    await assertSnapshot(t, await response.text());
    await assertSnapshot(t, "5");
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
    fetch("https://example.com/"), // same as the prior two
    fetch("http://example.com"),
  ]);
});

Deno.test("mockFetch() with URL", async (t) => {
  await t.step("update", async () => {
    using fetch = mockFetch(t, { mode: "update" });
    await fetch("https://example.com");
  });
  await t.step("replay", async () => {
    using fetch = mockFetch(t, { mode: "replay" });
    await fetch(new URL("https://example.com"));
  });
});

Deno.test("mockFetch() with Request", async (t) => {
  await t.step("update", async () => {
    using fetch = mockFetch(t, { mode: "update" });
    await fetch("https://example.com");
  });
  await t.step("replay", async () => {
    using fetch = mockFetch(t, { mode: "replay" });
    await fetch(new Request("https://example.com"));
  });
});

Deno.test("mockFetch() replays by method", async (t) => {
  using fetch = mockFetch(t);
  const responses = await Promise.all([
    fetch("https://example.com"), // GET
    fetch("https://example.com", { method: "GET" }),
    fetch("https://example.com", { method: "POST" }),
  ]);
  assertEquals(responses.map((r) => r.status), [200, 200, 403]);
});

Deno.test.ignore("mockFetch() checks missing mock file", async (t) => {
  using fetch = mockFetch(t, { mode: "replay", dir: "__missing__" });
  await assertRejects(
    async () => await fetch("https://example.com"),
    MockError,
  );
});

Deno.test("mockFetch() checks call not recorded", async (t) => {
  await t.step("update", async () => {
    using fetch = mockFetch(t, { mode: "update" });
    // this call will be recored into mock
    await fetch("https://example.com");
  });
  await t.step("replay", async () => {
    using fetch = mockFetch(t, { mode: "replay" });
    await fetch("https://example.com");
    await assertRejects(
      async () => await fetch("https://example.com"),
      MockError,
    );
  });
});

Deno.test.ignore("mockFetch() checks no call made", async (t) => {
  await t.step("update", async () => {
    using fetch = mockFetch(t, { mode: "update" });
    await fetch("https://example.com");
  });
  await t.step("replay", () => {
    using fetch = mockFetch(t, { mode: "replay" });
    assertThrows(() => fetch.restore(), MockError);
  });
});

Deno.test.ignore("mockFetch() checks call not replayed", async (t) => {
  await t.step("update", async () => {
    using fetch = mockFetch(t, { mode: "update" });
    await fetch("https://example.com");
    // this call won't be replayed
    await fetch("https://example.com");
  });
  await t.step("replay", async () => {
    using fetch = mockFetch(t, { mode: "replay" });
    await fetch("https://example.com");
    assertThrows(() => fetch.restore(), MockError);
  });
});

Deno.test("mockFetch() matches body", async (t) => {
  using fetch = mockFetch(t);
  const responses = await Promise.all([
    fetch("https://example.com", { method: "POST", body: "body" }),
    fetch("https://example.com", { method: "POST", body: "" }),
    fetch("https://example.com", { method: "POST" }),
  ]);
  assertEquals(responses.map((r) => r.status), [403, 403, 403]);
});
