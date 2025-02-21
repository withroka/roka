import { git, GitError } from "@roka/git";
import { tempRepository } from "@roka/git/testing";
import { tempDirectory } from "@roka/testing";
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "@std/assert";

Deno.test("git().init() creates a repo", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init();
  assert((await Deno.stat(repo.path(".git"))).isDirectory);
});

Deno.test("git().init() creates a repo with initial branch", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init({ branch: "commit" });
  assertEquals(await repo.branches.get(), "commit");
  await repo.init();
});

Deno.test("git().clone() clones a repo", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("first", { allowEmpty: true });
  await remoteRepo.commits.create("second", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path());
  assertEquals(await repo.commits.log(), await remoteRepo.commits.log());
});

Deno.test("git().clone() clones a repo with remote name", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path(), { remote: "remote" });
  assertEquals(await repo.commits.log(), await remoteRepo.commits.log());
});

Deno.test("git().clone() checks out a branch", async () => {
  await using remoteRepo = await tempRepository();
  const target = await remoteRepo.commits.create("first", { allowEmpty: true });
  await remoteRepo.commits.create("second", { allowEmpty: true });
  await remoteRepo.branches.checkout({ target, new: "branch" });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path(), { branch: "branch" });
  assertEquals(await repo.commits.log(), [target]);
});

Deno.test("git().clone() can do a shallow copy", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("first", { allowEmpty: true });
  await remoteRepo.commits.create("second", { allowEmpty: true });
  const third = await remoteRepo.commits.create("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path(), { depth: 1, local: false });
  assertEquals(await repo.commits.log(), [third]);
});

Deno.test("git().clone() local is no-op for local remote", async () => {
  await using remoteRepo = await tempRepository();
  const commit = await remoteRepo.commits.create("commit", {
    allowEmpty: true,
  });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path(), { local: true });
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().clone() can do a shallow copy of multiple branches", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.branches.checkout({ new: "branch1" });
  const first = await remoteRepo.commits.create("first", { allowEmpty: true });
  await remoteRepo.branches.checkout({ new: "branch2" });
  await remoteRepo.commits.create("second", { allowEmpty: true });
  const third = await remoteRepo.commits.create("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path(), {
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
  await using remoteRepo = await tempRepository();
  await remoteRepo.branches.checkout({ new: "branch1" });
  const first = await remoteRepo.commits.create("first", { allowEmpty: true });
  const second = await remoteRepo.commits.create("second", {
    allowEmpty: true,
  });
  await remoteRepo.branches.checkout({ new: "branch2" });
  await remoteRepo.commits.create("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remoteRepo.path(), {
    branch: "branch1",
    singleBranch: true,
  });
  assertEquals(await repo.commits.log(), [second, first]);
  await assertRejects(
    () => repo.branches.checkout({ target: "branch2" }),
    GitError,
  );
});

Deno.test("git().config.set configures user", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init();
  await repo.config.set({ user: { name: "name", email: "email" } });
  const commit = await repo.commits.create("commit", {
    sign: false,
    allowEmpty: true,
  });
  assertEquals(commit?.author, { name: "name", email: "email" });
});

Deno.test("git().branches.get() returns current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  await repo.branches.checkout({ new: "branch" });
  assertEquals(await repo.branches.get(), "branch");
});

Deno.test("git().branches.get() is undefined on detached state", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  assertNotEquals(await repo.branches.get(), undefined);
  await repo.branches.checkout({ detach: true });
  assertEquals(await repo.branches.get(), undefined);
});

Deno.test("git().branches.checkout() stays at current branch", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.get();
  await repo.branches.checkout();
  assertEquals(await repo.branches.get(), branch);
});

Deno.test("git().branches.checkout() switches to branch", async () => {
  await using repo = await tempRepository();
  const main = await repo.branches.get();
  assertExists(main);
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.checkout({ new: "branch" });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.branches.get(), "branch");
  assertEquals(await repo.commits.log(), [commit2, commit1]);
  await repo.branches.checkout({ target: main });
  assertEquals(await repo.branches.get(), main);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ target: "branch" });
  assertEquals(await repo.branches.get(), "branch");
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().branches.checkout() switches to commit", async () => {
  await using repo = await tempRepository();
  const main = await repo.branches.get();
  assertExists(main);
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  await repo.branches.checkout({ target: commit1 });
  assertEquals(await repo.branches.get(), undefined);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ new: "branch" });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  await repo.branches.checkout({ target: commit1 });
  assertEquals(await repo.branches.get(), undefined);
  assertEquals(await repo.commits.log(), [commit1]);
  await repo.branches.checkout({ target: commit2 });
  assertEquals(await repo.branches.get(), undefined);
  assertEquals(await repo.commits.log(), [commit2, commit1]);
});

Deno.test("git().branches.checkout() can detach", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("commit", { allowEmpty: true });
  const branch = await repo.branches.get();
  await repo.branches.checkout();
  assertEquals(await repo.branches.get(), branch);
});

Deno.test("git().index.add() adds files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commits.create("commit");
  assertEquals(commit?.summary, "commit");
});

Deno.test("git().index.add() fails to add non-existent file", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.index.add("file"), GitError);
});

Deno.test("git().index.remove() fails to remove non-existent file", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.index.remove("file"), GitError);
});

Deno.test("git().index.remove() removes files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  repo.index.add("file");
  await repo.commits.create("first");
  repo.index.remove("file");
  await repo.commits.create("second");
  await assertRejects(() => Deno.stat(repo.path("file")), Deno.errors.NotFound);
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

Deno.test("git().commits.create() disallows empty commit", async () => {
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
  await using repo = await tempRepository();
  await repo.config.set({ user: { name: "name", email: "email@example.com" } });
  const commit = await repo.commits.create("commit", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(commit?.committer, { name: "name", email: "email@example.com" });
});

Deno.test("git().commits.create() summary cannot be empty", async () => {
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

Deno.test("git().commits.head() fails on empty repo", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.head(), GitError);
});

Deno.test("git().commits.head() returns head tip", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("first", { allowEmpty: true });
  const commit = await repo.commits.create("second", { allowEmpty: true });
  assertEquals(await repo.commits.head(), commit);
});

Deno.test("git().commits.log() fails on empty repo", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.commits.log()), GitError;
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
  await using repo = await tempRepository();
  await repo.config.set({ trailer: { separators: "#" } });
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

Deno.test("git().commits.log() returns commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("second", { allowEmpty: true });
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
  const commit3 = await repo.commits.create("second", { allowEmpty: true });
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({ range: { from: commit3, to: commit1 } }),
    [],
  );
});

Deno.test("git().commits.log() returns symmetric commit range", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commits.create("first", { allowEmpty: true });
  const commit2 = await repo.commits.create("second", { allowEmpty: true });
  const commit3 = await repo.commits.create("second", { allowEmpty: true });
  await repo.commits.create("third", { allowEmpty: true });
  assertEquals(
    await repo.commits.log({
      range: { from: commit3, to: commit1, symmetric: true },
    }),
    [commit3, commit2],
  );
});

Deno.test("git().commits.log() filters by author", async () => {
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

Deno.test("git().commits.log() filters by committer", async () => {
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
  const branch = await remote.branches.get();
  assert(branch);
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

Deno.test("git().commits.push() fails on unsynced push", async () => {
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
  await using remoteRepo = await tempRepository();
  const commit = await remoteRepo.commits.create("commit", {
    allowEmpty: true,
  });
  const branch = await remoteRepo.branches.get();
  assert(branch);
  await using repo = await tempRepository();
  await repo.remotes.add(remoteRepo.path(), "remote");
  await repo.commits.pull({ remote: "remote", branch });
  assertEquals(await repo.commits.log(), [commit]);
});

Deno.test("git().commits.pull() can skip tags", async () => {
  await using remoteRepo = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: remoteRepo });
  await using otherRepo = await tempRepository({ clone: remoteRepo });
  const commit = await otherRepo.commits.create("commit", { allowEmpty: true });
  await otherRepo.tags.create("tag");
  await otherRepo.commits.push();
  await otherRepo.tags.push("tag");
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
  await using repo = await tempRepository();
  await repo.config.set({
    user: { name: "tagger", email: "tagger@example.com" },
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
  await using repo = await tempRepository();
  await repo.config.set({
    user: { name: "tagger", email: "tagger@example.com" },
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

Deno.test("git().tags.list() return empty list on empty repo", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.tags.list(), []);
});

Deno.test("git().tags.list() return empty list on no tags repo", async () => {
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

Deno.test("git().tags.list() returns multiple tags with version sort", async () => {
  await using repo = await tempRepository();
  await repo.commits.create("first", { allowEmpty: true });
  const tag1 = await repo.tags.create("v1.0.0");
  await repo.commits.create("second", { allowEmpty: true });
  const tag2 = await repo.tags.create("v2.0.0");
  assertEquals(await repo.tags.list({ sort: "version" }), [tag2, tag1]);
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
  await repo.tags.push("tag");
  assertEquals(await repo.tags.list(), [tag]);
});

Deno.test("git().tags.push() cannot override remote tag", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remoteRepo });
  await remoteRepo.commits.create("new", { allowEmpty: true });
  await remoteRepo.tags.create("tag");
  await repo.tags.create("tag");
  await assertRejects(() => repo.tags.push("tag"), GitError);
});

Deno.test("git().tags.push() can force override remote tag", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remoteRepo });
  await remoteRepo.commits.create("new", { allowEmpty: true });
  await remoteRepo.tags.create("tag");
  await repo.tags.create("tag");
  await repo.tags.push("tag", { force: true });
});

Deno.test("git().remotes.add() adds remote URL", async () => {
  await using remoteRepo = await tempRepository();
  await using repo = await tempRepository();
  const remote = await repo.remotes.add(remoteRepo.path());
  assertEquals(remote.fetchUrl, remoteRepo.path());
  assertEquals(remote.pushUrl, remoteRepo.path());
});

Deno.test("git().remotes.add() cannot add to the same remote", async () => {
  await using remoteRepo = await tempRepository();
  await using repo = await tempRepository();
  await repo.remotes.add(remoteRepo.path());
  await assertRejects(() => repo.remotes.add(remoteRepo.path()), GitError);
});

Deno.test("git().remotes.add() cannot add multiple remotes", async () => {
  await using remoteRepo1 = await tempRepository();
  await using remoteRepo2 = await tempRepository();
  await using repo = await tempRepository();
  const remote1 = await repo.remotes.add(remoteRepo1.path(), "remote1");
  const remote2 = await repo.remotes.add(remoteRepo2.path(), "remote2");
  assertEquals(await repo.remotes.get("remote1"), remote1);
  assertEquals(await repo.remotes.get("remote2"), remote2);
});

Deno.test("git().remotes.get() returns remote URL", async () => {
  await using remoteRepo = await tempRepository();
  await using repo = await tempRepository();
  await repo.remotes.add(remoteRepo.path(), "upstream");
  const remote = await repo.remotes.get("upstream");
  assertEquals(remote.pushUrl, remoteRepo.path());
});

Deno.test("git().remotes.get() returns remote default branch", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("commit", { allowEmpty: true });
  const branch = await remoteRepo.branches.get();
  await using repo = await tempRepository({ clone: remoteRepo });
  const remote = await repo.remotes.get();
  assertEquals(remote.defaultBranch, branch);
});

Deno.test("git().remotes.get() detects detached remote head", async () => {
  await using remoteRepo = await tempRepository();
  await remoteRepo.commits.create("first", { allowEmpty: true });
  await remoteRepo.branches.checkout({ detach: true });
  await remoteRepo.commits.create("second", { allowEmpty: true });
  await using repo = await tempRepository({ clone: remoteRepo });
  const remote = await repo.remotes.get();
  assertEquals(remote.defaultBranch, undefined);
});

Deno.test("git().remotes.get() fails on unknown remote", async () => {
  await using repo = await tempRepository();
  await assertRejects(() => repo.remotes.get("remote"), GitError);
});
