import { assertEquals, assertRejects } from "@std/assert";
import { STATUS_CODE } from "@std/http/status";
import { assertSnapshot } from "@std/testing/snapshot";
import { request, RequestError } from "./request.ts";
import { mockFetch } from "./testing.ts";

Deno.test("request() makes request", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request("https://example.com", { cache: "no-store" });
  assertEquals(response.status, STATUS_CODE.OK);
  await assertSnapshot(t, await response.text());
});

Deno.test("request() rejects failed response", async (t) => {
  using _fetch = mockFetch(t);
  await assertRejects(
    () => request("https://example.com/not-found"),
    RequestError,
  );
});

Deno.test("request() passes common headers", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request(
    "https://example.com",
    { agent: "agent", token: "token", cache: "no-store", referrer: "referrer" },
  );
  assertEquals(response.status, STATUS_CODE.OK);
});

Deno.test("request({ allowedErrors }) can ignore errors", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request(
    "https://example.com/not-found",
    { allowedErrors: [STATUS_CODE.NotFound], cache: "no-store" },
  );
  assertEquals(response.status, STATUS_CODE.NotFound);
});

Deno.test("request({ allowedErrors }) accepts retrieable errors", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request("https://httpstatus.is/429", {
    allowedErrors: [STATUS_CODE.TooManyRequests],
    retry: { maxAttempts: 3, minTimeout: 0, jitter: 0 },
  });
  assertEquals(response.status, STATUS_CODE.TooManyRequests);
  await assertSnapshot(t, await response.text());
});

Deno.test("request({ cache }) can cache response", async (t) => {
  const cacheStore = t.name;
  await t.step("reload", async (t) => {
    using _fetch = mockFetch(t);
    await request(
      "https://example.com",
      { cache: "reload", cacheStore },
    );
  });
  await t.step("force-cache", async (t) => {
    const response = await request(
      "https://example.com",
      { cache: "force-cache", cacheStore },
    );
    assertEquals(response.status, STATUS_CODE.OK);
    await assertSnapshot(t, await response.text());
  });
  await t.step("only-if-cached", async () => {
    const response = await request(
      "https://example.com",
      { cache: "only-if-cached", cacheMaxAge: 0, cacheStore },
    );
    assertEquals(response.status, STATUS_CODE.OK);
    response.body?.cancel();
  });
});
