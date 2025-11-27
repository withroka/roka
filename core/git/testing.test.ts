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
  assertGreater(commit.author.name.length, 0);
  assertGreater(commit.author.email.length, 0);
  assertGreater(commit.committer.name.length, 0);
  assertGreater(commit.committer.email.length, 0);
  assertGreater(commit.subject.length, 0);
  assertGreater(commit.body?.length, 0);
  assertExists(commit.trailers);
});

Deno.test("testCommit() creates a commit with custom data", () => {
  const commit = testCommit({
    subject: "custom-subject",
    body: "custom-body",
    author: {
      name: "custom-author-name",
      email: "custom-author-email",
    },
  });
  assertEquals(commit.subject, "custom-subject");
  assertEquals(commit.body, "custom-body");
  assertEquals(commit.author.name, "custom-author-name");
  assertEquals(commit.author.email, "custom-author-email");
});

Deno.test("tempRepository() creates a disposable repo", async () => {
  let path: string;
  {
    await using repo = await tempRepository();
    const commit = await repo.commit.create({
      subject: "commit",
      allowEmpty: true,
    });
    assertEquals(await repo.commit.head(), commit);
    path = repo.path();
  }
  await assertRejects(() => Deno.stat(path), Deno.errors.NotFound);
});

Deno.test("tempRepository({ branch }) sets default branch name", async () => {
  await using repo = await tempRepository({ branch: "branch" });
  assertEquals(await repo.branch.current(), { name: "branch" });
  const commit = await repo.commit.create({
    subject: "commit",
    allowEmpty: true,
  });
  const branches = await repo.branch.list();
  assertEquals(branches, [{ name: "branch", commit }]);
});

Deno.test("tempRepository({ clone }) clones a repo from another repo", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  assertEquals(await repo.remote.current(), {
    name: "origin",
    fetch: toFileUrl(remote.path()),
    push: [toFileUrl(remote.path())],
  });
  const commit = await repo.commit.create({
    subject: "commit",
    allowEmpty: true,
  });
  await repo.sync.push();
  assertEquals(await remote.commit.head(), commit);
});

Deno.test("tempRepository({ clone }) can clone a repo from path", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote.path() });
  assertEquals(await repo.remote.current(), {
    name: "origin",
    fetch: toFileUrl(remote.path()),
    push: [toFileUrl(remote.path())],
  });
  const commit = await repo.commit.create({
    subject: "commit",
    allowEmpty: true,
  });
  await repo.sync.push();
  assertEquals(await remote.commit.head(), commit);
});

Deno.test("tempRepository({ clone }) can clone a repo from URL", async () => {
  await using remote = await tempRepository({ bare: true });
  const url = toFileUrl(remote.path());
  await using repo = await tempRepository({ clone: toFileUrl(remote.path()) });
  assertEquals(await repo.remote.current(), {
    name: "origin",
    fetch: url,
    push: [url],
  });
  const commit = await repo.commit.create({
    subject: "commit",
    allowEmpty: true,
  });
  await repo.sync.push();
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

Deno.test("tempRepository({ config }) sets repository config", async () => {
  await using repo = await tempRepository({
    config: { "user.name": "name", "user.email": "email" },
  });
  const commit = await repo.commit.create({
    subject: "commit",
    allowEmpty: true,
  });
  assertEquals(commit.author.name, "name");
  assertEquals(commit.author.email, "email");
});

Deno.test("tempRepository({ remote }) sets remote name", async () => {
  await using remote = await tempRepository({ bare: true });
  const url = toFileUrl(remote.path());
  await using repo = await tempRepository({ clone: remote, remote: "remote" });
  assertEquals(await repo.remote.get("remote"), {
    name: "remote",
    fetch: url,
    push: [url],
  });
});
