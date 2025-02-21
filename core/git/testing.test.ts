import { tempRepo, testCommit } from "@roka/git/testing";
import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";

Deno.test("testCommit() creates a commit with fake data", () => {
  const commit = testCommit();
  assert(commit.hash.length);
  assert(commit.short.length);
  assert(commit.summary.length);
  assert(commit.body?.length);
  assert(commit.trailers);
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

Deno.test("tempRepo() creates a repo", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commits.create("initial", { allowEmpty: true });
  assertEquals(await repo.commits.head(), commit);
});

Deno.test("tempRepo() can clone a repo from another repo", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  const commit = await repo.commits.create("initial", { allowEmpty: true });
  await repo.commits.push();
  assertEquals(await remote.commits.head(), commit);
});

Deno.test("tempRepo() can clone a repo from path", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote.path() });
  const commit = await repo.commits.create("initial", { allowEmpty: true });
  await repo.commits.push();
  assertEquals(await remote.commits.head(), commit);
});
