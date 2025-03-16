import { tempRepository, testCommit } from "@roka/git/testing";
import {
  assertEquals,
  assertExists,
  assertGreater,
  assertRejects,
} from "@std/assert";

Deno.test("testCommit() creates a commit with default data", () => {
  const commit = testCommit();
  assertGreater(commit.hash.length, 0);
  assertGreater(commit.short.length, 0);
  assertGreater(commit.summary.length, 0);
  assertGreater(commit.body?.length, 0);
  assertExists(commit.trailers);
  assertGreater(commit.author.name.length, 0);
  assertGreater(commit.author.email.length, 0);
  assertGreater(commit.committer.name.length, 0);
  assertGreater(commit.committer.email.length, 0);
});

Deno.test("testCommit() creates a commit with custom data", () => {
  const commit = testCommit({ summary: "custom-summary", body: "custom-body" });
  assertEquals(commit.summary, "custom-summary");
  assertEquals(commit.body, "custom-body");
});

Deno.test("tempRepo() creates a disposable repo", async () => {
  let path: string;
  {
    await using repo = await tempRepository();
    const commit = await repo.commits.create("initial", { allowEmpty: true });
    assertEquals(await repo.commits.head(), commit);
    path = repo.path();
  }
  await assertRejects(() => Deno.stat(path), Deno.errors.NotFound);
});

Deno.test("tempRepo() can clone a repo from another repo", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit = await repo.commits.create("initial", { allowEmpty: true });
  await repo.commits.push();
  assertEquals(await remote.commits.head(), commit);
});

Deno.test("tempRepo() can clone a repo from path", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote.path() });
  const commit = await repo.commits.create("initial", { allowEmpty: true });
  await repo.commits.push();
  assertEquals(await remote.commits.head(), commit);
});
