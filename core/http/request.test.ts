import { mockFetch } from "@roka/http/testing";
import { assertEquals, assertRejects } from "@std/assert";
import { STATUS_CODE } from "@std/http/status";
import { assertSnapshot } from "@std/testing/snapshot";
import { request, RequestError } from "./request.ts";

Deno.test("request() makes request", async (t) => {
  using _fetch = mockFetch(t);
  const response = await request("https://example.com");
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
