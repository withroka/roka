import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { testCommit } from "./testing.ts";

Deno.test("testCommit() creates a commit with fake data", () => {
  const commit = testCommit();
  assert(commit.hash.length);
  assert(commit.short.length);
  assert(commit.summary.length);
  assert(commit.body.length);
  assert(commit.author.name.length);
  assert(commit.author.email.length);
  assert(commit.committer.name.length);
  assert(commit.committer.email.length);
});

Deno.test("testCommit() can override fields", () => {
  const commit = testCommit({ summary: "test-summary", body: "test-body" });
  assertEquals(commit.summary, "test-summary");
  assertEquals(commit.body, "test-body");
});
