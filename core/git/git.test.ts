import { tempRepository } from "@roka/git/testing";
import { tempDirectory } from "@roka/testing/temp";
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { git, GitError } from "./git.ts";

Deno.test("git() mentions failed command on error", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await assertRejects(
    () => repo.tags.create("no commit"),
    GitError,
    'Error running git command: git tag "no commit"',
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

Deno.test("git().init() creates a repo", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init();
  assertEquals((await Deno.stat(repo.path(".git"))).isDirectory, true);
});

Deno.test("git().init() creates a repo with initial branch", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init({ branch: "commit" });
  assertEquals(await repo.branches.current(), "commit");
  await repo.init();
});

Deno.test("git().clone() clones a repo", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("first", { allowEmpty: true });
  await remote.commits.create("second", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path());
  assertEquals(await repo.commits.log(), await remote.commits.log());
});

Deno.test("git().clone() clones a repo with remote name", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { remote: "remote" });
  assertEquals(await repo.commits.log(), await remote.commits.log());
});

Deno.test("git().clone() checks out a branch", async () => {
  await using remote = await tempRepository();
  const target = await remote.commits.create("first", { allowEmpty: true });
  await remote.commits.create("second", { allowEmpty: true });
  await remote.branches.checkout({ target, new: "branch" });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { branch: "branch" });
  assertEquals(await repo.commits.log(), [target]);
});

Deno.test("git().clone() can do a shallow copy", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("first", { allowEmpty: true });
  await remote.commits.create("second", { allowEmpty: true });
  const third = await remote.commits.create("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { depth: 1, local: false });
  assertEquals(await repo.commits.log(), [third]);
});

Deno.test("git().clone({ local: true }) is no-op for local remote", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", {
    allowEmpty: true,
  });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { local: true });
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().clone() can do a shallow copy of multiple branches", async () => {
  await using remote = await tempRepository();
  await remote.branches.checkout({ new: "branch1" });
  const first = await remote.commits.create("first", { allowEmpty: true });
  await remote.branches.checkout({ new: "branch2" });
  await remote.commits.create("second", { allowEmpty: true });
  const third = await remote.commits.create("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), {
    branch: "branch1",
    depth: 1,
    local: false,
    singleBranch: false,
  });
  assertEquals(await repo.commits.log(), [first]);
  await repo.branches.checkout({ target: "branch2" });
  assertEquals(await repo.commits.log(), [third]);
});

Deno.test("git().clone() can copy a single branch", async () => {
  await using remote = await tempRepository();
  await remote.branches.checkout({ new: "branch1" });
  const first = await remote.commits.create("first", { allowEmpty: true });
  const second = await remote.commits.create("second", {
    allowEmpty: true,
  });
  await remote.branches.checkout({ new: "branch2" });
  await remote.commits.create("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), {
    branch: "branch1",
    singleBranch: true,
  });
  assertEquals(await repo.commits.log(), [second, first]);
  await assertRejects(
    () => repo.branches.checkout({ target: "branch2" }),
    GitError,
  );
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

Deno.test("git().branches.get() returns current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ new: "branch" });
  assertEquals(await repo.branches.current(), "branch");
});

Deno.test("git().branches.get() is undefined on detached state", async () => {
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
  await repo.commits.create("commit", { allowEmpty: true });
  assertEquals(await repo.branches.list(), ["main"]);
  await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), ["branch", "main"]);
});

Deno.test("git().branches.list() returns all branches in detached HEAD", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ detach: true });
  await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), ["branch", "main"]);
});

Deno.test("git().branches.list() matches branch name", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch1");
  await repo.branches.create("branch2");
  assertEquals(await repo.branches.list({ name: "branch2" }), ["branch2"]);
});

Deno.test("git().branches.list() matches branch pattern", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch1");
  await repo.branches.create("branch2");
  assertEquals(await repo.branches.list({ name: "branch*" }), [
    "branch1",
    "branch2",
  ]);
});

Deno.test("git().branches.list() can return all branches", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("remote");
  await using repo = await tempRepository({ clone: remote });
  await repo.branches.create("local");
  assertEquals(await repo.branches.list({ all: true }), [
    "local",
    "main",
    "origin/main",
    "origin/remote",
  ]);
});

Deno.test("git().branches.list() can return only remote branches", async () => {
  await using remote = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await remote.commits.create("commit", { allowEmpty: true });
  await remote.branches.create("remote");
  await using repo = await tempRepository({ clone: remote });
  await repo.branches.create("local");
  assertEquals(await repo.branches.list({ remotes: true }), [
    "origin/main",
    "origin/remote",
  ]);
});

Deno.test("git().branches.list() returns branches that contain commit", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.branches.create("branch2");
  assertEquals(await repo.branches.list({ contains: commit1 }), [
    "branch1",
    "branch2",
    "main",
  ]);
  assertEquals(await repo.branches.list({ contains: commit2 }), [
    "branch2",
    "main",
  ]);
});

Deno.test("git().branches.list() returns branches that do not contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.branches.create("branch2");
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(await repo.branches.list({ noContains: commit1 }), []);
  assertEquals(await repo.branches.list({ noContains: commit2 }), ["branch1"]);
});

Deno.test("git().branches.list() returns branches that point to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.create("branch1");
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.branches.create("branch2");
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(await repo.branches.list({ pointsAt: commit1 }), ["branch1"]);
  assertEquals(await repo.branches.list({ pointsAt: commit2 }), ["branch2"]);
});

Deno.test("git().branches.checkout() stays at current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.current();
  await repo.branches.checkout();
  assertEquals(await repo.branches.current(), branch);
});

Deno.test("git().branches.checkout() switches to branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.checkout({ new: "branch" });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.branches.current(), "branch");
  assertEquals(await repo.commits.log(), [commit2, commit1]);
  await repo.branches.checkout({ target: "main" });
  assertEquals(await repo.branches.current(), "main");
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ target: "branch" });
  assertEquals(await repo.branches.current(), "branch");
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().branches.checkout() switches to commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.checkout({ target: commit1 });
  assertEquals(await repo.branches.current(), undefined);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ new: "branch" });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.branches.checkout({ target: commit1 });
  assertEquals(await repo.branches.current(), undefined);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ target: commit2 });
  assertEquals(await repo.branches.current(), undefined);
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().branches.checkout() can detach", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.current();
  await repo.branches.checkout();
  assertEquals(await repo.branches.current(), branch);
});

Deno.test("git().branches.create() creates a branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch");
  assertNotEquals(await repo.branches.current(), "branch");
  assertEquals(await repo.branches.list(), ["branch", "main"]);
});

Deno.test("git().branches.delete() rejects current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const current = await repo.branches.current();
  assertExists(current);
  await assertRejects(() => repo.branches.delete(current), GitError);
});

Deno.test("git().branches.delete() can delete from detached HEAD", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const current = await repo.branches.current();
  assertExists(current);
  await repo.branches.checkout({ detach: true });
  await repo.branches.delete(current);
  assertEquals(await repo.branches.list(), []);
});

Deno.test("git().branches.delete() can delete branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch");
  assertEquals(await repo.branches.list(), ["branch", "main"]);
  await repo.branches.delete("branch");
  assertEquals(await repo.branches.list(), ["main"]);
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

Deno.test("git().branches.delete() can force delete unmerged branch", async () => {
  await using repo = await tempRepository({
    config: { init: { defaultBranch: "main" } },
  });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.create("branch");
  await repo.branches.checkout({ target: "branch" });
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ target: "main" });
  await repo.branches.delete("branch", { force: true });
  assertEquals(await repo.branches.list(), ["main"]);
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

Deno.test("git().index.add() can force add ignored file", async () => {
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

Deno.test("git().index.add() can add file as executable", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file", { executable: true });
  const commit = await repo.commits.create("commit");
  await repo.index.remove("file", { force: true });
  await repo.commits.create("commit");
  await repo.branches.checkout({ target: commit });
  const stat = await Deno.stat(repo.path("file"));
  assertEquals((stat.mode ?? 0) & 0o111, 0o111);
});

Deno.test("git().index.add() can add file as non-executable", async () => {
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

Deno.test("git().index.remove() removes files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("first");
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

Deno.test("git().index.remove() can force remove modified file", async () => {
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

Deno.test("git().index.status() lists staged type changed file", async () => {
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
  await Deno.rename(repo.path("old.file"), repo.path("file"));
  await repo.index.add("file");
  await repo.index.remove("old.file");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file", status: "renamed", from: "old.file" }],
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

Deno.test("git().index.status() lists unstaged type changed file", async () => {
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

Deno.test("git().index.status() can ignore renames", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await repo.index.add("old.file");
  await repo.commits.create("commit");
  await Deno.rename(repo.path("old.file"), repo.path("file"));
  await repo.index.add("file");
  await repo.index.remove("old.file");
  assertEquals(await repo.index.status({ renames: false }), {
    staged: [
      { path: "file", status: "added" },
      { path: "old.file", status: "deleted" },
    ],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists untracked files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "file" }],
    ignored: [],
  });
});

Deno.test("git().index.status() can skip untracked files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status({ untracked: false }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().index.status() lists untracked directories", async () => {
  await using repo = await tempRepository();
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "directory/" }],
    ignored: [],
  });
});

Deno.test("git().index.status() can list files under untracked directories", async () => {
  await using repo = await tempRepository();
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  assertEquals(await repo.index.status({ untracked: "all" }), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "directory/file" }],
    ignored: [],
  });
});

Deno.test("git().index.status() skips ignored files", async () => {
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
});

Deno.test("git().index.status() can list ignored files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content");
  assertEquals(await repo.index.status({ ignored: true }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [{ path: "file" }],
  });
});

Deno.test("git().index.status() lists ignored directories", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "directory/");
  await repo.index.add(".gitignore");
  await repo.commits.create("commit");
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  assertEquals(await repo.index.status({ ignored: true, untracked: true }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [{ path: "directory/" }],
  });
});

Deno.test("git().index.status() can list files under ignored directories", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path(".gitignore"), "directory/");
  await repo.index.add(".gitignore");
  await repo.commits.create("commit");
  await Deno.mkdir(repo.path("directory"));
  await Deno.writeTextFile(repo.path("directory/file"), "content");
  assertEquals(await repo.index.status({ ignored: true, untracked: "all" }), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [{ path: "directory/file" }],
  });
});

Deno.test("git().index.status() can filter by path", async () => {
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

Deno.test("git().commits.create() creates a commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("summary");
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commits.create() creates a commit with body", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("summary", {
    body: "body",
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commits.create() ignores empty body", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("summary", {
    body: "",
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commits.create() creates a commit with trailers", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("summary", {
    trailers: { key1: "value1", key2: "value2\n  multi\n  line" },
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2 multi line" });
});

Deno.test("git().commits.create() creates a commit with body and trailers", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("summary", {
    body: "body",
    trailers: { key: "value" },
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key: "value" });
});

Deno.test("git().commits.create() can automatically add files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content1");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content2");
  const commit = await repo.commits.create("commit", { all: true });
  assertEquals(await repo.commits.head(), commit);
});

Deno.test("git().commits.create() can automatically remove files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  await Deno.remove(repo.path("file"));
  const commit = await repo.commits.create("commit", { all: true });
  assertEquals(await repo.commits.head(), commit);
});

Deno.test("git().commits.create() can amend a commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commits.create("commit");
  const commit = await repo.commits.create("new summary", { amend: true });
  assertEquals(commit?.summary, "new summary");
});

Deno.test("git().commits.create() rejects empty commit", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.create("commit"), GitError);
});

Deno.test("git().commits.create() can create empty commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  assertEquals(commit?.summary, "commit");
});

Deno.test("git().commits.create() can set author", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", {
    author: { name: "name", email: "email@example.com" },
    allowEmpty: true,
  });
  assertEquals(commit?.author, { name: "name", email: "email@example.com" });
});

Deno.test("git().commits.create() can set committer", async () => {
  await using repo = await tempRepository({
    config: { user: { name: "name", email: "email@example.com" } },
  });
  const commit = await repo.commits.create("commit", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(commit?.committer, { name: "name", email: "email@example.com" });
});

Deno.test("git().commits.create() reject empty summary", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commits.create("", { allowEmpty: true }),
    GitError,
  );
});

Deno.test("git().commits.create() cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () =>
      repo.commits.create("commit", { allowEmpty: true, sign: "not-a-key" }),
    GitError,
  );
});

Deno.test("git().commits.head() rejects empty repo", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.head(), GitError);
});

Deno.test("git().commits.head() returns head tip", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("first", { allowEmpty: true });
  const commit = await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.commits.head(), commit);
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
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().commits.log() can parse message body", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create(
    "summary\n\nbody\n\nkey1: value1\nkey2: value2\n",
    { allowEmpty: true },
  );
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().commits.log() can work with custom trailer separator", async () => {
  await using repo = await tempRepository({
    config: { trailer: { separators: "#" } },
  });
  const commit = await repo.commits.create(
    "summary\n\nbody\n\nkey1 #value1\nkey2 #value2\n",
    { allowEmpty: true },
  );
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().commits.log() can limit number of commits", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("third", { allowEmpty: true });
  assertEquals(await repo.commits.log({ maxCount: 2 }), [commit3, commit2]);
});

Deno.test("git().commits.log() can skip commits", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("first", { allowEmpty: true });
  await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.commits.log({ skip: 1, maxCount: 1 }), [commit]);
});

Deno.test("git().commits.log() returns file changes", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("first");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("second");
  assertEquals(await repo.commits.log({ paths: ["file1"] }), [commit1]);
  assertEquals(await repo.commits.log({ paths: ["file2"] }), [commit2]);
  assertEquals(await repo.commits.log({ paths: ["file1", "file2"] }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().commits.log() returns blame", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("second");
  assertEquals(await repo.commits.log({ text: "content1" }), [commit1]);
  assertEquals(await repo.commits.log({ text: "content2" }), [commit2]);
});

Deno.test("git().commits.log() returns blame from multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("second");
  assertEquals(await repo.commits.log({ text: "content" }), [commit2, commit1]);
});

Deno.test("git().commits.log() returns blame from specific file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("second");
  assertEquals(await repo.commits.log({ paths: ["file1"], text: "content" }), [
    commit1,
  ]);
  assertEquals(await repo.commits.log({ paths: ["file2"], text: "content" }), [
    commit2,
  ]);
});

Deno.test("git().commits.log() can match extended regexp", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.index.add("file1");
  const commit1 = await repo.commits.create("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.index.add("file2");
  const commit2 = await repo.commits.create("second");
  assertEquals(await repo.commits.log({ text: "content[12]" }), [
    commit2,
    commit1,
  ]);
  assertEquals(await repo.commits.log({ text: ".+\d?" }), [commit2, commit1]);
});

Deno.test("git().commits.log() returns commit descendants", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.commits.log({ range: { from: commit1 } }), [commit2]);
});

Deno.test("git().commits.log() returns commit ancestors", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(await repo.commits.log({ range: { to: commit2 } }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().commits.log() returns commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("third", { allowEmpty: true });
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: { from: commit1, to: commit3 } }),
    [
      commit3,
      commit2,
    ],
  );
});

Deno.test("git().commits.log() returns interprets range as asymmetric", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("third", { allowEmpty: true });
  await repo.commits.create("fourth", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: { from: commit3, to: commit1 } }),
    [],
  );
});

Deno.test("git().commits.log() returns symmetric commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("third", { allowEmpty: true });
  await repo.commits.create("third", { allowEmpty: true });
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

Deno.test("git().commits.log() ignores empty range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("third", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: {} }),
    [
      commit3,
      commit2,
      commit1,
    ],
  );
});

Deno.test("git().commits.log() can filter by author", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", {
    author: { name: "name1", email: "email1@example.com" },
    allowEmpty: true,
  });
  const commit2 = await repo.commits.create("second", {
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

Deno.test("git().commits.log() can filter by committer", async () => {
  await using repo = await tempRepository();
  await repo.config.set({
    user: { name: "name1", email: "email1@example.com" },
  });
  const commit1 = await repo.commits.create("first", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  await repo.config.set({
    user: { name: "name2", email: "email2@example.com" },
  });
  const commit2 = await repo.commits.create("second", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.commits.log({
      committer: { name: "name1", email: "email1@example.com" },
    }),
    [commit1],
  );
  assertEquals(
    await repo.commits.log({
      committer: { name: "name2", email: "email2@example.com" },
    }),
    [commit2],
  );
});

Deno.test("git().commits.push() pushes commits to remote", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.commits.push();
  assertEquals(await remote.commits.log(), [commit2, commit1]);
});

Deno.test("git().commits.push() pushes commits to remote with name", async () => {
  await using remote = await tempRepository({ bare: true });
  const branch = await remote.branches.current();
  assertExists(branch);
  await using repo = await tempRepository();
  await repo.remotes.add(remote.path(), "remote");
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.commits.push({ remote: "remote", branch });
  assertEquals(await remote.commits.log(), [commit]);
});

Deno.test("git().commits.push() can push tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag");
  await repo.commits.push({ tags: true });
  assertEquals(await remote.tags.list(), [tag]);
});

Deno.test("git().commits.push() rejects unsynced push", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: remote });
  await using repo2 = await tempRepository({ clone: remote });
  await repo1.commits.create("first", { allowEmpty: true });
  await repo2.commits.create("second", { allowEmpty: true });
  await repo1.commits.push();
  await assertRejects(() => repo2.commits.push(), GitError);
});

Deno.test("git().commits.push() can force push", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: remote });
  await using repo2 = await tempRepository({ clone: remote });
  await repo1.commits.create("first", { allowEmpty: true });
  const commit2 = await repo2.commits.create("second", { allowEmpty: true });
  await repo1.commits.push();
  await repo2.commits.push({ force: true });
  assertEquals(await remote.commits.log(), [commit2]);
});

Deno.test("git().commits.pull() pulls commits and tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag = await other.tags.create("tag");
  await other.commits.push();
  await other.tags.push(tag);
  await repo.commits.pull();
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), [tag]);
});

Deno.test("git().commits.pull() can pull from remote with name", async () => {
  await using remote = await tempRepository();
  const commit = await remote.commits.create("commit", {
    allowEmpty: true,
  });
  const branch = await remote.branches.current();
  assertExists(branch);
  await using repo = await tempRepository();
  await repo.remotes.add(remote.path(), "remote");
  await repo.commits.pull({ remote: "remote", branch });
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().commits.pull() can skip tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag = await other.tags.create("tag");
  await other.commits.push();
  await other.tags.push(tag);
  await repo.commits.pull({ tags: false });
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), []);
});

Deno.test("git().commits.pull() does not fetch all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag1 = await other.tags.create("tag1");
  await other.commits.push();
  await other.tags.push(tag1);
  await other.branches.checkout({ new: "branch" });
  await other.commits.create("second", { allowEmpty: true });
  const tag2 = await other.tags.create("tag2");
  await other.tags.push(tag2);
  await repo.commits.pull();
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), [tag1]);
});

Deno.test("git().commits.pull() can fetch all tags", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await using other = await tempRepository({ clone: remote });
  const commit = await other.commits.create("commit", { allowEmpty: true });
  const tag1 = await other.tags.create("tag1");
  await other.commits.push();
  await other.tags.push(tag1);
  await other.branches.checkout({ new: "branch" });
  await other.commits.create("second", { allowEmpty: true });
  const tag2 = await other.tags.create("tag2");
  await other.tags.push(tag2);
  await repo.commits.pull({ tags: true });
  assertEquals(await repo.commits.log(), [commit]);
  assertEquals(await repo.tags.list(), [tag1, tag2]);
});

Deno.test("git().commits.pull() cannot use wrong key", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await assertRejects(() => repo.commits.pull({ sign: "not-a-key" }), GitError);
});

Deno.test("git().tags.create() creates a lightweight tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag");
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tags.create() creates an annotated tag", async () => {
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

Deno.test("git().tags.create() ignores empty body", async () => {
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

Deno.test("git().tags.create() creates a tag with commit", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag", { commit });
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tags.create() creates a tag with another tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commits.create("commit", { allowEmpty: true });
  await repo.tags.create("tag1");
  await repo.tags.create("tag2", { commit: "tag1" });
  const tags = await repo.tags.list();
  assertEquals(tags, [
    { name: "tag1", commit },
    { name: "tag2", commit },
  ]);
});

Deno.test("git().tags.create() cannot create duplicate tag", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.tags.create("tag");
  await assertRejects(() => repo.tags.create("tag"), GitError);
});

Deno.test("git().tags.create() can force move a tag", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("first", { allowEmpty: true });
  await repo.tags.create("tag");
  await repo.commits.create("second", { allowEmpty: true });
  await repo.tags.create("tag", { force: true });
});

Deno.test("git().tags.create() cannot use wrong key", async () => {
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

Deno.test("git().tags.list() can sort by version", async () => {
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

Deno.test("git().tags.list() can sort by pre-release version", async () => {
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

Deno.test("git().tags.list() matches tag name", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.tags.create("tag1");
  const tag2 = await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ name: "tag2" }), [tag2]);
});

Deno.test("git().tags.list() matches tag pattern", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const tag2 = await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ name: "tag*" }), [tag1, tag2]);
});

Deno.test("git().tags.list() returns tags that contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const tag2 = await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ contains: commit1 }), [tag1, tag2]);
  assertEquals(await repo.tags.list({ contains: commit2 }), [tag2]);
});

Deno.test("git().tags.list() returns tags that do not contain commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.tags.create("tag2");
  assertEquals(await repo.tags.list({ noContains: commit1 }), []);
  assertEquals(await repo.tags.list({ noContains: commit2 }), [tag1]);
});

Deno.test("git().tags.list() returns tags that point to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const tag1 = await repo.tags.create("tag1");
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const tag2 = await repo.tags.create("tag2", { subject: "subject" });
  assertEquals(await repo.tags.list({ pointsAt: commit1 }), [tag1]);
  assertEquals(await repo.tags.list({ pointsAt: commit2 }), [tag2]);
});

Deno.test("git().tags.list() returns commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: { from: commit1, to: commit2 } }),
    [commit2],
  );
});

Deno.test("git().tags.push() pushes tags to remote", async () => {
  await using remote = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remote });
  await repo.commits.create("commit", { allowEmpty: true });
  const tag = await repo.tags.create("tag");
  await repo.commits.push();
  await repo.tags.push(tag);
  assertEquals(await repo.tags.list(), [tag]);
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

Deno.test("git().tags.push() can force override remote tag", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  await remote.commits.create("new", { allowEmpty: true });
  await remote.tags.create("tag");
  await repo.tags.create("tag");
  await repo.tags.push("tag", { force: true });
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

Deno.test("git().remotes.defaultBranch() returns remote default branch", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("commit", { allowEmpty: true });
  const branch = await remote.branches.current();
  await using repo = await tempRepository({ clone: remote });
  assertEquals(await repo.remotes.defaultBranch(), branch);
});

Deno.test("git().remotes.defaultBranch() detects detached remote head", async () => {
  await using remote = await tempRepository();
  await remote.commits.create("first", { allowEmpty: true });
  await remote.branches.checkout({ detach: true });
  await remote.commits.create("second", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remote });
  assertEquals(await repo.remotes.defaultBranch(), undefined);
});
