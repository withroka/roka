import { request } from "@roka/http/request";
import { mockFetch } from "@roka/testing/mock";
import { assertEquals } from "@std/assert/equals";
import { assertRejects } from "@std/assert/rejects";
import { STATUS_CODE } from "@std/http/status";
import { assertSnapshot } from "@std/testing/snapshot";

Deno.test("request() makes request", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request("https://example.com");
  assertEquals(response.status, STATUS_CODE.OK);
  await assertSnapshot(t, await response.text());
});

Deno.test("request() throws error on failing response", async (t) => {
  using _fetch = mockFetch(t);
  await assertRejects(() => request("https://example.com/not-found"));
});

Deno.test("request() can ignore errors", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request("https://example.com/not-found", {
    allowedErrors: [STATUS_CODE.NotFound],
  });
  assertEquals(response.status, STATUS_CODE.NotFound);
});

Deno.test("request() can pass certain headers", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request("https://example.com", {
    agent: "agent",
    token: "token",
  });
  assertEquals(response.status, STATUS_CODE.OK);
});
