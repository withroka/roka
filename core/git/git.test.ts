import { tempDirectory } from "@roka/fs/temp";
import { tempRepository } from "@roka/git/testing";
import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { basename, resolve } from "@std/path";
import { git, GitError } from "./git.ts";

// some tests cannot check committer/tagger if Codespaces are signing with GPG
const codespaces = !!Deno.env.get("CODESPACES");

Deno.test("git() mentions failed command on error", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await assertRejects(
    () => repo.tag.create("no commit"),
    GitError,
    "Error running git command: tag",
  );
});

Deno.test("git() mentions permission on capability error", {
  permissions: { write: true, run: false },
}, async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await assertRejects(
    () => repo.tag.create("no commit"),
    GitError,
    "--allow-run=git",
  );
});

Deno.test("git() configures for each command", async () => {
  await using directory = await tempDirectory();
  const repo = git({
    cwd: directory.path(),
    config: {
      user: { name: "name", email: "email" },
      commit: { gpgsign: false },
      tag: { gpgsign: false },
      versionsort: { suffix: ["-alpha", "-beta", "-rc"] },
    },
  });
  await repo.init();
  await repo.commit.create("summary", { allowEmpty: true });
  await repo.tag.create("1.2.3");
  await repo.tag.create("1.2.3-alpha");
  await repo.tag.create("1.2.3-beta");
  await repo.tag.create("1.2.3-rc");
  assertEquals(
    (await repo.tag.list({ sort: "version" })).map((tag) => tag.name),
    ["1.2.3", "1.2.3-rc", "1.2.3-beta", "1.2.3-alpha"],
  );
});

Deno.test("git().path() is persistent with absolute path", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  assertEquals(repo.path(), directory.path());
  {
    await using _ = await tempDirectory({ chdir: true });
    assertEquals(resolve(repo.path()), directory.path());
  }
});

Deno.test("git().path() is persistent with relative path", async () => {
  await using directory = await tempDirectory({ chdir: true });
  const repo = git({ cwd: "." });
  assertEquals(
    await Deno.realPath(repo.path()),
    await Deno.realPath(directory.path()),
  );
  {
    await using _ = await tempDirectory({ chdir: true });
    assertEquals(
      await Deno.realPath(repo.path()),
      await Deno.realPath(directory.path()),
    );
  }
});

Deno.test("git().init() creates a repo", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  assertEquals(await repo.init(), repo);
  assertEquals((await Deno.stat(repo.path(".git"))).isDirectory, true);
});

Deno.test("git().init({ branch }) creates a repo with initial branch", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init({ branch: "branch" });
  assertEquals(await repo.branch.current(), { name: "branch" });
  await repo.init();
});

Deno.test("git().config.set() configures single values", async () => {
  await using repo = await tempRepository();
  await repo.config.set({ user: { name: "name", email: "email" } });
  const commit = await repo.commit.create("commit", {
    sign: false,
    allowEmpty: true,
  });
  assertEquals(commit?.author, { name: "name", email: "email" });
});

Deno.test("git().config.set() configures multi values", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("summary", { allowEmpty: true });
  await repo.tag.create("1.2.3");
  await repo.tag.create("1.2.3-alpha");
  await repo.tag.create("1.2.3-beta");
  await repo.tag.create("1.2.3-rc");
  await repo.config.set({
    versionsort: { suffix: ["-alpha", "-beta", "-rc"] },
  });
  assertEquals(
    (await repo.tag.list({ sort: "version" })).map((tag) => tag.name),
    ["1.2.3", "1.2.3-rc", "1.2.3-beta", "1.2.3-alpha"],
  );
});

Deno.test("git().remote.clone() clones a repo", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit1", { allowEmpty: true });
  await remote.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
  );
  assertEquals(repo.path(), directory.path(basename(remote.path())));
  assertEquals(await repo.commit.log(), await remote.commit.log());
});

Deno.test("git().remote.clone({ directory }) clones into specified directory", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit1", { allowEmpty: true });
  await remote.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { directory: "directory" },
  );
  assertEquals(repo.path(), directory.path("directory"));
  assertEquals(await repo.commit.log(), await remote.commit.log());
});

Deno.test("git().remote.clone({ directory }) rejects non-empty directory", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit1", { allowEmpty: true });
  await remote.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  await Deno.mkdir(directory.path("directory"));
  await Deno.writeTextFile(directory.path("directory/file.txt"), "content");
  await assertRejects(
    () =>
      git({ cwd: directory.path() }).remote.clone(remote.path(), {
        directory: "directory",
      }),
    GitError,
    "not an empty directory",
  );
});

Deno.test("git().remote.clone({ remote }) clones a repo with remote name", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { remote: "remote" },
  );
  assertEquals(await repo.commit.log(), await remote.commit.log());
});

Deno.test("git().remote.clone({ branch }) checks out a branch", async () => {
  await using remote = await tempRepository();
  const target = await remote.commit.create("commit1", { allowEmpty: true });
  await remote.commit.create("commit2", { allowEmpty: true });
  await remote.branch.checkout({ target, create: "branch" });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { branch: "branch" },
  );
  assertEquals(await repo.commit.log(), [target]);
});

Deno.test("git().remote.clone({ depth }) makes a shallow copy", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit1", { allowEmpty: true });
  await remote.commit.create("commit2", { allowEmpty: true });
  const third = await remote.commit.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { depth: 1, local: false },
  );
  assertEquals(await repo.commit.log(), [third]);
});

Deno.test("git().remote.clone({ depth }) can make a shallow copy of multiple branches", async () => {
  await using remote = await tempRepository();
  await remote.branch.checkout({ create: "branch1" });
  const first = await remote.commit.create("commit1", { allowEmpty: true });
  await remote.branch.checkout({ create: "branch2" });
  await remote.commit.create("commit2", { allowEmpty: true });
  const third = await remote.commit.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { branch: "branch1", depth: 1, local: false, singleBranch: false },
  );
  assertEquals(await repo.commit.log(), [first]);
  await repo.branch.checkout({ target: "branch2" });
  assertEquals(await repo.commit.log(), [third]);
});

Deno.test("git().remote.clone({ local }) is no-op for local remote", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", {
    allowEmpty: true,
  });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { local: true },
  );
  assertEquals(await repo.commit.log(), [commit]);
});

Deno.test("git().remote.clone({ singleBranch }) copies a single branch", async () => {
  await using remote = await tempRepository();
  await remote.branch.checkout({ create: "branch1" });
  const first = await remote.commit.create("commit1", { allowEmpty: true });
  const second = await remote.commit.create("commit2", { allowEmpty: true });
  await remote.branch.checkout({ create: "branch2" });
  await remote.commit.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remote.clone(
    remote.path(),
    { branch: "branch1", singleBranch: true },
  );
  assertEquals(await repo.commit.log(), [second, first]);
  await assertRejects(
    () => repo.branch.checkout({ target: "branch2" }),
    GitError,
  );
});

Deno.test("git().remote.get() returns remote URL", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  await repo.remote.add(other.path());
  const remote = await repo.remote.get();
  assertEquals(remote.pushUrl, other.path());
});

Deno.test("git().remote.get() returns remote URL by remote name", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  await repo.remote.add(other.path(), "upstream");
  const remote = await repo.remote.get("upstream");
  assertEquals(remote.pushUrl, other.path());
});

Deno.test("git().remote.get() rejects unknown remote", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.remote.get("unknown"), GitError);
});

Deno.test("git().remote.add() adds remote URL", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  const remote = await repo.remote.add(other.path());
  assertEquals(remote.fetchUrl, other.path());
  assertEquals(remote.pushUrl, other.path());
});

Deno.test("git().remote.add() cannot add to the same remote", async () => {
  await using remote = await tempRepository();
  await using repo = await tempRepository();
  await repo.remote.add(remote.path());
  await assertRejects(() => repo.remote.add(remote.path()), GitError);
});

Deno.test("git().remote.add() can add multiple remotes", async () => {
  await using other1 = await tempRepository();
  await using other2 = await tempRepository();
  await using repo = await tempRepository();
  const remote1 = await repo.remote.add(other1.path(), "remote1");
  const remote2 = await repo.remote.add(other2.path(), "remote2");
  assertEquals(await repo.remote.get("remote1"), remote1);
  assertEquals(await repo.remote.get("remote2"), remote2);
});

Deno.test("git().remote.remove() removes remote", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  await repo.remote.add(other.path());
  await repo.remote.remove();
  await assertRejects(() => repo.remote.get(), GitError);
});

Deno.test("git().remote.remove() can remove named remote", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  await repo.remote.add(other.path(), "upstream");
  await repo.remote.remove("upstream");
  await assertRejects(() => repo.remote.get("upstream"), GitError);
});

Deno.test("git().remote.remove() rejects unknown remote", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.remote.remove("unknown"), GitError);
});

Deno.test("git().remote.head() returns remote default branch", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit", { allowEmpty: true });
  const branch = await remote.branch.current();
  await using repo = await tempRepository({ clone: remote });
  assertEquals(await repo.remote.head(), branch.name);
});

Deno.test("git().remote.head() detects updated remote head", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.branch.checkout({ create: "branch" });
  assertEquals(await repo.remote.head(), "branch");
});

Deno.test("git().remote.head() detects detached remote head", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.branch.checkout({ detach: true });
  await remote.commit.create("commit", { allowEmpty: true });
  await assertRejects(
    () => repo.remote.head(),
    GitError,
    "Cannot determine remote HEAD branch",
  );
});

Deno.test("git().remote.pull() pulls commits and tags", async () => {
  await using remote = await tempRepository();
  await using repo = await tempRepository({ clone: remote });
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  const tag = await remote.tag.create("tag");
  await repo.remote.pull();
  assertEquals(await repo.commit.log(), [commit]);
  assertEquals(await repo.tag.list(), [tag]);
});

Deno.test("git().remote.pull() does not pull all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commit.create("commit", { allowEmpty: true });
  const tag1 = await other.tag.create("tag1");
  await other.remote.push();
  await other.tag.push(tag1);
  await other.branch.checkout({ create: "branch" });
  await other.commit.create("commit2", { allowEmpty: true });
  const tag2 = await other.tag.create("tag2");
  await other.tag.push(tag2);
  await repo.remote.pull();
  assertEquals(await repo.commit.log(), [commit]);
  assertEquals(await repo.tag.list(), [tag1]);
});

Deno.test("git().remote.pull({ target }) can pull commits from a branch", async () => {
  await using remote = await tempRepository();
  const main = await remote.branch.current();
  const commit1 = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.checkout({ create: "branch" });
  const commit2 = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.checkout({ target: main });
  await using repo = await tempRepository({ clone: remote });
  assertEquals(await repo.commit.log(), [commit1]);
  await repo.remote.pull({ target: "branch" });
  assertEquals(await repo.commit.log(), [commit2, commit1]);
});

Deno.test("git().remote.pull({ target }) can pull commits from a tag", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit1 = await other.commit.create("commit", { allowEmpty: true });
  const tag1 = await other.tag.create("tag1");
  await other.remote.push();
  await other.tag.push(tag1);
  await other.branch.checkout({ create: "branch" });
  const commit2 = await other.commit.create("commit2", { allowEmpty: true });
  const tag2 = await other.tag.create("tag2");
  await other.tag.push(tag2);
  await repo.remote.pull({ target: tag2 });
  assertEquals(await repo.commit.log(), [commit2, commit1]);
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().remote.pull({ remote }) pulls from a remote with branch", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", {
    allowEmpty: true,
  });
  const branch = await remote.branch.current();
  await using repo = await tempRepository();
  await repo.remote.add(remote.path(), "remote");
  await repo.remote.pull({ remote: "remote", target: branch });
  assertEquals(await repo.commit.log(), [commit]);
});

Deno.test("git().remote.pull({ tags }) can skip tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commit.create("commit", { allowEmpty: true });
  const tag = await other.tag.create("tag");
  await other.remote.push();
  await other.tag.push(tag);
  await repo.remote.pull({ tags: false });
  assertEquals(await repo.commit.log(), [commit]);
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().remote.pull({ tags }) can fetch all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commit.create("commit", { allowEmpty: true });
  const tag1 = await other.tag.create("tag1");
  await other.remote.push();
  await other.tag.push(tag1);
  await other.branch.checkout({ create: "branch" });
  await other.commit.create("commit2", { allowEmpty: true });
  const tag2 = await other.tag.create("tag2");
  await other.tag.push(tag2);
  await repo.remote.pull({ tags: true });
  assertEquals(await repo.commit.log(), [commit]);
  assertEquals(await repo.tag.list(), [tag1, tag2]);
});

Deno.test("git().remote.pull({ sign }) cannot use wrong key", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await assertRejects(() => repo.remote.pull({ sign: "not-a-key" }), GitError);
});

Deno.test("git().remote.push() pushes current branch to remote", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  await repo.remote.push();
  assertEquals(await remote.commit.log(), [commit2, commit1]);
});

Deno.test("git().remote.push() rejects unsynced push", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: remote });
  await using repo2 = await tempRepository({ clone: remote });
  await repo1.commit.create("commit1", { allowEmpty: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  await repo1.remote.push();
  await assertRejects(() => repo2.remote.push(), GitError);
});

Deno.test("git().remote.push({ target }) pushes commits to a remote branch", async () => {
  await using remote = await tempRepository();
  const commit1 = await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  const commit2 = await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await repo.remote.push({ target: branch });
  assertEquals(await repo.branch.list({ name: "branch" }), [
    { name: "branch", commit: commit2 },
  ]);
  assertEquals(await remote.branch.list({ name: "branch" }), [
    { name: "branch", commit: commit2 },
  ]);
  assertEquals(await remote.commit.log(), [commit1]);
  await remote.branch.checkout({ target: "branch" });
  assertEquals(await remote.commit.log(), [commit2, commit1]);
});

Deno.test("git().remote.push({ target }) rejects tags", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  await assertRejects(() => repo.remote.push({ target: tag }), GitError);
  await assertRejects(() => repo.remote.push({ target: "tag" }), GitError);
});

Deno.test("git().remote.push({ setUpstream }) sets upstream tracking", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await repo.remote.push({ target: branch, setUpstream: true });
  assertEquals(await repo.branch.list({ name: "branch" }), [
    {
      name: "branch",
      push: "origin/branch",
      upstream: "origin/branch",
      commit,
    },
  ]);
});

Deno.test("git().remote.push({ remote }) pushes commits to a remote with branch", async () => {
  await using remote = await tempRepository({ bare: true });
  const branch = await remote.branch.current();
  await using repo = await tempRepository();
  await repo.remote.add(remote.path(), "remote");
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.remote.push({ remote: "remote", target: branch });
  assertEquals(await remote.commit.log(), [commit]);
});

Deno.test("git().remote.push({ force }) force pushes", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: remote });
  await using repo2 = await tempRepository({ clone: remote });
  await repo1.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo2.commit.create("commit2", { allowEmpty: true });
  await repo1.remote.push();
  await repo2.remote.push({ force: true });
  assertEquals(await remote.commit.log(), [commit2]);
});

Deno.test("git().remote.push({ tags }) pushes all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await repo.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const tag2 = await repo.tag.create("tag2");
  await repo.remote.push({ tags: true });
  assertEquals(await remote.tag.list(), [tag1, tag2]);
});

Deno.test("git().remote.push({ branches }) pushes all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit1 = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch1");
  const commit2 = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch2");
  await repo.remote.push({ branches: true });
  assertEquals(await repo.branch.list({ name: "branch*" }), [
    { name: "branch1", commit: commit1 },
    { name: "branch2", commit: commit2 },
  ]);
  assertEquals(await remote.branch.list({ name: "branch*" }), [
    { name: "branch1", commit: commit1 },
    { name: "branch2", commit: commit2 },
  ]);
});

Deno.test("git().branch.current() returns current branch", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.checkout({ create: "branch" });
  assertEquals(await repo.branch.current(), { name: "branch", commit });
});

Deno.test("git().branch.current() can return unborn branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  assertEquals(await repo.branch.current(), { name: "main" });
});

Deno.test("git().branch.current() rejects on detached state", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.checkout({ detach: true });
  await assertRejects(
    () => repo.branch.current(),
    GitError,
    "Cannot determine HEAD branch",
  );
});

Deno.test("git().branch.list() returns all branches", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  let main = await repo.branch.current();
  assertEquals(await repo.branch.list(), [main]);
  const branch = await repo.branch.create("branch");
  await repo.commit.create("commit2", { allowEmpty: true });
  main = await repo.branch.current();
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.list() returns all branches in detached HEAD", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  await repo.branch.checkout({ detach: true });
  const branch = await repo.branch.create("branch");
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.list({ name }) matches branch name", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch1");
  await repo.branch.create("branch2");
  assertEquals(await repo.branch.list({ name: "branch2" }), [
    { name: "branch2", commit },
  ]);
});

Deno.test("git().branch.list({ name }) can match branch pattern", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch1");
  await repo.branch.create("branch2");
  assertEquals(await repo.branch.list({ name: "branch*" }), [
    { name: "branch1", commit },
    { name: "branch2", commit },
  ]);
});

Deno.test("git().branch.list({ all }) returns all branches", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("remote");
  await using repo = await tempRepository({ clone: remote });
  await repo.branch.create("local");
  assertEquals(await repo.branch.list({ all: true }), [
    { name: "local", commit },
    { name: "main", push: "origin/main", upstream: "origin/main", commit },
    { name: "origin", commit },
    { name: "origin/main", commit },
    { name: "origin/remote", commit },
  ]);
});

Deno.test("git().branch.list({ remotes }) returns only remote branches", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("remote");
  await using repo = await tempRepository({ clone: remote });
  await repo.branch.create("local");
  assertEquals(await repo.branch.list({ remotes: true }), [
    { name: "origin", commit },
    { name: "origin/main", commit },
    { name: "origin/remote", commit },
  ]);
});

Deno.test("git().branch.list({ contains }) returns branches that contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branch.create("branch1");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const branch2 = await repo.branch.create("branch2");
  const main = await repo.branch.current();
  assertEquals(await repo.branch.list({ contains: commit1 }), [
    branch1,
    branch2,
    main,
  ]);
  assertEquals(await repo.branch.list({ contains: commit2 }), [
    branch2,
    main,
  ]);
});

Deno.test("git().branch.list({ noContains }) returns branches that do not contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branch.create("branch1");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  await repo.branch.create("branch2");
  await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(await repo.branch.list({ noContains: commit1 }), []);
  assertEquals(await repo.branch.list({ noContains: commit2 }), [branch1]);
});

Deno.test("git().branch.list({ pointsAt }) returns branches that point to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branch.create("branch1");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const branch2 = await repo.branch.create("branch2");
  await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(await repo.branch.list({ pointsAt: commit1 }), [branch1]);
  assertEquals(await repo.branch.list({ pointsAt: commit2 }), [branch2]);
});

Deno.test("git().branch.checkout() stays at current branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.current();
  assertEquals(await repo.branch.checkout(), branch);
  assertEquals(await repo.branch.current(), branch);
});

Deno.test("git().branch.checkout({ target }) can switch to branch", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const main = await repo.branch.current();
  await repo.branch.checkout({ create: "branch" });
  assertEquals(await repo.branch.current(), {
    name: "branch",
    commit: commit1,
  });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.branch.current(), {
    name: "branch",
    commit: commit2,
  });
  assertEquals(await repo.commit.log(), [commit2, commit1]);
  await repo.branch.checkout({ target: main });
  assertEquals(await repo.branch.current(), main);
  assertEquals(await repo.commit.log(), [commit1]);
  await repo.branch.checkout({ target: "branch" });
  assertEquals(
    await repo.branch.current(),
    { name: "branch", commit: commit2 },
  );
  assertEquals(await repo.commit.log(), [commit2, commit1]);
});

Deno.test("git().branch.checkout({ target }) can switch to commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  assertEquals(await repo.branch.checkout({ target: commit1 }), undefined);
  await assertRejects(() => repo.branch.current());
  assertEquals(await repo.commit.log(), [commit1]);
  await repo.branch.checkout({ create: "branch" });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  await repo.branch.checkout({ target: commit1 });
  await assertRejects(() => repo.branch.current());
  assertEquals(await repo.commit.log(), [commit1]);
  await repo.branch.checkout({ target: commit2 });
  await assertRejects(() => repo.branch.current());
  assertEquals(await repo.commit.log(), [commit2, commit1]);
});

Deno.test("git().branch.checkout({ target }) can detach", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  assertEquals(await repo.branch.checkout({ target: commit }), undefined);
  await assertRejects(() => repo.branch.current());
});

Deno.test("git().branch.checkout({ create }) creates a branch", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.checkout({ create: "branch" });
  assertEquals(branch, { name: "branch", commit });
  assertEquals(await repo.branch.current(), branch);
});

Deno.test("git().branch.checkout({ create }) can create a branch with tracking", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: false } },
  });
  assertEquals(
    await repo.branch.checkout({ create: "branch1", target: "origin/target" }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branch.checkout({
      create: "branch2",
      target: "origin/target",
      track: true,
    }),
    { name: "branch2", upstream: "origin/target", commit },
  );
});

Deno.test("git().branch.checkout({ track }) can disable tracking", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: "always" } },
  });
  assertEquals(
    await repo.branch.checkout({ create: "branch1", target: "origin/target" }),
    { name: "branch1", upstream: "origin/target", commit },
  );
  assertEquals(
    await repo.branch.checkout({
      create: "branch2",
      target: "origin/target",
      track: false,
    }),
    { name: "branch2", commit },
  );
});

Deno.test("git().branch.checkout({ track }) can inherit source upstream", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  const main = await repo.branch.current();
  const branch = await repo.branch.checkout({
    create: "branch",
    track: "inherit",
  });
  assertEquals(branch, { name: "branch", upstream: "origin/main", commit });
  assertEquals(await repo.branch.current(), branch);
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.create() creates a branch", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch");
  assertEquals(branch, { name: "branch", commit });
  assertNotEquals(await repo.branch.current(), branch);
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.create({ target }) creates a branch at target", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({ clone: remote });
  assertEquals(
    await repo.branch.create("branch1", { target: commit }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branch.create("branch2", { target: "origin/target" }),
    { name: "branch2", upstream: "origin/target", commit },
  );
});

Deno.test("git().branch.create({ track }) creates a branch with upstream", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: false } },
  });
  assertEquals(
    await repo.branch.create("branch1", { target: "origin/target" }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branch.create("branch2", {
      target: "origin/target",
      track: true,
    }),
    { name: "branch2", upstream: "origin/target", commit },
  );
});

Deno.test("git().branch.create({ track }) can disable tracking", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: "always" } },
  });
  assertEquals(
    await repo.branch.create("branch1", { target: "origin/target" }),
    { name: "branch1", upstream: "origin/target", commit },
  );
  assertEquals(
    await repo.branch.create("branch2", {
      target: "origin/target",
      track: false,
    }),
    { name: "branch2", commit },
  );
});

Deno.test("git().branch.create({ track }) can inherit source upstream", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch", { track: "inherit" });
  assertEquals(branch, { name: "branch", upstream: "origin/main", commit });
  assertNotEquals(await repo.branch.current(), branch);
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.move() renames a branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch");
  assertEquals(await repo.branch.list(), [branch, main]);
  const renamed = await repo.branch.move(branch, "renamed");
  assertEquals(await repo.branch.list(), [main, renamed]);
});

Deno.test("git().branch.move() can rename current branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const renamed = await repo.branch.move(main, "renamed");
  assertEquals(await repo.branch.list(), [renamed]);
  assertEquals(await repo.branch.current(), renamed);
});

Deno.test("git().branch.move() rejects overriding existing branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch");
  await assertRejects(
    () => repo.branch.move(main, "branch"),
    GitError,
    "a branch named 'branch' already exists",
  );
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.move({ force }) can override existing branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  let branch = await repo.branch.create("branch");
  assertEquals(await repo.branch.list(), [branch, main]);
  branch = await repo.branch.move(main, "branch", { force: true });
  assertEquals(await repo.branch.list(), [branch]);
  assertEquals(await repo.branch.current(), branch);
});

Deno.test("git().branch.copy() copies a branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch");
  assertEquals(await repo.branch.list(), [branch, main]);
  const copy = await repo.branch.copy(branch, "copy");
  assertEquals(await repo.branch.list(), [branch, copy, main]);
});

Deno.test("git().branch.copy() can copy current branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const copy = await repo.branch.copy(main, "copy");
  assertEquals(await repo.branch.list(), [copy, main]);
  assertEquals(await repo.branch.current(), main);
});

Deno.test("git().branch.copy() rejects overriding existing branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch");
  await assertRejects(
    () => repo.branch.copy(main, "branch"),
    GitError,
    "a branch named 'branch' already exists",
  );
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.copy({ force }) can override existing branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  let branch = await repo.branch.create("branch");
  assertEquals(await repo.branch.list(), [branch, main]);
  branch = await repo.branch.copy(main, "branch", { force: true });
  assertEquals(await repo.branch.list(), [branch, main]);
  assertEquals(await repo.branch.current(), main);
});

Deno.test("git().branch.delete() rejects current branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const current = await repo.branch.current();
  await assertRejects(() => repo.branch.delete(current), GitError);
});

Deno.test("git().branch.delete() can delete branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const current = await repo.branch.current();
  await repo.branch.checkout({ detach: true });
  await repo.branch.delete(current);
  assertEquals(await repo.branch.list(), []);
});

Deno.test("git().branch.delete() can delete branch by name", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.create("branch");
  assertEquals(await repo.branch.list(), [branch, main]);
  await repo.branch.delete("branch");
  assertEquals(await repo.branch.list(), [main]);
});

Deno.test("git().branch.delete() rejects unmerged branch", async () => {
  await using repo = await tempRepository();
  const main = await repo.branch.current();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch");
  await repo.branch.checkout({ target: "branch" });
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.checkout({ target: main });
  await assertRejects(() => repo.branch.delete("branch"), GitError);
});

Deno.test("git().branch.delete({ force }) can delete unmerged branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  await repo.branch.create("branch");
  await repo.branch.checkout({ target: "branch" });
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.checkout({ target: main });
  await repo.branch.delete("branch", { force: true });
  assertEquals(await repo.branch.list(), [main]);
});

Deno.test("git().branch.track() sets upstream branch", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({ clone: remote });
  const branch = await repo.branch.create("branch");
  await repo.branch.track(branch, "origin/target");
  assertEquals(await repo.branch.list({ name: "branch" }), [
    { name: "branch", upstream: "origin/target", commit },
  ]);
});

Deno.test("git().branch.untrack() unsets upstream branch", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commit.create("commit", { allowEmpty: true });
  await remote.branch.create("target");
  await using repo = await tempRepository({ clone: remote });
  const branch = await repo.branch.create("branch", {
    target: "origin/target",
  });
  assertEquals(await repo.branch.list({ name: "branch" }), [
    { name: "branch", upstream: "origin/target", commit },
  ]);
  await repo.branch.untrack(branch);
  assertEquals(await repo.branch.list({ name: "branch" }), [
    { name: "branch", commit },
  ]);
});

Deno.test("git().index.status() lists staged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await repo.index.add("file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "modified" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists staged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: false });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  await repo.index.add("file", { executable: true });
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "modified" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists staged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  await repo.index.add("file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "type-changed" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists staged added file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "added" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists staged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await repo.index.remove("file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "deleted" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists staged renamed file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "new.file", status: "renamed", from: "old.file" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists staged copied file", async () => {
  await using repo = await tempRepository({
    config: { status: { renames: "copies" } },
  });
  await Deno.writeTextFile(repo.path("source.file"), "content");
  await repo.index.add("source.file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "new content");
  await Deno.writeTextFile(repo.path("copied.file"), "content");
  await repo.index.add(["source.file", "copied.file"]);
  assertEquals(await repo.index.status(), {
    staged: [
      { path: "copied.file", status: "copied", from: "source.file" },
      { path: "source.file", status: "modified" },
    ],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists unstaged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file", status: "modified" }],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists unstaged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: false });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file", status: "modified" }],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists unstaged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file", status: "type-changed" }],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists unstaged added file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "added" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists unstaged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file", status: "deleted" }],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() can list staged and unstaged changes to the same file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "new content");
  await repo.index.add("file");
  await Deno.remove(repo.path("file"));
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "modified" }],
    unstaged: [{ path: "file", status: "deleted" }],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() can list staged and untracked changes to the same file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await repo.index.remove("file");
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "deleted" }],
    unstaged: [],
    untracked: [{ path: "file" }],
    ignored: [],
  });
});

Deno.test("git().index.status() can list staged and ignored changes to the same file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { force: true });
  await repo.commit.create("commit");
  await repo.index.remove("file");
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status({ ignored: true }), {
    staged: [{ path: "file", status: "deleted" }],
    unstaged: [],
    untracked: [],
    ignored: [{ path: "file" }],
  });
});

Deno.test("git().index.status({ renames }) can ignore renames", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(
    await repo.index.status({ renames: true }),
    {
      staged: [
        { from: "old.file", path: "new.file", status: "renamed" },
      ],
      unstaged: [],
      untracked: [],
      ignored: [],
    },
  );
  assertEquals(await repo.index.status({ renames: false }), {
    staged: [
      { path: "new.file", status: "added" },
      { path: "old.file", status: "deleted" },
    ],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status({ untracked }) can skip untracked files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "file" }],
    ignored: [],
  });
  assertEquals(await repo.index.status({ untracked: false }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status({ untracked }) can list files under untracked directories", async () => {
  await using repo = await tempRepository();
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "directory/" }],
    ignored: [],
  });
  assertEquals(await repo.index.status({ untracked: "all" }), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "directory/file" }],
    ignored: [],
  });
});

Deno.test("git().index.status({ ignored }) lists ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await repo.index.status({ ignored: true }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [{ path: "file" }],
  });
});

Deno.test("git().index.status({ ignored }) can list ignored directories", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "directory/");
  await repo.index.add(".gitignore");
  await repo.commit.create("commit");
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await repo.index.status({ ignored: true }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [{ path: "directory/" }],
  });
});

Deno.test("git().index.status({ path }) can filter by path", async () => {
  await using repo = await tempRepository();
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  await repo.index.add("directory/file");
  const expected = {
    staged: [{ path: "directory/file", status: "added" as const }],
    unstaged: [],
    untracked: [],
    ignored: [],
  };
  assertEquals(await repo.index.status({ path: "directory" }), expected);
  assertEquals(await repo.index.status({ path: "directory/" }), expected);
  assertEquals(await repo.index.status({ path: "directory/*" }), expected);
  assertEquals(await repo.index.status({ path: "directory/file" }), expected);
  assertEquals(await repo.index.status({ path: ["directory/file"] }), expected);
  assertEquals(await repo.index.status({ path: "*/file" }), expected);
  assertEquals(await repo.index.status({ path: ["other", "dir*"] }), expected);
  assertEquals(await repo.index.status({ path: "other" }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.add() adds files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  assertEquals((await repo.index.status()).staged, [
    { path: "file", status: "added" },
  ]);
});

Deno.test("git().index.add() rejects non-existent file", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.index.add("file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.add() rejects ignored file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await repo.commit.create("commit");
  await assertRejects(() => repo.index.add("file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.add({ executable }) can add file as executable", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  let stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o111, 0o000);
  await repo.index.add("file", { executable: true });
  const commit = await repo.commit.create("commit");
  await repo.index.remove("file", { force: true });
  await repo.commit.create("commit");
  await repo.branch.checkout({ target: commit });
  stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o110, 0o110);
});

Deno.test("git().index.add({ executable }) can add file as non-executable", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await Deno.chmod(repo.path("file"), 0o755);
  await repo.index.add("file", { executable: false });
  const commit = await repo.commit.create("commit");
  await repo.index.remove("file", { force: true });
  await repo.commit.create("commit");
  await repo.branch.checkout({ target: commit });
  const stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o111, 0o000);
});

Deno.test("git().index.add({ force }) can add ignored file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await repo.commit.create("commit");
  await repo.index.add("file", { force: true });
  assertEquals((await repo.index.status()).staged, [
    { path: "file", status: "added" },
  ]);
});

Deno.test("git().index.move() moves files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals((await repo.index.status()).staged, [
    { path: "new.file", status: "renamed", from: "old.file" },
  ]);
});

Deno.test("git().index.move() can move multiple files into a directory", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await Deno.mkdir(repo.path("directory"));
  await repo.index.add(["file1", "file2"]);
  await repo.commit.create("commit");
  await repo.index.move(["file1", "file2"], "directory");
  assertEquals((await repo.index.status()).staged, [
    { path: "directory/file1", status: "renamed", from: "file1" },
    { path: "directory/file2", status: "renamed", from: "file2" },
  ]);
});

Deno.test("git().index.move() rejects missing destination if moving multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add(["file1", "file2"]);
  await repo.commit.create("commit");
  await assertRejects(
    () => repo.index.move(["file1", "file2"], "directory"),
    GitError,
    "not a directory",
  );
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move() rejects non-existent source file", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.index.move("old.file", "new.file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move() rejects untracked source file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await assertRejects(() => repo.index.move("old.file", "new.file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move() rejects existing destination file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await Deno.writeTextFile(repo.path("new.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await assertRejects(() => repo.index.move("old.file", "new.file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move({ force }) can overwrite existing destination file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file", { force: true });
  assertEquals((await repo.index.status()).staged, [
    { path: "new.file", status: "renamed", from: "old.file" },
  ]);
});

Deno.test("git().index.remove() removes files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await repo.index.remove("file");
  assertEquals((await repo.index.status()).staged, [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().index.remove() rejects non-existent file", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.index.remove("file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.remove() rejects modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await assertRejects(() => repo.index.remove("file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.remove({ force }) can remove modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await repo.index.remove("file", { force: true });
  assertEquals((await repo.index.status()).staged, [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().diff.status() returns empty for no change", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() lists unstaged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "modified" },
  ]);
});

Deno.test("git().diff.status() does not list staged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() lists unstaged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "modified" },
  ]);
});

Deno.test("git().diff.status() lists unstaged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "type-changed" },
  ]);
});

Deno.test("git().diff.status() does not list staged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: false });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  await repo.index.add("file", { executable: true });
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() does not list staged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  await repo.index.add("file");
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() does not list untracked file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() lists unstaged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().diff.status() does not list staged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await repo.index.remove("file");
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status({ path }) filters by path", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add(["file1", "file2"]);
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file1"), "modified content");
  await Deno.writeTextFile(repo.path("file2"), "modified content");
  assertEquals(await repo.diff.status({ path: "file1" }), [
    { path: "file1", status: "modified" },
  ]);
  assertEquals(await repo.diff.status({ path: "file2" }), [
    { path: "file2", status: "modified" },
  ]);
  assertEquals(await repo.diff.status({ path: ["file1", "file2"] }), [
    { path: "file1", status: "modified" },
    { path: "file2", status: "modified" },
  ]);
  assertEquals(await repo.diff.status({ path: ["."] }), [
    { path: "file1", status: "modified" },
    { path: "file2", status: "modified" },
  ]);
  assertEquals(await repo.diff.status({ path: "nonexistent" }), []);
});

Deno.test("git().diff.status({ staged }) lists staged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await repo.index.add("file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "file", status: "modified" },
  ]);
});

Deno.test("git().diff.status({ staged }) does not list unstaged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) lists staged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: false });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  await repo.index.add("file", { executable: true });
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "file", status: "modified" },
  ]);
});

Deno.test("git().diff.status({ staged }) lists staged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  await repo.index.add("file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "file", status: "type-changed" },
  ]);
});

Deno.test("git().diff.status({ staged }) does not list unstaged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: false });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) does not list unstaged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) lists staged added file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "file", status: "added" },
  ]);
});

Deno.test("git().diff.status({ staged }) does not list untracked file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) lists staged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await repo.index.remove("file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().diff.status({ staged }) does not list unstaged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) lists renamed file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "new.file", status: "renamed", from: "old.file" },
  ]);
});

Deno.test("git().diff.status({ target }) lists files modified since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("committed"), "content");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await Deno.writeTextFile(repo.path("unstaged"), "content");
  await repo.index.add(["committed", "staged", "unstaged"]);
  const commit = await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("committed"), "modified content");
  await repo.index.add("committed");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("staged"), "modified content");
  await repo.index.add("staged");
  await Deno.writeTextFile(repo.path("unstaged"), "modified content");
  assertEquals(await repo.diff.status({ target: commit }), [
    { path: "committed", status: "modified" },
    { path: "staged", status: "modified" },
    { path: "unstaged", status: "modified" },
  ]);
});

Deno.test("git().diff.status({ target }) lists files with mode change since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("committed"), "content");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await Deno.writeTextFile(repo.path("unstaged"), "content");
  await repo.index.add(["committed", "staged", "unstaged"]);
  const commit = await repo.commit.create("commit");
  await Deno.chmod(repo.path("committed"), 0o755);
  await repo.index.add("committed", { executable: true });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("staged"), 0o755);
  await repo.index.add("staged", { executable: true });
  await Deno.chmod(repo.path("unstaged"), 0o755);
  assertEquals(await repo.diff.status({ target: commit }), [
    { path: "committed", status: "modified" },
    { path: "staged", status: "modified" },
    { path: "unstaged", status: "modified" },
  ]);
});

Deno.test("git().diff.status({ target }) lists files with type change since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("committed"), "content");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await Deno.writeTextFile(repo.path("unstaged"), "content");
  await repo.index.add(["committed", "staged", "unstaged"]);
  const commit = await repo.commit.create("commit");
  await Deno.remove(repo.path("committed"));
  await Deno.symlink("target", repo.path("committed"));
  await repo.index.add("committed");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("staged"));
  await Deno.symlink("target", repo.path("staged"));
  await repo.index.add("staged");
  await Deno.remove(repo.path("unstaged"));
  await Deno.symlink("target", repo.path("unstaged"));
  assertEquals(await repo.diff.status({ target: commit }), [
    { path: "committed", status: "type-changed" },
    { path: "staged", status: "type-changed" },
    { path: "unstaged", status: "type-changed" },
  ]);
});

Deno.test("git().diff.status({ target }) lists added files since commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("committed"), "content");
  await repo.index.add("committed");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await repo.index.add("staged");
  assertEquals(await repo.diff.status({ target: commit }), [
    { path: "committed", status: "added" },
    { path: "staged", status: "added" },
  ]);
});

Deno.test("git().diff.status({ target }) does not list untracked files", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.diff.status({ target: commit }), []);
});

Deno.test("git().diff.status({ target }) lists deleted files since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("committed"), "content");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await Deno.writeTextFile(repo.path("unstaged"), "content");
  await repo.index.add(["committed", "staged", "unstaged"]);
  const commit = await repo.commit.create("commit");
  await repo.index.remove("committed");
  await repo.commit.create("commit");
  await repo.index.remove("staged");
  await Deno.remove(repo.path("unstaged"));
  assertEquals(await repo.diff.status({ target: commit }), [
    { path: "committed", status: "deleted" },
    { path: "staged", status: "deleted" },
    { path: "unstaged", status: "deleted" },
  ]);
});

Deno.test("git().diff.status({ target }) lists renamed files since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("old.committed.file"),
    "committed content",
  );
  await Deno.writeTextFile(repo.path("old.staged.file"), "staged content");
  await repo.index.add(["old.committed.file", "old.staged.file"]);
  const commit = await repo.commit.create("commit");
  await repo.index.move("old.committed.file", "new.committed.file");
  await repo.commit.create("commit");
  await repo.index.move("old.staged.file", "new.staged.file");
  assertEquals(await repo.diff.status({ target: commit }), [
    {
      path: "new.committed.file",
      status: "renamed",
      from: "old.committed.file",
    },
    { path: "new.staged.file", status: "renamed", from: "old.staged.file" },
  ]);
});

Deno.test("git().diff.status({ range }) lists files changed in range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit2 = await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "new content");
  await repo.index.add("file");
  const commit3 = await repo.commit.create("commit");
  await repo.index.remove("file");
  const commit4 = await repo.commit.create("commit");
  assertEquals(
    await repo.diff.status({ range: { from: commit1, to: commit2 } }),
    [{ path: "file", status: "added" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit2, to: commit1 } }),
    [{ path: "file", status: "deleted" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit2, to: commit3 } }),
    [{ path: "file", status: "modified" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit3, to: commit2 } }),
    [{ path: "file", status: "modified" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit3 } }),
    [{ path: "file", status: "deleted" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit3, to: commit4 } }),
    [{ path: "file", status: "deleted" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit2, to: commit4 } }),
    [{ path: "file", status: "deleted" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit4, to: commit2 } }),
    [{ path: "file", status: "added" }],
  );
  assertEquals(
    await repo.diff.status({ range: { from: commit1, to: commit4 } }),
    [],
  );
});

Deno.test("git().diff.status({ renames }) can ignore renames", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.diff.status({ staged: true, renames: true }), [
    { path: "new.file", status: "renamed", from: "old.file" },
  ]);
  assertEquals(await repo.diff.status({ staged: true, renames: false }), [
    { path: "new.file", status: "added" },
    { path: "old.file", status: "deleted" },
  ]);
});

Deno.test("git().diff.status({ copies }) can detect copies", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("source.file"), "content");
  await repo.index.add("source.file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "new content");
  await Deno.writeTextFile(repo.path("copied.file"), "content");
  await repo.index.add(["source.file", "copied.file"]);
  assertEquals(await repo.diff.status({ staged: true, copies: true }), [
    { path: "copied.file", status: "copied", from: "source.file" },
    { path: "source.file", status: "modified" },
  ]);
});

Deno.test("git().diff.patch() generates empty patch for no changes", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.diff.patch(), []);
});

Deno.test("git().diff.patch() generates patch", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("file"),
    [
      "header",
      "old content",
    ].join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    [
      "header",
      "new content",
      "",
    ].join("\n"),
  );
  assertEquals(await repo.diff.patch(), [
    {
      path: "file",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "context", content: "header" },
            { type: "deleted", content: "old content" },
            { type: "info", content: "No newline at end of file" },
            { type: "added", content: "new content" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for file with whitespace in name", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file with spaces"), "old content\n");
  await repo.index.add("file with spaces");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file with spaces"), "new content\n");
  assertEquals(await repo.diff.patch(), [
    {
      path: "file with spaces",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "deleted", content: "old content" },
            { type: "added", content: "new content" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch with multiple hunks", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "old content1", "\n".repeat(10), "old content2", "footer", ""]
      .join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "new content1", "\n".repeat(10), "new content2", "footer", ""]
      .join("\n"),
  );
  assertEquals(await repo.diff.patch(), [
    {
      path: "file",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "context", content: "header" },
            { type: "deleted", content: "old content1" },
            { type: "added", content: "new content1" },
            { type: "context", content: "" },
            { type: "context", content: "" },
            { type: "context", content: "" },
          ],
        },
        {
          line: { old: 11, new: 11 },
          lines: [
            { type: "context", content: "" },
            { type: "context", content: "" },
            { type: "context", content: "" },
            { type: "deleted", content: "old content2" },
            { type: "added", content: "new content2" },
            { type: "context", content: "footer" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), ["old content1", ""].join("\n"));
  await Deno.writeTextFile(repo.path("file2"), ["old content2", ""].join("\n"));
  await repo.index.add(["file1", "file2"]);
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file1"), ["new content1", ""].join("\n"));
  await Deno.writeTextFile(repo.path("file2"), ["new content2", ""].join("\n"));
  assertEquals(await repo.diff.patch(), [
    {
      path: "file1",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "deleted", content: "old content1" },
            { type: "added", content: "new content1" },
          ],
        },
      ],
    },
    {
      path: "file2",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "deleted", content: "old content2" },
            { type: "added", content: "new content2" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for added file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content\n");
  await repo.index.add("file");
  assertEquals(await repo.diff.patch({ staged: true }), [
    {
      path: "file",
      status: "added",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 0, new: 1 },
          lines: [
            { type: "added", content: "content" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() does not generate patch for file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content\n");
  await repo.index.add("file", { executable: false });
  await repo.commit.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  await Deno.writeTextFile(repo.path("file"), "content\n");
  await repo.index.add("file", { executable: true });
  assertEquals(await repo.diff.patch({ staged: true }), [
    {
      path: "file",
      status: "modified",
      mode: { old: 0o100644, new: 0o100755 },
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content\n");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  await Deno.symlink("target", repo.path("file"));
  assertEquals(await repo.diff.patch(), [
    {
      path: "file",
      status: "deleted",
      mode: { old: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 0 },
          lines: [{ type: "deleted", content: "content" }],
        },
      ],
    },
    {
      path: "file",
      status: "added",
      mode: { new: 0o120000 },
      hunks: [
        {
          line: { old: 0, new: 1 },
          lines: [
            { type: "added", content: "target" },
            { type: "info", content: "No newline at end of file" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content\n");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await repo.index.remove("file");
  assertEquals(await repo.diff.patch({ staged: true }), [
    {
      path: "file",
      status: "deleted",
      mode: { old: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 0 },
          lines: [
            { type: "deleted", content: "content" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generate patch for renamed file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content\n");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.diff.patch({ staged: true }), [
    {
      path: "new.file",
      status: "renamed",
      from: { path: "old.file", similarity: 1 },
    },
  ]);
});

Deno.test("git().diff.patch({ range }) generates patch for range", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "old content", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  const commit1 = await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "new content", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  const commit2 = await repo.commit.create("commit");
  assertEquals(
    await repo.diff.patch({ range: { from: commit1, to: commit2 } }),
    [
      {
        path: "file",
        status: "modified",
        mode: { new: 0o100644 },
        hunks: [
          {
            line: { old: 1, new: 1 },
            lines: [
              { type: "context", content: "header" },
              { type: "deleted", content: "old content" },
              { type: "added", content: "new content" },
              { type: "context", content: "footer" },
            ],
          },
        ],
      },
    ],
  );
});

Deno.test("git().diff.patch({ renames }) can ignore renames", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content\n");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.diff.patch({ staged: true, renames: true }), [
    {
      path: "new.file",
      status: "renamed",
      from: { path: "old.file", similarity: 1 },
    },
  ]);
  assertEquals(
    await repo.diff.patch({ staged: true, renames: false }),
    [
      {
        path: "new.file",
        status: "added",
        mode: { new: 0o100644 },
        hunks: [
          {
            line: { old: 0, new: 1 },
            lines: [
              { type: "added", content: "content" },
            ],
          },
        ],
      },
      {
        path: "old.file",
        status: "deleted",
        mode: { old: 0o100644 },
        hunks: [
          {
            line: { old: 1, new: 0 },
            lines: [
              { type: "deleted", content: "content" },
            ],
          },
        ],
      },
    ],
  );
});

Deno.test("git().diff.patch({ copies }) can detect copies", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("source.file"), "content\n");
  await repo.index.add("source.file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "new content\n");
  await Deno.writeTextFile(repo.path("copied.file"), "content\n");
  await repo.index.add(["source.file", "copied.file"]);
  assertEquals(
    await repo.diff.patch({ staged: true, copies: false }),
    [
      {
        path: "copied.file",
        status: "added",
        mode: { new: 0o100644 },
        hunks: [
          {
            line: { old: 0, new: 1 },
            lines: [
              { type: "added", content: "content" },
            ],
          },
        ],
      },
      {
        path: "source.file",
        status: "modified",
        mode: { new: 0o100644 },
        hunks: [
          {
            line: { old: 1, new: 1 },
            lines: [
              { type: "deleted", content: "content" },
              { type: "added", content: "new content" },
            ],
          },
        ],
      },
    ],
  );
  assertEquals(
    await repo.diff.patch({ staged: true, copies: true }),
    [
      {
        path: "copied.file",
        status: "copied",
        from: { path: "source.file", similarity: 1 },
      },
      {
        path: "source.file",
        status: "modified",
        mode: { new: 0o100644 },
        hunks: [
          {
            line: { old: 1, new: 1 },
            lines: [
              { type: "deleted", content: "content" },
              { type: "added", content: "new content" },
            ],
          },
        ],
      },
    ],
  );
});

Deno.test("git().diff.patch({ algorithm }) controls the diff algorithm", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("file"),
    [
      "function foo() {",
      '  console.log("foo");',
      '  console.log("foo");',
      '  console.log("foo");',
      '  console.log("foo");',
      "}",
      "",
      "function bar() {",
      '  console.log("bar");',
      "}",
      "",
      "function baz() {",
      '  console.log("baz");',
      "}",
    ].join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    [
      "function bar() {",
      '  console.log("bar");',
      "}",
      "",
      "function foo() {",
      '  console.log("foo");',
      '  console.log("foo");',
      '  console.log("foo");',
      '  console.log("foo");',
      "}",
      "",
      "function baz() {",
      '  console.log("baz");',
      "}",
    ].join("\n"),
  );
  const [myersPatch, patiencePatch] = await Promise.all([
    repo.diff.patch({ algorithm: "myers" }),
    repo.diff.patch({ algorithm: "patience" }),
  ]);
  assertEquals(myersPatch.map((x) => x.hunks?.length), [2]);
  assertEquals(patiencePatch.map((x) => x.hunks?.length), [1]);
});

Deno.test("git().diff.patch({ unified }) controls the number of context lines", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "old content", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "new content", "footer", ""].join("\n"),
  );
  assertEquals(await repo.diff.patch({ unified: 0 }), [
    {
      path: "file",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 2, new: 2 },
          lines: [
            { type: "deleted", content: "old content" },
            { type: "added", content: "new content" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().commit.head() rejects empty repo", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.head(),
    GitError,
    "Current branch does not have any commits",
  );
});

Deno.test("git().commit.head() returns head tip", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  const commit = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.head(), commit);
});

Deno.test("git().commit.log() return empty on empty repo", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.commit.log(), []);
});

Deno.test("git().commit.log() returns single commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  assertEquals(await repo.commit.log(), [commit]);
});

Deno.test("git().commit.log() returns multiple commits", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.log(), [commit2, commit1]);
});

Deno.test("git().commit.log() can parse message body", async () => {
  await using repo = await tempRepository();
  await repo.commit.create(
    "summary\n\nbody\n\nkey1: value1\nkey2: value2\n",
    { allowEmpty: true },
  );
  const [commit] = await repo.commit.log();
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().commit.log() can work with custom trailer separator", async () => {
  await using repo = await tempRepository({
    config: { trailer: { separators: "#" } },
  });
  await repo.commit.create(
    "summary\n\nbody\n\nkey1 #value1\nkey2 #value2\n",
    { allowEmpty: true },
  );
  const [commit] = await repo.commit.log();
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().commit.log({ maxCount }) limits number of commits", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(await repo.commit.log({ maxCount: 2 }), [commit3, commit2]);
});

Deno.test("git().commit.log({ skip }) skips a number of commits", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit1", { allowEmpty: true });
  await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.log({ skip: 1, maxCount: 1 }), [commit]);
});

Deno.test("git().commit.log({ path }) returns changes to a file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await repo.index.add("file1");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add("file2");
  const commit2 = await repo.commit.create("commit2");
  assertEquals(await repo.commit.log({ path: "file1" }), [commit1]);
  assertEquals(await repo.commit.log({ path: ["file1"] }), [commit1]);
  assertEquals(await repo.commit.log({ path: "file2" }), [commit2]);
  assertEquals(await repo.commit.log({ path: ["file1", "file2"] }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().commit.log({ text }) returns blame", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commit.create("commit2");
  assertEquals(await repo.commit.log({ text: "content1" }), [commit1]);
  assertEquals(await repo.commit.log({ text: "content2" }), [commit2]);
});

Deno.test("git().commit.log({ text }) returns blame from multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commit.create("commit2");
  assertEquals(await repo.commit.log({ text: "content" }), [commit2, commit1]);
});

Deno.test("git().commit.log({ text }) returns blame from specific file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commit.create("commit2");
  assertEquals(await repo.commit.log({ path: ["file1"], text: "content" }), [
    commit1,
  ]);
  assertEquals(await repo.commit.log({ path: ["file2"], text: "content" }), [
    commit2,
  ]);
});

Deno.test("git().commit.log({ text }) can match extended regexp", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commit.create("commit2");
  assertEquals(await repo.commit.log({ text: "content[12]" }), [
    commit2,
    commit1,
  ]);
  assertEquals(await repo.commit.log({ text: ".+\d?" }), [commit2, commit1]);
});

Deno.test("git().commit.log({ range }) returns commit descendants", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.log({ range: { from: commit1 } }), [commit2]);
});

Deno.test("git().commit.log({ range }) returns commit ancestors", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(await repo.commit.log({ range: { to: commit2 } }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().commit.log({ range }) returns commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commit.create("commit3", { allowEmpty: true });
  await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(
    await repo.commit.log({ range: { from: commit1, to: commit3 } }),
    [
      commit3,
      commit2,
    ],
  );
});

Deno.test("git().commit.log({ range }) interprets range as asymmetric", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  await repo.commit.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commit.create("commit3", { allowEmpty: true });
  await repo.commit.create("commit4", { allowEmpty: true });
  assertEquals(
    await repo.commit.log({ range: { from: commit3, to: commit1 } }),
    [],
  );
});

Deno.test("git().commit.log({ range }) returns symmetric commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commit.create("commit3", { allowEmpty: true });
  await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(
    await repo.commit.log({
      range: { from: commit3, to: commit1, symmetric: true },
    }),
    [
      commit3,
      commit2,
    ],
  );
});

Deno.test("git().commit.log({ range }) ignores empty range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commit.create("commit3", { allowEmpty: true });
  assertEquals(await repo.commit.log({ range: {} }), [
    commit3,
    commit2,
    commit1,
  ]);
});

Deno.test("git().commit.log({ author }) filters by author", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", {
    author: { name: "name1", email: "email1@example.com" },
    allowEmpty: true,
  });
  const commit2 = await repo.commit.create("commit2", {
    author: { name: "name2", email: "email2@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.commit.log({
      author: { name: "name1", email: "email1@example.com" },
    }),
    [commit1],
  );
  assertEquals(
    await repo.commit.log({
      author: { name: "name2", email: "email2@example.com" },
    }),
    [commit2],
  );
});

Deno.test("git().commit.log({ committer }) filters by committer", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository();
  await repo.config.set({
    user: { name: "name1", email: "email1@example.com" },
  });
  const commit1 = await repo.commit.create("commit1", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  await repo.config.set({
    user: { name: "name2", email: "email2@example.com" },
  });
  const commit2 = await repo.commit.create("commit2", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.commit.log({ committer: commit1.committer }),
    [commit1],
  );
  assertEquals(
    await repo.commit.log({ committer: commit2.committer }),
    [commit2],
  );
});

Deno.test("git().commit.create() creates a commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("summary");
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commit.create() rejects empty commit", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commit.create("commit"), GitError);
});

Deno.test("git().commit.create({ allowEmpty }) allows empty commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("summary", { allowEmpty: true });
  assertEquals(commit?.summary, "summary");
});

Deno.test("git().commit.create({ body }) creates a commit with body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("summary", { body: "body" });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commit.create({ body }) ignores empty body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("summary", { body: "" });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commit.create({ trailers }) creates a commit with trailers", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("summary", {
    trailers: { key1: "value1", key2: "value2\n  multi\n  line" },
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2 multi line" });
});

Deno.test("git().commit.create({ trailers }) can create a commit with body and trailers", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("summary", {
    body: "body",
    trailers: { key: "value" },
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key: "value" });
});

Deno.test("git().commit.create() can automatically add files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "new content");
  const commit = await repo.commit.create("commit", { all: true });
  assertEquals(await repo.commit.head(), commit);
});

Deno.test("git().commit.create() can automatically remove files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  const commit = await repo.commit.create("commit", { all: true });
  assertEquals(await repo.commit.head(), commit);
});

Deno.test("git().commit.create({ amend }) amends a commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  const commit = await repo.commit.create("new summary", { amend: true });
  assertEquals(commit?.summary, "new summary");
});

Deno.test("git().commit.create({ author }) sets author", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("commit", {
    author: { name: "name", email: "email@example.com" },
  });
  assertEquals(commit?.author, { name: "name", email: "email@example.com" });
});

Deno.test("git().commit.create({ author }) sets committer", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository({
    config: { user: { name: "name", email: "email@example.com" } },
  });
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("commit", {
    author: { name: "other", email: "other@example.com" },
  });
  assertEquals(commit?.committer, {
    name: "name",
    email: "email@example.com",
  });
});

Deno.test("git().commit.create() reject empty summary", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.create("", { allowEmpty: true }),
    GitError,
  );
});

Deno.test("git().commit.create({ sign }) cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.create("commit", { allowEmpty: true, sign: "not-a-key" }),
    GitError,
  );
});

Deno.test("git().tag.list() returns empty list on empty repo", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().tag.list() returns empty list on no tags repo", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().tag.list() returns single tag", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  assertEquals(await repo.tag.list(), [tag]);
});

Deno.test("git().tag.list({ sort }) can sort by version", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const tag100 = await repo.tag.create("v1.0.0");
  const tag201 = await repo.tag.create("v2.0.1");
  const tag200 = await repo.tag.create("v2.0.0");
  assertEquals(await repo.tag.list({ sort: "version" }), [
    tag201,
    tag200,
    tag100,
  ]);
});

Deno.test("git().tag.list({ sort }) can sort by pre-release version", async () => {
  await using repo = await tempRepository({
    config: { versionsort: { suffix: ["-pre", "-beta", "-rc"] } },
  });
  await repo.commit.create("summary", { allowEmpty: true });
  const tag100 = await repo.tag.create("v1.0.0");
  const tag200 = await repo.tag.create("v2.0.0");
  const tag200beta = await repo.tag.create("v2.0.0-beta");
  const tag200pre1 = await repo.tag.create("v2.0.0-pre.1");
  const tag200pre2 = await repo.tag.create("v2.0.0-pre.2");
  const tag200pre3 = await repo.tag.create("v2.0.0-pre.3");
  const tag200rc1 = await repo.tag.create("v2.0.0-rc.1");
  const tag200rc2 = await repo.tag.create("v2.0.0-rc.2");
  assertEquals(await repo.tag.list({ sort: "version" }), [
    tag200,
    tag200rc2,
    tag200rc1,
    tag200beta,
    tag200pre3,
    tag200pre2,
    tag200pre1,
    tag100,
  ]);
});

Deno.test("git().tag.list({ name }) matches tag name", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.tag.create("tag1");
  const tag2 = await repo.tag.create("tag2");
  assertEquals(await repo.tag.list({ name: "tag2" }), [tag2]);
});

Deno.test("git().tag.list({ name }) can match tag pattern", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const tag2 = await repo.tag.create("tag2");
  assertEquals(await repo.tag.list({ name: "tag*" }), [tag1, tag2]);
});

Deno.test("git().tag.list({ contains }) returns tags that contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo.tag.create("tag2");
  assertEquals(await repo.tag.list({ contains: commit1 }), [tag1, tag2]);
  assertEquals(await repo.tag.list({ contains: commit2 }), [tag2]);
});

Deno.test("git().tag.list({ noContains }) returns tags that do not contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  await repo.tag.create("tag2");
  assertEquals(await repo.tag.list({ noContains: commit1 }), []);
  assertEquals(await repo.tag.list({ noContains: commit2 }), [tag1]);
});

Deno.test("git().tag.list({ pointsAt }) returns tags that point to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo.tag.create("tag2", { subject: "subject" });
  assertEquals(await repo.tag.list({ pointsAt: commit1 }), [tag1]);
  assertEquals(await repo.tag.list({ pointsAt: commit2 }), [tag2]);
});

Deno.test("git().tag.create() creates a lightweight tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tag.create() can create an annotated tag", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository({
    config: { user: { name: "tagger", email: "tagger@example.com" } },
  });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag", {
    subject: "subject",
    body: "body",
  });
  assertEquals(tag, {
    name: "tag",
    commit,
    tagger: { name: "tagger", email: "tagger@example.com" },
    subject: "subject",
    body: "body",
  });
});

Deno.test("git().tag.create() ignores empty body", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository({
    config: { user: { name: "tagger", email: "tagger@example.com" } },
  });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag", { subject: "subject", body: "" });
  assertEquals(tag, {
    name: "tag",
    commit,
    tagger: { name: "tagger", email: "tagger@example.com" },
    subject: "subject",
  });
});

Deno.test("git().tag.create() cannot create annotated tag without subject", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await assertRejects(() => repo.tag.create("tag", { sign: true }), GitError);
});

Deno.test("git().tag.create() cannot create duplicate tag", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.tag.create("tag");
  await assertRejects(() => repo.tag.create("tag"), GitError);
});

Deno.test("git().tag.create({ target }) creates a tag with commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag", { target: commit });
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tag.create({ target }) can create a tag with another tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.tag.create("tag1");
  await repo.tag.create("tag2", { target: "tag1" });
  const tags = await repo.tag.list();
  assertEquals(tags, [
    { name: "tag1", commit },
    { name: "tag2", commit },
  ]);
});

Deno.test("git().tag.create({ force }) can force move a tag", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  await repo.tag.create("tag");
  await repo.commit.create("commit2", { allowEmpty: true });
  await repo.tag.create("tag", { force: true });
});

Deno.test("git().tag.create({ sign }) cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.tag.create("tag", { sign: "not-a-key" }),
    GitError,
  );
});

Deno.test("git().tag.push() can push tag to remote", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  await repo.tag.push(tag);
  assertEquals(await remote.tag.list(), [tag]);
});

Deno.test("git().tag.push() cannot override remote tag", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.commit.create("new", { allowEmpty: true });
  await remote.tag.create("tag");
  await repo.tag.create("tag");
  await assertRejects(() => repo.tag.push("tag"), GitError);
});

Deno.test("git().tag.push({ force }) force overrides remote tag", async () => {
  await using remote = await tempRepository();
  await remote.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.commit.create("new", { allowEmpty: true });
  await remote.tag.create("tag");
  await repo.tag.create("tag");
  await repo.tag.push("tag", { force: true });
});

Deno.test("git().ignore.filter() returns empty array for non-ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  assertEquals(await repo.ignore.filter("file.txt"), []);
});

Deno.test("git().ignore.filter() returns ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.filter(["file.txt", "file.log"]), [
    "file.log",
  ]);
});

Deno.test("git().ignore.filter() works with single path string", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.filter("file.log"), ["file.log"]);
  assertEquals(await repo.ignore.filter("file.txt"), []);
});

Deno.test("git().ignore.filter() works with multiple patterns", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log\n*.tmp");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await Deno.writeTextFile(repo.path("temp.tmp"), "temp");
  assertEquals(
    await repo.ignore.filter(["file.txt", "file.log", "temp.tmp"]),
    ["file.log", "temp.tmp"],
  );
});

Deno.test("git().ignore.filter() handles empty array", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.ignore.filter([]), []);
});

Deno.test("git().ignore.filter() works with nonexistent files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  assertEquals(await repo.ignore.filter("ignored.log"), ["ignored.log"]);
});

Deno.test("git().ignore.filter({ index }) considers index", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await repo.index.add("file.log", { force: true });
  assertEquals(await repo.ignore.filter("file.log"), []);
  assertEquals(await repo.ignore.filter("file.log", { index: false }), [
    "file.log",
  ]);
});

Deno.test("git().ignore.omit() returns empty array for ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "file.txt");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  assertEquals(await repo.ignore.omit("file.txt"), []);
});

Deno.test("git().ignore.omit() returns unignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.omit(["file.txt", "file.log"]), [
    "file.txt",
  ]);
});

Deno.test("git().ignore.omit() works with single path string", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.omit("file.log"), []);
  assertEquals(await repo.ignore.omit("file.txt"), ["file.txt"]);
});

Deno.test("git().ignore.omit() works with multiple patterns", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log\n*.tmp");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await Deno.writeTextFile(repo.path("temp.tmp"), "temp");
  assertEquals(
    await repo.ignore.omit(["file.txt", "file.log", "temp.tmp"]),
    ["file.txt"],
  );
});

Deno.test("git().ignore.omit() handles empty array", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.ignore.omit([]), []);
});

Deno.test("git().ignore.omit() works with nonexistent files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  assertEquals(await repo.ignore.omit("ignored.log"), []);
  assertEquals(await repo.ignore.omit("log"), ["log"]);
});

Deno.test("git().ignore.omit({ index }) considers index", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await repo.index.add("file.log", { force: true });
  assertEquals(await repo.ignore.omit("file.log", { index: true }), [
    "file.log",
  ]);
  assertEquals(await repo.ignore.omit("file.log", { index: false }), []);
});
