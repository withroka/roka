import { tempDirectory } from "@roka/fs/temp";
import { tempRepository } from "@roka/git/testing";
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { basename, resolve } from "@std/path";
import { git, GitError } from "./git.ts";

// some tests cannot check committer/tagger if Codespaces are signing with GPG
const codespaces = !!Deno.env.get("CODESPACES");

Deno.test("git() mentions failed command on error", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await assertRejects(
    () => repo.tags.create("no commit"),
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
    () => repo.tags.create("no commit"),
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
  await repo.commits.create("summary", { allowEmpty: true });
  await repo.tags.create("1.2.3");
  await repo.tags.create("1.2.3-alpha");
  await repo.tags.create("1.2.3-beta");
  await repo.tags.create("1.2.3-rc");
  assertEquals(
    (await repo.tags.list({ sort: "version" })).map((tag) => tag.name),
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
  assertEquals(await repo.branches.current(), { name: "branch" });
  await repo.init();
});

Deno.test("git().config.set() configures single values", async () => {
  await using repo = await tempRepository();
  await repo.config.set({ user: { name: "name", email: "email" } });
  const commit = await repo.commits.create("commit", {
    sign: false,
    allowEmpty: true,
  });
  assertEquals(commit?.author, { name: "name", email: "email" });
});

Deno.test("git().config.set() configures multi values", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("summary", { allowEmpty: true });
  await repo.tags.create("1.2.3");
  await repo.tags.create("1.2.3-alpha");
  await repo.tags.create("1.2.3-beta");
  await repo.tags.create("1.2.3-rc");
  await repo.config.set({
    versionsort: { suffix: ["-alpha", "-beta", "-rc"] },
  });
  assertEquals(
    (await repo.tags.list({ sort: "version" })).map((tag) => tag.name),
    ["1.2.3", "1.2.3-rc", "1.2.3-beta", "1.2.3-alpha"],
  );
});

Deno.test("git().branches.create() creates a branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  const branch = await repo.branches.create("branch");
  assertEquals(branch, { name: "branch", commit });
  assertNotEquals(await repo.branches.current(), branch);
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.create({ target }) creates a branch at target", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({ clone: remote });
  assertEquals(
    await repo.branches.create("branch1", { target: commit }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branches.create("branch2", { target: "origin/target" }),
    { name: "branch2", upstream: "origin/target", commit },
  );
});

Deno.test("git().branches.create({ track }) creates a branch with upstream", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: false } },
  });
  assertEquals(
    await repo.branches.create("branch1", { target: "origin/target" }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branches.create("branch2", {
      target: "origin/target",
      track: true,
    }),
    { name: "branch2", upstream: "origin/target", commit },
  );
});

Deno.test("git().branches.create({ track }) can disable tracking", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: "always" } },
  });
  assertEquals(
    await repo.branches.create("branch1", { target: "origin/target" }),
    { name: "branch1", upstream: "origin/target", commit },
  );
  assertEquals(
    await repo.branches.create("branch2", {
      target: "origin/target",
      track: false,
    }),
    { name: "branch2", commit },
  );
});

Deno.test("git().branches.create({ track }) can inherit source upstream", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  const main = await repo.branches.current();
  const branch = await repo.branches.create("branch", { track: "inherit" });
  assertEquals(branch, { name: "branch", upstream: "origin/main", commit });
  assertNotEquals(await repo.branches.current(), branch);
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.current() returns current branch", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ create: "branch" });
  assertEquals(await repo.branches.current(), { name: "branch", commit });
});

Deno.test("git().branches.current() is undefined on detached state", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  assertNotEquals(await repo.branches.current(), undefined);
  await repo.branches.checkout({ detach: true });
  assertEquals(await repo.branches.current(), undefined);
});

Deno.test("git().branches.list() returns all branches", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit1", { allowEmpty: true });
  let main = await repo.branches.current();
  assertEquals(await repo.branches.list(), [main]);
  const branch = await repo.branches.create("branch");
  await repo.commits.create("commit2", { allowEmpty: true });
  main = await repo.branches.current();
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.list() returns all branches in detached HEAD", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  await repo.branches.checkout({ detach: true });
  const branch = await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.list({ name }) matches branch name", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch1");
  await repo.branches.create("branch2");
  assertEquals(await repo.branches.list({ name: "branch2" }), [
    { name: "branch2", commit },
  ]);
});

Deno.test("git().branches.list({ name }) can match branch pattern", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch1");
  await repo.branches.create("branch2");
  assertEquals(await repo.branches.list({ name: "branch*" }), [
    { name: "branch1", commit },
    { name: "branch2", commit },
  ]);
});

Deno.test("git().branches.list({ all }) returns all branches", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("remote");
  await using repo = await tempRepository({ clone: remote });
  await repo.branches.create("local");
  assertEquals(await repo.branches.list({ all: true }), [
    { name: "local", commit },
    { name: "main", push: "origin/main", upstream: "origin/main", commit },
    { name: "origin", commit },
    { name: "origin/main", commit },
    { name: "origin/remote", commit },
  ]);
});

Deno.test("git().branches.list({ remotes }) returns only remote branches", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("remote");
  await using repo = await tempRepository({ clone: remote });
  await repo.branches.create("local");
  assertEquals(await repo.branches.list({ remotes: true }), [
    { name: "origin", commit },
    { name: "origin/main", commit },
    { name: "origin/remote", commit },
  ]);
});

Deno.test("git().branches.list({ contains }) returns branches that contain commit", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const branch2 = await repo.branches.create("branch2");
  const main = await repo.branches.current();
  assertEquals(await repo.branches.list({ contains: commit1 }), [
    branch1,
    branch2,
    main,
  ]);
  assertEquals(await repo.branches.list({ contains: commit2 }), [
    branch2,
    main,
  ]);
});

Deno.test("git().branches.list() returns branches that do not contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  await repo.branches.create("branch2");
  await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(await repo.branches.list({ noContains: commit1 }), []);
  assertEquals(await repo.branches.list({ noContains: commit2 }), [branch1]);
});

Deno.test("git().branches.list({ pointsAt }) returns branches that point to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const branch2 = await repo.branches.create("branch2");
  await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(await repo.branches.list({ pointsAt: commit1 }), [branch1]);
  assertEquals(await repo.branches.list({ pointsAt: commit2 }), [branch2]);
});

Deno.test("git().branches.move() renames a branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  const branch = await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), [branch, main]);
  const renamed = await repo.branches.move(branch, "renamed");
  assertEquals(await repo.branches.list(), [main, renamed]);
});

Deno.test("git().branches.move() can rename current branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  assertExists(main);
  const renamed = await repo.branches.move(main, "renamed");
  assertEquals(await repo.branches.list(), [renamed]);
  assertEquals(await repo.branches.current(), renamed);
});

Deno.test("git().branches.move() rejects overriding existing branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  assertExists(main);
  const branch = await repo.branches.create("branch");
  await assertRejects(
    () => repo.branches.move(main, "branch"),
    GitError,
    "a branch named 'branch' already exists",
  );
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.move({ force }) can override existing branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  assertExists(main);
  let branch = await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), [branch, main]);
  branch = await repo.branches.move(main, "branch", { force: true });
  assertEquals(await repo.branches.list(), [branch]);
  assertEquals(await repo.branches.current(), branch);
});

Deno.test("git().branches.copy() copies a branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  const branch = await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), [branch, main]);
  const copy = await repo.branches.copy(branch, "copy");
  assertEquals(await repo.branches.list(), [branch, copy, main]);
});

Deno.test("git().branches.copy() can copy current branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  assertExists(main);
  const copy = await repo.branches.copy(main, "copy");
  assertEquals(await repo.branches.list(), [copy, main]);
  assertEquals(await repo.branches.current(), main);
});

Deno.test("git().branches.copy() rejects overriding existing branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  assertExists(main);
  const branch = await repo.branches.create("branch");
  await assertRejects(
    () => repo.branches.copy(main, "branch"),
    GitError,
    "a branch named 'branch' already exists",
  );
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.copy({ force }) can override existing branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  assertExists(main);
  let branch = await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), [branch, main]);
  branch = await repo.branches.copy(main, "branch", { force: true });
  assertEquals(await repo.branches.list(), [branch, main]);
  assertEquals(await repo.branches.current(), main);
});

Deno.test("git().branches.delete() rejects current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const current = await repo.branches.current();
  assertExists(current);
  await assertRejects(() => repo.branches.delete(current), GitError);
});

Deno.test("git().branches.delete() can delete branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const current = await repo.branches.current();
  assertExists(current);
  await repo.branches.checkout({ detach: true });
  await repo.branches.delete(current);
  assertEquals(await repo.branches.list(), []);
});

Deno.test("git().branches.delete() can delete branch by name", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  const branch = await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), [branch, main]);
  await repo.branches.delete("branch");
  assertEquals(await repo.branches.list(), [main]);
});

Deno.test("git().branches.delete() rejects unmerged branch", async () => {
  await using repo = await tempRepository();
  const main = await repo.branches.current();
  assertExists(main);
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch");
  await repo.branches.checkout({ target: "branch" });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ target: main });
  await assertRejects(() => repo.branches.delete("branch"), GitError);
});

Deno.test("git().branches.delete({ force }) can delete unmerged branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  const main = await repo.branches.current();
  await repo.branches.create("branch");
  await repo.branches.checkout({ target: "branch" });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ target: "main" });
  await repo.branches.delete("branch", { force: true });
  assertEquals(await repo.branches.list(), [main]);
});

Deno.test("git().branches.checkout() stays at current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.current();
  assertEquals(await repo.branches.checkout(), branch);
  assertEquals(await repo.branches.current(), branch);
});

Deno.test("git().branches.checkout({ target }) can switch to branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const main = await repo.branches.current();
  await repo.branches.checkout({ create: "branch" });
  assertEquals(await repo.branches.current(), {
    name: "branch",
    commit: commit1,
  });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  assertEquals(await repo.branches.current(), {
    name: "branch",
    commit: commit2,
  });
  assertEquals(await repo.commits.log(), [commit2, commit1]);
  await repo.branches.checkout({ target: "main" });
  assertEquals(await repo.branches.current(), main);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ target: "branch" });
  assertEquals(
    await repo.branches.current(),
    { name: "branch", commit: commit2 },
  );
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().branches.checkout({ target }) can switch to commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  assertEquals(await repo.branches.checkout({ target: commit1 }), undefined);
  assertEquals(await repo.branches.current(), undefined);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ create: "branch" });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  await repo.branches.checkout({ target: commit1 });
  assertEquals(await repo.branches.current(), undefined);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ target: commit2 });
  assertEquals(await repo.branches.current(), undefined);
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().branches.checkout({ target }) can detach", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  assertEquals(await repo.branches.checkout({ target: commit }), undefined);
  assertEquals(await repo.branches.current(), undefined);
});

Deno.test("git().branches.checkout({ create }) creates a branch", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.checkout({ create: "branch" });
  assertEquals(branch, { name: "branch", commit });
  assertEquals(await repo.branches.current(), branch);
});

Deno.test("git().branches.checkout({ create }) can create a branch with tracking", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: false } },
  });
  assertEquals(
    await repo.branches.checkout({
      create: "branch1",
      target: "origin/target",
    }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branches.checkout({
      create: "branch2",
      target: "origin/target",
      track: true,
    }),
    { name: "branch2", upstream: "origin/target", commit },
  );
});

Deno.test("git().branches.checkout({ track }) can disable tracking", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({
    clone: remote,
    config: { branch: { autoSetupMerge: "always" } },
  });
  assertEquals(
    await repo.branches.checkout({
      create: "branch1",
      target: "origin/target",
    }),
    { name: "branch1", upstream: "origin/target", commit },
  );
  assertEquals(
    await repo.branches.checkout({
      create: "branch2",
      target: "origin/target",
      track: false,
    }),
    { name: "branch2", commit },
  );
});

Deno.test("git().branches.checkout({ track }) can inherit source upstream", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  const main = await repo.branches.current();
  const branch = await repo.branches.checkout({
    create: "branch",
    track: "inherit",
  });
  assertEquals(branch, { name: "branch", upstream: "origin/main", commit });
  assertEquals(await repo.branches.current(), branch);
  assertEquals(await repo.branches.list(), [branch, main]);
});

Deno.test("git().branches.track() sets upstream branch", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({ clone: remote });
  const branch = await repo.branches.create("branch");
  await repo.branches.track(branch, "origin/target");
  assertEquals(await repo.branches.list({ name: "branch" }), [
    { name: "branch", upstream: "origin/target", commit },
  ]);
});

Deno.test("git().branches.untrack() unsets upstream branch", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("target");
  await using repo = await tempRepository({ clone: remote });
  const branch = await repo.branches.create("branch", {
    target: "origin/target",
  });
  assertEquals(await repo.branches.list({ name: "branch" }), [
    { name: "branch", upstream: "origin/target", commit },
  ]);
  await repo.branches.untrack(branch);
  assertEquals(await repo.branches.list({ name: "branch" }), [
    { name: "branch", commit },
  ]);
});

Deno.test("git().ignore.ignored() returns empty array for non-ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  assertEquals(await repo.ignore.ignored("file.txt"), []);
});

Deno.test("git().ignore.ignored() returns ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.ignored(["file.txt", "file.log"]), [
    "file.log",
  ]);
});

Deno.test("git().ignore.ignored() works with single path string", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.ignored("file.log"), ["file.log"]);
  assertEquals(await repo.ignore.ignored("file.txt"), []);
});

Deno.test("git().ignore.ignored() works with multiple patterns", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log\n*.tmp");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await Deno.writeTextFile(repo.path("temp.tmp"), "temp");
  assertEquals(
    await repo.ignore.ignored(["file.txt", "file.log", "temp.tmp"]),
    ["file.log", "temp.tmp"],
  );
});

Deno.test("git().ignore.ignored() handles empty array", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.ignore.ignored([]), []);
});

Deno.test("git().ignore.ignored() works with nonexistent files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  assertEquals(await repo.ignore.ignored("ignored.log"), ["ignored.log"]);
});

Deno.test("git().ignore.ignored({ index }) considers index", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await repo.index.add("file.log", { force: true });
  assertEquals(await repo.ignore.ignored("file.log"), []);
  assertEquals(await repo.ignore.ignored("file.log", { index: false }), [
    "file.log",
  ]);
});

Deno.test("git().ignore.unignored() returns empty array for ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "file.txt");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  assertEquals(await repo.ignore.unignored("file.txt"), []);
});

Deno.test("git().ignore.unignored() returns unignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.unignored(["file.txt", "file.log"]), [
    "file.txt",
  ]);
});

Deno.test("git().ignore.unignored() works with single path string", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  assertEquals(await repo.ignore.unignored("file.log"), []);
  assertEquals(await repo.ignore.unignored("file.txt"), ["file.txt"]);
});

Deno.test("git().ignore.unignored() works with multiple patterns", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log\n*.tmp");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await Deno.writeTextFile(repo.path("temp.tmp"), "temp");
  assertEquals(
    await repo.ignore.unignored(["file.txt", "file.log", "temp.tmp"]),
    ["file.txt"],
  );
});

Deno.test("git().ignore.unignored() handles empty array", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.ignore.unignored([]), []);
});

Deno.test("git().ignore.unignored() works with nonexistent files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  assertEquals(await repo.ignore.unignored("ignored.log"), []);
  assertEquals(await repo.ignore.unignored("log"), ["log"]);
});

Deno.test("git().ignore.unignored({ index }) considers index", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "*.log");
  await Deno.writeTextFile(repo.path("file.log"), "log content");
  await repo.index.add("file.log", { force: true });
  assertEquals(await repo.ignore.unignored("file.log", { index: true }), [
    "file.log",
  ]);
  assertEquals(await repo.ignore.unignored("file.log", { index: false }), []);
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
  await repo.commits.create("commit");
  await assertRejects(() => repo.index.add("file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.add({ force }) can add ignored file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await repo.commits.create("commit");
  await repo.index.add("file", { force: true });
  assertEquals((await repo.index.status()).staged, [
    { path: "file", status: "added" },
  ]);
});

Deno.test("git().index.add({ executable }) can add file as executable", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  let stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o111, 0o000);
  await repo.index.add("file", { executable: true });
  const commit = await repo.commits.create("commit");
  await repo.index.remove("file", { force: true });
  await repo.commits.create("commit");
  await repo.branches.checkout({ target: commit });
  stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o110, 0o110);
});

Deno.test("git().index.add({ executable }) can add file as non-executable", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await Deno.chmod(repo.path("file"), 0o755);
  await repo.index.add("file", { executable: false });
  const commit = await repo.commits.create("commit");
  await repo.index.remove("file", { force: true });
  await repo.commits.create("commit");
  await repo.branches.checkout({ target: commit });
  const stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o111, 0o000);
});

Deno.test("git().index.move() moves files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await assertRejects(() => repo.index.move("old.file", "new.file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move({ force }) can overwrite existing destination file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("old.file");
  await repo.commits.create("commit");
  await repo.index.move("old.file", "new.file", { force: true });
  assertEquals((await repo.index.status()).staged, [
    { path: "new.file", status: "renamed", from: "old.file" },
  ]);
});

Deno.test("git().index.remove() removes files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await assertRejects(() => repo.index.remove("file"), GitError);
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.remove({ force }) can remove modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await repo.index.remove("file", { force: true });
  assertEquals((await repo.index.status()).staged, [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().index.status() lists staged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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

Deno.test("git().diff.status() returns empty for no change", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() lists unstaged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "modified" },
  ]);
});

Deno.test("git().diff.status() does not list staged modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() lists unstaged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "modified" },
  ]);
});

Deno.test("git().diff.status() lists unstaged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  await repo.index.add("file", { executable: true });
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status() does not list staged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await Deno.remove(repo.path("file"));
  assertEquals(await repo.diff.status(), [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().diff.status() does not list staged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await repo.index.remove("file");
  assertEquals(await repo.diff.status(), []);
});

Deno.test("git().diff.status({ path }) filters by path", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add(["file1", "file2"]);
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) lists staged file with mode change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: false });
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await Deno.chmod(repo.path("file"), 0o755);
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) does not list unstaged file with type change", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await repo.index.remove("file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "file", status: "deleted" },
  ]);
});

Deno.test("git().diff.status({ staged }) does not list unstaged deleted file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.remove(repo.path("file"));
  assertEquals(await repo.diff.status({ staged: true }), []);
});

Deno.test("git().diff.status({ staged }) lists renamed file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commits.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.diff.status({ staged: true }), [
    { path: "new.file", status: "renamed", from: "old.file" },
  ]);
});

Deno.test("git().diff.status({ renames }) can ignore renames", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "new content");
  await Deno.writeTextFile(repo.path("copied.file"), "content");
  await repo.index.add(["source.file", "copied.file"]);
  assertEquals(await repo.diff.status({ staged: true, copies: true }), [
    { path: "copied.file", status: "copied", from: "source.file" },
    { path: "source.file", status: "modified" },
  ]);
});

Deno.test("git().diff.status({ target }) lists files modified since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("committed"), "content");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await Deno.writeTextFile(repo.path("unstaged"), "content");
  await repo.index.add(["committed", "staged", "unstaged"]);
  const commit = await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("committed"), "modified content");
  await repo.index.add("committed");
  await repo.commits.create("commit");
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
  const commit = await repo.commits.create("commit");
  await Deno.chmod(repo.path("committed"), 0o755);
  await repo.index.add("committed", { executable: true });
  await repo.commits.create("commit");
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
  const commit = await repo.commits.create("commit");
  await Deno.remove(repo.path("committed"));
  await Deno.symlink("target", repo.path("committed"));
  await repo.index.add("committed");
  await repo.commits.create("commit");
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
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("committed"), "content");
  await repo.index.add("committed");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await repo.index.add("staged");
  assertEquals(await repo.diff.status({ target: commit }), [
    { path: "committed", status: "added" },
    { path: "staged", status: "added" },
  ]);
});

Deno.test("git().diff.status({ target }) does not list untracked files", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.diff.status({ target: commit }), []);
});

Deno.test("git().diff.status({ target }) lists deleted files since commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("committed"), "content");
  await Deno.writeTextFile(repo.path("staged"), "content");
  await Deno.writeTextFile(repo.path("unstaged"), "content");
  await repo.index.add(["committed", "staged", "unstaged"]);
  const commit = await repo.commits.create("commit");
  await repo.index.remove("committed");
  await repo.commits.create("commit");
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
  const commit = await repo.commits.create("commit");
  await repo.index.move("old.committed.file", "new.committed.file");
  await repo.commits.create("commit");
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
  const commit1 = await repo.commits.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit2 = await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "new content");
  await repo.index.add("file");
  const commit3 = await repo.commits.create("commit");
  await repo.index.remove("file");
  const commit4 = await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
  await repo.index.move("old.file", "new.file");
  assertEquals(await repo.diff.patch({ staged: true }), [
    {
      path: "new.file",
      status: "renamed",
      from: { path: "old.file", similarity: 1 },
    },
  ]);
});

Deno.test("git().diff.patch({ renames }) can ignore renames", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content\n");
  await repo.index.add("old.file");
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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

Deno.test("git().diff.patch({ range }) generates patch for range", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "old content", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  const commit1 = await repo.commits.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "new content", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  const commit2 = await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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
  await repo.commits.create("commit");
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

Deno.test("git().commits.create() creates a commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("summary");
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commits.create() rejects empty commit", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.create("commit"), GitError);
});

Deno.test("git().commits.create({ allowEmpty }) allows empty commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("summary", { allowEmpty: true });
  assertEquals(commit?.summary, "summary");
});

Deno.test("git().commits.create({ body }) creates a commit with body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("summary", { body: "body" });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commits.create({ body }) ignores empty body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("summary", { body: "" });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commits.create({ trailers }) creates a commit with trailers", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("summary", {
    trailers: { key1: "value1", key2: "value2\n  multi\n  line" },
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2 multi line" });
});

Deno.test("git().commits.create({ trailers }) can create a commit with body and trailers", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("summary", {
    body: "body",
    trailers: { key: "value" },
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key: "value" });
});

Deno.test("git().commits.create() can automatically add files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "new content");
  const commit = await repo.commits.create("commit", { all: true });
  assertEquals(await repo.commits.current(), commit);
});

Deno.test("git().commits.create() can automatically remove files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.remove(repo.path("file"));
  const commit = await repo.commits.create("commit", { all: true });
  assertEquals(await repo.commits.current(), commit);
});

Deno.test("git().commits.create({ amend }) amends a commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  const commit = await repo.commits.create("new summary", { amend: true });
  assertEquals(commit?.summary, "new summary");
});

Deno.test("git().commits.create({ author }) sets author", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("commit", {
    author: { name: "name", email: "email@example.com" },
  });
  assertEquals(commit?.author, { name: "name", email: "email@example.com" });
});

Deno.test("git().commits.create({ author }) sets committer", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository({
    config: { user: { name: "name", email: "email@example.com" } },
  });
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("commit", {
    author: { name: "other", email: "other@example.com" },
  });
  assertEquals(commit?.committer, {
    name: "name",
    email: "email@example.com",
  });
});

Deno.test("git().commits.create() reject empty summary", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commits.create("", { allowEmpty: true }),
    GitError,
  );
});

Deno.test("git().commits.create({ sign }) cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () =>
      repo.commits.create("commit", { allowEmpty: true, sign: "not-a-key" }),
    GitError,
  );
});

Deno.test("git().commits.current() rejects empty repo", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.current(), GitError);
});

Deno.test("git().commits.current() returns head tip", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit1", { allowEmpty: true });
  const commit = await repo.commits.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commits.current(), commit);
});

Deno.test("git().commits.log() rejects empty repo", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.log(), GitError);
});

Deno.test("git().commits.log() returns single commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().commits.log() returns multiple commits", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().commits.log() can parse message body", async () => {
  await using repo = await tempRepository();
  await repo.commits.create(
    "summary\n\nbody\n\nkey1: value1\nkey2: value2\n",
    { allowEmpty: true },
  );
  const [commit] = await repo.commits.log();
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().commits.log() can work with custom trailer separator", async () => {
  await using repo = await tempRepository({
    config: { trailer: { separators: "#" } },
  });
  await repo.commits.create(
    "summary\n\nbody\n\nkey1 #value1\nkey2 #value2\n",
    { allowEmpty: true },
  );
  const [commit] = await repo.commits.log();
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().commits.log({ maxCount }) limits number of commits", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(await repo.commits.log({ maxCount: 2 }), [commit3, commit2]);
});

Deno.test("git().commits.log({ skip }) skips a number of commits", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit1", { allowEmpty: true });
  await repo.commits.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commits.log({ skip: 1, maxCount: 1 }), [commit]);
});

Deno.test("git().commits.log({ path }) returns changes to a file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("commit2");
  assertEquals(await repo.commits.log({ path: "file1" }), [commit1]);
  assertEquals(await repo.commits.log({ path: ["file1"] }), [commit1]);
  assertEquals(await repo.commits.log({ path: "file2" }), [commit2]);
  assertEquals(await repo.commits.log({ path: ["file1", "file2"] }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().commits.log({ text }) returns blame", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("commit2");
  assertEquals(await repo.commits.log({ text: "content1" }), [commit1]);
  assertEquals(await repo.commits.log({ text: "content2" }), [commit2]);
});

Deno.test("git().commits.log({ text }) returns blame from multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("commit2");
  assertEquals(await repo.commits.log({ text: "content" }), [commit2, commit1]);
});

Deno.test("git().commits.log({ text }) returns blame from specific file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("commit2");
  assertEquals(await repo.commits.log({ path: ["file1"], text: "content" }), [
    commit1,
  ]);
  assertEquals(await repo.commits.log({ path: ["file2"], text: "content" }), [
    commit2,
  ]);
});

Deno.test("git().commits.log({ text }) can match extended regexp", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("commit1");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("commit2");
  assertEquals(await repo.commits.log({ text: "content[12]" }), [
    commit2,
    commit1,
  ]);
  assertEquals(await repo.commits.log({ text: ".+\d?" }), [commit2, commit1]);
});

Deno.test("git().commits.log({ range }) returns commit descendants", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commits.log({ range: { from: commit1 } }), [commit2]);
});

Deno.test("git().commits.log({ range }) returns commit ancestors", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(await repo.commits.log({ range: { to: commit2 } }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().commits.log({ range }) returns commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commits.create("commit3", { allowEmpty: true });
  await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: { from: commit1, to: commit3 } }),
    [
      commit3,
      commit2,
    ],
  );
});

Deno.test("git().commits.log({ range }) interprets range as asymmetric", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  await repo.commits.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commits.create("commit3", { allowEmpty: true });
  await repo.commits.create("commit4", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: { from: commit3, to: commit1 } }),
    [],
  );
});

Deno.test("git().commits.log({ range }) returns symmetric commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commits.create("commit3", { allowEmpty: true });
  await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({
      range: { from: commit3, to: commit1, symmetric: true },
    }),
    [
      commit3,
      commit2,
    ],
  );
});

Deno.test("git().commits.log({ range }) ignores empty range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const commit3 = await repo.commits.create("commit3", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: {} }),
    [
      commit3,
      commit2,
      commit1,
    ],
  );
});

Deno.test("git().commits.log({ author }) filters by author", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", {
    author: { name: "name1", email: "email1@example.com" },
    allowEmpty: true,
  });
  const commit2 = await repo.commits.create("commit2", {
    author: { name: "name2", email: "email2@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.commits.log({
      author: { name: "name1", email: "email1@example.com" },
    }),
    [commit1],
  );
  assertEquals(
    await repo.commits.log({
      author: { name: "name2", email: "email2@example.com" },
    }),
    [commit2],
  );
});

Deno.test("git().commits.log({ committer }) filters by committer", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository();
  await repo.config.set({
    user: { name: "name1", email: "email1@example.com" },
  });
  const commit1 = await repo.commits.create("commit1", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  await repo.config.set({
    user: { name: "name2", email: "email2@example.com" },
  });
  const commit2 = await repo.commits.create("commit2", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.commits.log({ committer: commit1.committer }),
    [commit1],
  );
  assertEquals(
    await repo.commits.log({ committer: commit2.committer }),
    [commit2],
  );
});

Deno.test("git().tags.create() creates a lightweight tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag");
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tags.create() can create an annotated tag", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository({
    config: { user: { name: "tagger", email: "tagger@example.com" } },
  });
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag", {
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

Deno.test("git().tags.create() ignores empty body", {
  ignore: codespaces,
}, async () => {
  await using repo = await tempRepository({
    config: { user: { name: "tagger", email: "tagger@example.com" } },
  });
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag", { subject: "subject", body: "" });
  assertEquals(tag, {
    name: "tag",
    commit,
    tagger: { name: "tagger", email: "tagger@example.com" },
    subject: "subject",
  });
});

Deno.test("git().tags.create() cannot create annotated tag without subject", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await assertRejects(() => repo.tags.create("tag", { sign: true }), GitError);
});

Deno.test("git().tags.create() cannot create duplicate tag", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.tags.create("tag");
  await assertRejects(() => repo.tags.create("tag"), GitError);
});

Deno.test("git().tags.create({ target }) creates a tag with commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag", { target: commit });
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tags.create({ target }) can create a tag with another tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.tags.create("tag1");
  await repo.tags.create("tag2", { target: "tag1" });
  const tags = await repo.tags.list();
  assertEquals(tags, [
    { name: "tag1", commit },
    { name: "tag2", commit },
  ]);
});

Deno.test("git().tags.create({ force }) can force move a tag", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit1", { allowEmpty: true });
  await repo.tags.create("tag");
  await repo.commits.create("commit2", { allowEmpty: true });
  await repo.tags.create("tag", { force: true });
});

Deno.test("git().tags.create({ sign }) cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.tags.create("tag", { sign: "not-a-key" }),
    GitError,
  );
});

Deno.test("git().tags.list() returns empty list on empty repo", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.tags.list(), []);
});

Deno.test("git().tags.list() returns empty list on no tags repo", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  assertEquals(await repo.tags.list(), []);
});

Deno.test("git().tags.list() returns single tag", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag");
  assertEquals(await repo.tags.list(), [tag]);
});

Deno.test("git().tags.list({ sort }) can sort by version", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const tag100 = await repo.tags.create("v1.0.0");
  const tag201 = await repo.tags.create("v2.0.1");
  const tag200 = await repo.tags.create("v2.0.0");
  assertEquals(await repo.tags.list({ sort: "version" }), [
    tag201,
    tag200,
    tag100,
  ]);
});

Deno.test("git().tags.list({ sort }) can sort by pre-release version", async () => {
  await using repo = await tempRepository({
    config: { versionsort: { suffix: ["-pre", "-beta", "-rc"] } },
  });
  await repo.commits.create("summary", { allowEmpty: true });
  const tag100 = await repo.tags.create("v1.0.0");
  const tag200 = await repo.tags.create("v2.0.0");
  const tag200beta = await repo.tags.create("v2.0.0-beta");
  const tag200pre1 = await repo.tags.create("v2.0.0-pre.1");
  const tag200pre2 = await repo.tags.create("v2.0.0-pre.2");
  const tag200pre3 = await repo.tags.create("v2.0.0-pre.3");
  const tag200rc1 = await repo.tags.create("v2.0.0-rc.1");
  const tag200rc2 = await repo.tags.create("v2.0.0-rc.2");
  assertEquals(await repo.tags.list({ sort: "version" }), [
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

Deno.test("git().tags.list({ name }) matches tag name", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.tags.create("tag1");
  const tag2 = await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ name: "tag2" }), [tag2]);
});

Deno.test("git().tags.list({ name }) can match tag pattern", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const tag2 = await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ name: "tag*" }), [tag1, tag2]);
});

Deno.test("git().tags.list() returns tags that contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const tag2 = await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ contains: commit1 }), [tag1, tag2]);
  assertEquals(await repo.tags.list({ contains: commit2 }), [tag2]);
});

Deno.test("git().tags.list({ noContains }) returns tags that do not contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ noContains: commit1 }), []);
  assertEquals(await repo.tags.list({ noContains: commit2 }), [tag1]);
});

Deno.test("git().tags.list({ pointsAt }) returns tags that point to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  const tag2 = await repo.tags.create("tag2", { subject: "subject" });
  assertEquals(await repo.tags.list({ pointsAt: commit1 }), [tag1]);
  assertEquals(await repo.tags.list({ pointsAt: commit2 }), [tag2]);
});

Deno.test("git().tags.push() can push tag to remote", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag");
  await repo.tags.push(tag);
  assertEquals(await remote.tags.list(), [tag]);
});

Deno.test("git().tags.push() cannot override remote tag", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.commits.create("new", { allowEmpty: true });
  await remote.tags.create("tag");
  await repo.tags.create("tag");
  await assertRejects(() => repo.tags.push("tag"), GitError);
});

Deno.test("git().tags.push({ force }) force overrides remote tag", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.commits.create("new", { allowEmpty: true });
  await remote.tags.create("tag");
  await repo.tags.create("tag");
  await repo.tags.push("tag", { force: true });
});

Deno.test("git().remotes.clone() clones a repo", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit1", { allowEmpty: true });
  await remote.commits.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
  );
  assertEquals(repo.path(), directory.path(basename(remote.path())));
  assertEquals(await repo.commits.log(), await remote.commits.log());
});

Deno.test("git().remotes.clone({ directory }) clones into specified directory", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit1", { allowEmpty: true });
  await remote.commits.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    { directory: "directory" },
  );
  assertEquals(repo.path(), directory.path("directory"));
  assertEquals(await repo.commits.log(), await remote.commits.log());
});

Deno.test("git().remotes.clone({ directory }) rejects non-empty directory", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit1", { allowEmpty: true });
  await remote.commits.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  await Deno.mkdir(directory.path("directory"));
  await Deno.writeTextFile(directory.path("directory/file.txt"), "content");
  await assertRejects(
    () =>
      git({ cwd: directory.path() }).remotes.clone(remote.path(), {
        directory: "directory",
      }),
    GitError,
    "not an empty directory",
  );
});

Deno.test("git().remotes.clone({ remote }) clones a repo with remote name", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    { remote: "remote" },
  );
  assertEquals(await repo.commits.log(), await remote.commits.log());
});

Deno.test("git().remotes.clone({ branch }) checks out a branch", async () => {
  await using remote = await tempRepository();
  const target = await remote.commits.create("commit1", { allowEmpty: true });
  await remote.commits.create("commit2", { allowEmpty: true });
  await remote.branches.checkout({ target, create: "branch" });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    { branch: "branch" },
  );
  assertEquals(await repo.commits.log(), [target]);
});

Deno.test("git().remotes.clone({ depth }) makes a shallow copy", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit1", { allowEmpty: true });
  await remote.commits.create("commit2", { allowEmpty: true });
  const third = await remote.commits.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    { depth: 1, local: false },
  );
  assertEquals(await repo.commits.log(), [third]);
});

Deno.test("git().remotes.clone({ depth }) can make a shallow copy of multiple branches", async () => {
  await using remote = await tempRepository();
  await remote.branches.checkout({ create: "branch1" });
  const first = await remote.commits.create("commit1", { allowEmpty: true });
  await remote.branches.checkout({ create: "branch2" });
  await remote.commits.create("commit2", { allowEmpty: true });
  const third = await remote.commits.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    { branch: "branch1", depth: 1, local: false, singleBranch: false },
  );
  assertEquals(await repo.commits.log(), [first]);
  await repo.branches.checkout({ target: "branch2" });
  assertEquals(await repo.commits.log(), [third]);
});

Deno.test("git().remotes.clone({ local }) is no-op for local remote", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", {
    allowEmpty: true,
  });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    {
      local: true,
    },
  );
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().remotes.clone({ singleBranch }) copies a single branch", async () => {
  await using remote = await tempRepository();
  await remote.branches.checkout({ create: "branch1" });
  const first = await remote.commits.create("commit1", { allowEmpty: true });
  const second = await remote.commits.create("commit2", {
    allowEmpty: true,
  });
  await remote.branches.checkout({ create: "branch2" });
  await remote.commits.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).remotes.clone(
    remote.path(),
    { branch: "branch1", singleBranch: true },
  );
  assertEquals(await repo.commits.log(), [second, first]);
  await assertRejects(
    () => repo.branches.checkout({ target: "branch2" }),
    GitError,
  );
});

Deno.test("git().tags().remotes.add() adds remote URL", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  const remote = await repo.remotes.add(other.path());
  assertEquals(remote.fetchUrl, other.path());
  assertEquals(remote.pushUrl, other.path());
});

Deno.test("git().remotes.add() cannot add to the same remote", async () => {
  await using remote = await tempRepository();
  await using repo = await tempRepository();
  await repo.remotes.add(remote.path());
  await assertRejects(() => repo.remotes.add(remote.path()), GitError);
});

Deno.test("git().remotes.add() can add multiple remotes", async () => {
  await using other1 = await tempRepository();
  await using other2 = await tempRepository();
  await using repo = await tempRepository();
  const remote1 = await repo.remotes.add(other1.path(), "remote1");
  const remote2 = await repo.remotes.add(other2.path(), "remote2");
  assertEquals(await repo.remotes.get("remote1"), remote1);
  assertEquals(await repo.remotes.get("remote2"), remote2);
});

Deno.test("git().remotes.get() returns remote URL", async () => {
  await using other = await tempRepository();
  await using repo = await tempRepository();
  await repo.remotes.add(other.path(), "upstream");
  const remote = await repo.remotes.get("upstream");
  assertEquals(remote.pushUrl, other.path());
});

Deno.test("git().remotes.get() rejects unknown remote", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.remotes.get("remote"), GitError);
});

Deno.test("git().remotes.head() returns remote default branch", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  const branch = await remote.branches.current();
  await using repo = await tempRepository({ clone: remote });
  assertEquals(await repo.remotes.head(), branch?.name);
});

Deno.test("git().remotes.head() detecs updated remote head", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.branches.checkout({ create: "branch" });
  assertEquals(await repo.remotes.head(), "branch");
});

Deno.test("git().remotes.head() detects detached remote head", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.branches.checkout({ detach: true });
  await remote.commits.create("commit", { allowEmpty: true });
  assertEquals(await repo.remotes.head(), undefined);
});

Deno.test("git().remotes.push() pushes current branch to remote", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit1 = await repo.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commits.create("commit2", { allowEmpty: true });
  await repo.remotes.push();
  assertEquals(await remote.commits.log(), [commit2, commit1]);
});

Deno.test("git().remotes.push() rejects unsynced push", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: remote });
  await using repo2 = await tempRepository({ clone: remote });
  await repo1.commits.create("commit1", { allowEmpty: true });
  await repo2.commits.create("commit2", { allowEmpty: true });
  await repo1.remotes.push();
  await assertRejects(() => repo2.remotes.push(), GitError);
});

Deno.test("git().remotes.push({ target }) pushes branch to a remote branch", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.create("branch");
  await repo.remotes.push({ target: branch });
  assertEquals(await repo.branches.list({ name: "branch" }), [
    { name: "branch", commit },
  ]);
  assertEquals(await remote.branches.list({ name: "branch" }), [
    { name: "branch", commit },
  ]);
});

Deno.test("git().remotes.push({ setUpstream }) sets upstream tracking", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.create("branch");
  await repo.remotes.push({ target: branch, setUpstream: true });
  assertEquals(await repo.branches.list({ name: "branch" }), [
    {
      name: "branch",
      push: "origin/branch",
      upstream: "origin/branch",
      commit,
    },
  ]);
});

Deno.test("git().remotes.push({ remote }) pushes commits to a remote with branch", async () => {
  await using remote = await tempRepository({ bare: true });
  const branch = await remote.branches.current();
  assertExists(branch);
  await using repo = await tempRepository();
  await repo.remotes.add(remote.path(), "remote");
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.remotes.push({ remote: "remote", target: branch });
  assertEquals(await remote.commits.log(), [commit]);
});

Deno.test("git().remotes.push({ force }) force pushes", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: remote });
  await using repo2 = await tempRepository({ clone: remote });
  await repo1.commits.create("commit1", { allowEmpty: true });
  const commit2 = await repo2.commits.create("commit2", { allowEmpty: true });
  await repo1.remotes.push();
  await repo2.remotes.push({ force: true });
  assertEquals(await remote.commits.log(), [commit2]);
});

Deno.test("git().remotes.push({ tags }) pushes all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await repo.commits.create("commit", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const tag2 = await repo.tags.create("tag2");
  await repo.remotes.push({ tags: true });
  assertEquals(await remote.tags.list(), [tag1, tag2]);
});

Deno.test("git().remotes.push({ branches }) pushes all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit1 = await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch2");
  await repo.remotes.push({ branches: true });
  assertEquals(await repo.branches.list({ name: "branch*" }), [
    { name: "branch1", commit: commit1 },
    { name: "branch2", commit: commit2 },
  ]);
  assertEquals(await remote.branches.list({ name: "branch*" }), [
    { name: "branch1", commit: commit1 },
    { name: "branch2", commit: commit2 },
  ]);
});

Deno.test("git().remotes.pull() pulls commits and tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag = await other.tags.create("tag");
  await other.remotes.push();
  await other.tags.push(tag);
  await repo.remotes.pull();
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), [tag]);
});

Deno.test("git().remotes.pull() does not fetch all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag1 = await other.tags.create("tag1");
  await other.remotes.push();
  await other.tags.push(tag1);
  await other.branches.checkout({ create: "branch" });
  await other.commits.create("commit2", { allowEmpty: true });
  const tag2 = await other.tags.create("tag2");
  await other.tags.push(tag2);
  await repo.remotes.pull();
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), [tag1]);
});

Deno.test("git().remotes.pull({ remote }) pulls from a remote with branch", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", {
    allowEmpty: true,
  });
  const branch = await remote.branches.current();
  assertExists(branch);
  await using repo = await tempRepository();
  await repo.remotes.add(remote.path(), "remote");
  await repo.remotes.pull({ remote: "remote", target: branch });
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().remotes.pull({ tags }) can skip tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag = await other.tags.create("tag");
  await other.remotes.push();
  await other.tags.push(tag);
  await repo.remotes.pull({ tags: false });
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), []);
});

Deno.test("git().remotes.pull({ tags }) can fetch all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag1 = await other.tags.create("tag1");
  await other.remotes.push();
  await other.tags.push(tag1);
  await other.branches.checkout({ create: "branch" });
  await other.commits.create("commit2", { allowEmpty: true });
  const tag2 = await other.tags.create("tag2");
  await other.tags.push(tag2);
  await repo.remotes.pull({ tags: true });
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), [tag1, tag2]);
});

Deno.test("git().remotes.pull({ sign }) cannot use wrong key", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await assertRejects(() => repo.remotes.pull({ sign: "not-a-key" }), GitError);
});
