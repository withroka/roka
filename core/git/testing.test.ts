import {
  assertEquals,
  assertExists,
  assertGreater,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { toFileUrl } from "@std/path";
import { tempRepository, testCommit } from "./testing.ts";

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

Deno.test("tempRepository() creates a disposable repo", async () => {
  let path: string;
  {
    await using repo = await tempRepository();
    const commit = await repo.commit.create("initial", { allowEmpty: true });
    assertEquals(await repo.commit.head(), commit);
    path = repo.path();
  }
  await assertRejects(() => Deno.stat(path), Deno.errors.NotFound);
});

Deno.test("tempRepository({ branch }) sets default branch name", async () => {
  await using repo = await tempRepository({ branch: "branch" });
  assertEquals(await repo.branch.current(), { name: "branch" });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const branches = await repo.branch.list();
  assertEquals(branches, [{ name: "branch", commit }]);
});

Deno.test("tempRepository({ clone }) clones a repo from another repo", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.remote.push();
  assertEquals(await remote.commit.head(), commit);
});

Deno.test("tempRepository({ clone }) can clone a repo from path", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote.path() });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.remote.push();
  assertEquals(await remote.commit.head(), commit);
});

Deno.test("tempRepository({ clone }) can clone a repo from URL", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: toFileUrl(remote.path()) });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.remote.push();
  assertEquals(await remote.commit.head(), commit);
});

Deno.test("tempRepository({ chdir }) changes working directory", async () => {
  const cwd = Deno.cwd();
  {
    await using repo = await tempRepository({ chdir: true });
    assertEquals(
      await Deno.realPath(Deno.cwd()),
      await Deno.realPath(repo.path()),
    );
    await Deno.writeTextFile("test.txt", "Hello, world!");
    assertEquals(
      await Deno.readTextFile(repo.path("test.txt")),
      "Hello, world!",
    );
  }
  assertEquals(Deno.cwd(), cwd);
});

Deno.test("tempRepository({ chdir }) works recursively", async () => {
  const cwd = Deno.cwd();
  {
    await using outer = await tempRepository({ chdir: true });
    assertEquals(
      await Deno.realPath(Deno.cwd()),
      await Deno.realPath(outer.path()),
    );
    {
      await using inner = await tempRepository({ chdir: true });
      assertNotEquals(
        await Deno.realPath(inner.path()),
        await Deno.realPath(outer.path()),
      );
      assertEquals(
        await Deno.realPath(Deno.cwd()),
        await Deno.realPath(inner.path()),
      );
    }
    assertEquals(
      await Deno.realPath(Deno.cwd()),
      await Deno.realPath(outer.path()),
    );
  }
  assertEquals(Deno.cwd(), cwd);
});

Deno.test("tempRepository({ remote }) sets remote name", async () => {
  await using remote = await tempRepository({ bare: true });
  const url = toFileUrl(remote.path());
  await using repo = await tempRepository({ clone: remote, remote: "remote" });
  assertEquals(await repo.remote.get({ remote: "remote" }), {
    name: "remote",
    fetch: url,
    push: [url],
  });
});
