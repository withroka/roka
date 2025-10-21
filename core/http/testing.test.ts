import { assertEquals, assertExists, assertMatch } from "@std/assert";
import { STATUS_CODE } from "@std/http/status";
import { assertSnapshot } from "@std/testing/snapshot";
import { mockFetch } from "./testing.ts";

Deno.test("mockFetch() stubs fetch", async (t) => {
  using _fetch = mockFetch(t);
  const response = await fetch("https://example.com");
  assertEquals(response.status, STATUS_CODE.OK);
  await assertSnapshot(t, await response.text());
  assertExists(response?.headers.get("date"));
});

Deno.test("mockFetch() replays multiple calls", async (t) => {
  using fetch = mockFetch(t);
  await fetch("https://example.com");
  await fetch("https://example.com");
});

Deno.test("mockFetch() matches with URL", async (t) => {
  using fetch = mockFetch(t);
  await fetch(new URL("https://example.com"));
});

Deno.test("mockFetch() matches with Request", async (t) => {
  using fetch = mockFetch(t);
  await fetch(new Request("https://example.com"));
});

Deno.test("mockFetch() matches with Request and init", async (t) => {
  using fetch = mockFetch(t);
  await fetch(
    new Request("https://example.com"),
    { method: "POST" },
  );
});

Deno.test("mockFetch() matches with URL and Request", async (t) => {
  using fetch = mockFetch(t);
  await fetch(
    new URL("https://example.com"),
    new Request("https://example.com", { method: "POST" }),
  );
});

Deno.test("mockFetch() matches method", async (t) => {
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

Deno.test("mockFetch() matches body", async (t) => {
  using fetch = mockFetch(t);
  await Promise.all([
    fetch("https://example.com", { method: "POST", body: "body" }),
    fetch("https://example.com", { method: "POST", body: "" }),
    fetch("https://example.com", { method: "POST" }),
  ]);
});

Deno.test("mockFetch() matches consumable request", async (t) => {
  using fetch = mockFetch(t);
  await fetch(
    new Request("https://example.com", {
      method: "POST",
      body: "body",
    }),
  );
});

Deno.test("mockFetch() matches arraybuffer body", async (t) => {
  using fetch = mockFetch(t);
  await fetch("https://example.com", {
    method: "POST",
    body: new TextEncoder().encode("body"),
  });
});

Deno.test("mockFetch() matches blob body", async (t) => {
  using fetch = mockFetch(t);
  await fetch("https://example.com", {
    method: "POST",
    body: new Blob(["body"], { type: "text/plain" }),
  });
});

Deno.test("mockFetch() matches form data body", async (t) => {
  using fetch = mockFetch(t);
  const body = new FormData();
  body.append("key", "value");
  await fetch("https://example.com", { method: "POST", body });
});

Deno.test("mockFetch() matches search params body", async (t) => {
  using fetch = mockFetch(t);
  const body = new URLSearchParams();
  body.append("key", "value");
  await fetch("https://example.com", { method: "POST", body });
});

Deno.test("mockFetch() matches iterable body", async (t) => {
  using fetch = mockFetch(t);
  const body = new TextEncoder().encode("body");
  await fetch("https://example.com", { method: "POST", body });
});

Deno.test("mockFetch() matches async iterable body", async (t) => {
  using fetch = mockFetch(t);
  async function* body() {
    yield new TextEncoder().encode("body");
  }
  await fetch("https://example.com", {
    method: "POST",
    body: body(),
  });
});

Deno.test("mockFetch({ ignore }) can ignore headers", async (t) => {
  using fetch = mockFetch(t, { ignore: { headers: true } });
  let response: Response | undefined = undefined;
  if (fetch.mode === "update") {
    response = await fetch("https://example.com", {
      headers: { "User-Agent": "v1" },
    });
  }
  if (fetch.mode === "replay") {
    response = await fetch("https://example.com", {
      headers: { "User-Agent": "v2" },
    });
  }
  assertEquals(response?.headers.get("date"), null);
  assertMatch(
    response?.headers.get("content-type") ?? "",
    /^text\/html(;.*)?$/,
  );
});
