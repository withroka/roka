import { git, GitError } from "@roka/git";
import { tempRepo } from "@roka/git/testing";
import { tempDirectory } from "@roka/testing";
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "@std/assert";

Deno.test("git().config() configures user", async () => {
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.init();
  await repo.config({ user: { name: "name", email: "email" } });
  const commit = await repo.commit("commit", { sign: false, allowEmpty: true });
  assertEquals(commit?.author, { name: "name", email: "email" });
});

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
  assertEquals(await repo.branch(), "commit");
  await repo.init();
});

Deno.test("git().clone() clones a repo", async () => {
  await using remote = await tempRepo();
  await remote.commit("first", { allowEmpty: true });
  await remote.commit("second", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path());
  assertEquals(await repo.remote(), remote.path());
  assertEquals(await repo.log(), await remote.log());
});

Deno.test("git().clone() clones a repo with remote name", async () => {
  await using remote = await tempRepo();
  await remote.commit("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { remote: "remote" });
  assertEquals(await repo.remote({ remote: "remote" }), remote.path());
  assertEquals(await repo.log(), await remote.log());
});

Deno.test("git().clone() checks out a branch", async () => {
  await using remote = await tempRepo();
  const target = await remote.commit("first", { allowEmpty: true });
  await remote.commit("second", { allowEmpty: true });
  await remote.checkout({ target, newBranch: "branch" });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { branch: "branch" });
  assertEquals(await repo.log(), [target]);
});

Deno.test("git().clone() can do a shallow copy", async () => {
  await using remote = await tempRepo();
  await remote.commit("first", { allowEmpty: true });
  await remote.commit("second", { allowEmpty: true });
  const third = await remote.commit("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { depth: 1, local: false });
  assertEquals(await repo.log(), [third]);
});

Deno.test("git().clone() local is no-op for local remote", async () => {
  await using remote = await tempRepo();
  const commit = await remote.commit("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { local: true });
  assertEquals(await repo.log(), [commit]);
});

Deno.test("git().clone() can do a shallow copy of multiple branches", async () => {
  await using remote = await tempRepo();
  await remote.checkout({ newBranch: "branch1" });
  const first = await remote.commit("first", { allowEmpty: true });
  await remote.checkout({ newBranch: "branch2" });
  await remote.commit("second", { allowEmpty: true });
  const third = await remote.commit("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), {
    branch: "branch1",
    depth: 1,
    local: false,
    singleBranch: false,
  });
  assertEquals(await repo.log(), [first]);
  await repo.checkout({ target: "branch2" });
  assertEquals(await repo.log(), [third]);
});

Deno.test("git().clone() can copy a single branch", async () => {
  await using remote = await tempRepo();
  await remote.checkout({ newBranch: "branch1" });
  const first = await remote.commit("first", { allowEmpty: true });
  const second = await remote.commit("second", { allowEmpty: true });
  await remote.checkout({ newBranch: "branch2" });
  await remote.commit("third", { allowEmpty: true });
  await using directory = await tempDirectory();
  const repo = git({ cwd: directory.path() });
  await repo.clone(remote.path(), { branch: "branch1", singleBranch: true });
  assertEquals(await repo.log(), [second, first]);
  await assertRejects(() => repo.checkout({ target: "branch2" }), GitError);
});

Deno.test("git().checkout() stays at current branch", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  const branch = await repo.branch();
  await repo.checkout();
  assertEquals(await repo.branch(), branch);
});

Deno.test("git().checkout() switches to branch", async () => {
  await using repo = await tempRepo();
  const main = await repo.branch();
  assertExists(main);
  const commit1 = await repo.commit("first", { allowEmpty: true });
  await repo.checkout({ newBranch: "branch" });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  assertEquals(await repo.branch(), "branch");
  assertEquals(await repo.log(), [commit2, commit1]);
  await repo.checkout({ target: main });
  assertEquals(await repo.branch(), main);
  assertEquals(await repo.log(), [commit1]);
  await repo.checkout({ target: "branch" });
  assertEquals(await repo.branch(), "branch");
  assertEquals(await repo.log(), [commit2, commit1]);
});

Deno.test("git().checkout() switches to commit", async () => {
  await using repo = await tempRepo();
  const main = await repo.branch();
  assertExists(main);
  const commit1 = await repo.commit("first", { allowEmpty: true });
  await repo.checkout({ target: commit1 });
  assertEquals(await repo.branch(), undefined);
  assertEquals(await repo.log(), [commit1]);
  await repo.checkout({ newBranch: "branch" });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  await repo.checkout({ target: commit1 });
  assertEquals(await repo.branch(), undefined);
  assertEquals(await repo.log(), [commit1]);
  await repo.checkout({ target: commit2 });
  assertEquals(await repo.branch(), undefined);
  assertEquals(await repo.log(), [commit2, commit1]);
});

Deno.test("git().checkout() can detach", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  const branch = await repo.branch();
  await repo.checkout();
  assertEquals(await repo.branch(), branch);
});

Deno.test("git().branch() returns current branch", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  await repo.checkout({ newBranch: "branch" });
  assertEquals(await repo.branch(), "branch");
});

Deno.test("git().branch() is undefined on detached state", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  assertNotEquals(await repo.branch(), undefined);
  await repo.checkout({ detach: true });
  assertEquals(await repo.branch(), undefined);
});

Deno.test("git().add() adds files", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.add("file");
  const commit = await repo.commit("commit");
  assertEquals(commit?.summary, "commit");
});

Deno.test("git().add() fails to add non-existent file", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.add("file"), GitError);
});

Deno.test("git().remove() fails to remove non-existent file", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.remove("file"), GitError);
});

Deno.test("git().remove() removes files", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file"), "content");
  repo.add("file");
  await repo.commit("first");
  repo.remove("file");
  await repo.commit("second");
  await assertRejects(() => Deno.stat(repo.path("file")), Deno.errors.NotFound);
});

Deno.test("git().commit() creates a commit", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.add("file");
  const commit = await repo.commit("summary");
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commit() creates a commit with body", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("summary", {
    body: "body",
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commit() ignores empty body", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("summary", { body: "", allowEmpty: true });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, {});
});

Deno.test("git().commit() creates a commit with trailers", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("summary", {
    trailers: { key1: "value1", key2: "value2\n  multi\n  line" },
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, undefined);
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2 multi line" });
});

Deno.test("git().commit() creates a commit with body and trailers", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("summary", {
    body: "body",
    trailers: { key: "value" },
    allowEmpty: true,
  });
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key: "value" });
});

Deno.test("git().commit() can automatically add files", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file"), "content1");
  await repo.add("file");
  await repo.commit("commit");
  await Deno.writeTextFile(repo.path("file"), "content2");
  const commit = await repo.commit("commit", { all: true });
  assertEquals(await repo.head(), commit);
});

Deno.test("git().commit() can automatically remove files", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.add("file");
  await repo.commit("commit");
  await Deno.remove(repo.path("file"));
  const commit = await repo.commit("commit", { all: true });
  assertEquals(await repo.head(), commit);
});

Deno.test("git().commit() can amend a commit", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.add("file");
  await repo.commit("commit");
  const commit = await repo.commit("new summary", { amend: true });
  assertEquals(commit?.summary, "new summary");
});

Deno.test("git().commit() disallows empty commit", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.commit("commit"), GitError);
});

Deno.test("git().commit() can create empty commit", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("commit", { allowEmpty: true });
  assertEquals(commit?.summary, "commit");
});

Deno.test("git().commit() can set author", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("commit", {
    author: { name: "name", email: "email@example.com" },
    allowEmpty: true,
  });
  assertEquals(commit?.author, { name: "name", email: "email@example.com" });
});

Deno.test("git().commit() can set committer", async () => {
  await using repo = await tempRepo();
  await repo.config({ user: { name: "name", email: "email@example.com" } });
  const commit = await repo.commit("commit", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(commit?.committer, { name: "name", email: "email@example.com" });
});

Deno.test("git().commit() summary cannot be empty", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.commit("", { allowEmpty: true }), GitError);
});

Deno.test("git().commit() cannot use wrong key", async () => {
  await using repo = await tempRepo();
  await assertRejects(
    () => repo.commit("commit", { allowEmpty: true, sign: "not-a-key" }),
    GitError,
  );
});

Deno.test("git().head() fails on empty repo", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.head(), GitError);
});

Deno.test("git().head() returns head tip", async () => {
  await using repo = await tempRepo();
  await repo.commit("first", { allowEmpty: true });
  const commit = await repo.commit("second", { allowEmpty: true });
  assertEquals(await repo.head(), commit);
});

Deno.test("git().log() fails on empty repo", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.log()), GitError;
});

Deno.test("git().log() returns single commit", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("commit", { allowEmpty: true });
  assertEquals(await repo.log(), [commit]);
});

Deno.test("git().log() returns multiple commits", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  assertEquals(await repo.log(), [commit2, commit1]);
});

Deno.test("git().log() can parse message body", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit(
    "summary\n\nbody\n\nkey1: value1\nkey2: value2\n",
    { allowEmpty: true },
  );
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().log() can work with custom trailer separator", async () => {
  await using repo = await tempRepo();
  await repo.config({ trailer: { separators: "#" } });
  const commit = await repo.commit(
    "summary\n\nbody\n\nkey1 #value1\nkey2 #value2\n",
    { allowEmpty: true },
  );
  assertEquals(commit?.summary, "summary");
  assertEquals(commit?.body, "body");
  assertEquals(commit?.trailers, { key1: "value1", key2: "value2" });
});

Deno.test("git().log() can limit number of commits", async () => {
  await using repo = await tempRepo();
  await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  const commit3 = await repo.commit("third", { allowEmpty: true });
  assertEquals(await repo.log({ maxCount: 2 }), [commit3, commit2]);
});

Deno.test("git().log() can skip commits", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("first", { allowEmpty: true });
  await repo.commit("second", { allowEmpty: true });
  assertEquals(await repo.log({ skip: 1, maxCount: 1 }), [commit]);
});

Deno.test("git().log() returns file changes", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await repo.add("file1");
  const commit1 = await repo.commit("first");
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.add("file2");
  const commit2 = await repo.commit("second");
  assertEquals(await repo.log({ paths: ["file1"] }), [commit1]);
  assertEquals(await repo.log({ paths: ["file2"] }), [commit2]);
  assertEquals(await repo.log({ paths: ["file1", "file2"] }), [
    commit2,
    commit1,
  ]);
});

Deno.test("git().log() returns blame", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.add("file1");
  const commit1 = await repo.commit("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.add("file2");
  const commit2 = await repo.commit("second");
  assertEquals(await repo.log({ text: "content1" }), [commit1]);
  assertEquals(await repo.log({ text: "content2" }), [commit2]);
});

Deno.test("git().log() returns blame from multiple files", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.add("file1");
  const commit1 = await repo.commit("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.add("file2");
  const commit2 = await repo.commit("second");
  assertEquals(await repo.log({ text: "content" }), [commit2, commit1]);
});

Deno.test("git().log() returns blame from specific file", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.add("file1");
  const commit1 = await repo.commit("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.add("file2");
  const commit2 = await repo.commit("second");
  assertEquals(await repo.log({ paths: ["file1"], text: "content" }), [
    commit1,
  ]);
  assertEquals(await repo.log({ paths: ["file2"], text: "content" }), [
    commit2,
  ]);
});

Deno.test("git().log() can match extended regexp", async () => {
  await using repo = await tempRepo();
  await Deno.writeTextFile(repo.path("file1"), "content1");
  await repo.add("file1");
  const commit1 = await repo.commit("first");
  await Deno.writeTextFile(repo.path("file2"), "content2");
  await repo.add("file2");
  const commit2 = await repo.commit("second");
  assertEquals(await repo.log({ text: "content[12]" }), [commit2, commit1]);
  assertEquals(await repo.log({ text: ".+\d?" }), [commit2, commit1]);
});

Deno.test("git().log() returns commit descendants", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  assertEquals(await repo.log({ range: { from: commit1 } }), [commit2]);
});

Deno.test("git().log() returns commit range", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  const commit3 = await repo.commit("second", { allowEmpty: true });
  await repo.commit("third", { allowEmpty: true });
  assertEquals(await repo.log({ range: { from: commit1, to: commit3 } }), [
    commit3,
    commit2,
  ]);
});

Deno.test("git().log() returns interprets range as asymmetric", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  await repo.commit("second", { allowEmpty: true });
  const commit3 = await repo.commit("second", { allowEmpty: true });
  await repo.commit("third", { allowEmpty: true });
  assertEquals(await repo.log({ range: { from: commit3, to: commit1 } }), []);
});

Deno.test("git().log() returns symmetric commit range", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  const commit3 = await repo.commit("second", { allowEmpty: true });
  await repo.commit("third", { allowEmpty: true });
  assertEquals(
    await repo.log({ range: { from: commit3, to: commit1, symmetric: true } }),
    [commit3, commit2],
  );
});

Deno.test("git().log() filters by author", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", {
    author: { name: "name1", email: "email1@example.com" },
    allowEmpty: true,
  });
  const commit2 = await repo.commit("second", {
    author: { name: "name2", email: "email2@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.log({ author: { name: "name1", email: "email1@example.com" } }),
    [commit1],
  );
  assertEquals(
    await repo.log({ author: { name: "name2", email: "email2@example.com" } }),
    [commit2],
  );
});

Deno.test("git().log() filters by committer", async () => {
  await using repo = await tempRepo();
  await repo.config({ user: { name: "name1", email: "email1@example.com" } });
  const commit1 = await repo.commit("first", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  await repo.config({ user: { name: "name2", email: "email2@example.com" } });
  const commit2 = await repo.commit("second", {
    author: { name: "other", email: "other@example.com" },
    allowEmpty: true,
  });
  assertEquals(
    await repo.log({
      committer: { name: "name1", email: "email1@example.com" },
    }),
    [commit1],
  );
  assertEquals(
    await repo.log({
      committer: { name: "name2", email: "email2@example.com" },
    }),
    [commit2],
  );
});

Deno.test("git().tag() creates a lightweight tag", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag");
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tag() creates an annotated tag", async () => {
  await using repo = await tempRepo();
  await repo.config({ user: { name: "tagger", email: "tagger@example.com" } });
  const commit = await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag", { subject: "subject", body: "body" });
  assertEquals(tag, {
    name: "tag",
    commit,
    tagger: { name: "tagger", email: "tagger@example.com" },
    subject: "subject",
    body: "body",
  });
});

Deno.test("git().tag() ignores empty body", async () => {
  await using repo = await tempRepo();
  await repo.config({ user: { name: "tagger", email: "tagger@example.com" } });
  const commit = await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag", { subject: "subject", body: "" });
  assertEquals(tag, {
    name: "tag",
    commit,
    tagger: { name: "tagger", email: "tagger@example.com" },
    subject: "subject",
  });
});

Deno.test("git().tag() cannot create annotated tag without subject", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  await assertRejects(() => repo.tag("tag", { sign: true }), GitError);
});

Deno.test("git().tag() creates a tag with commit", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag", { commit });
  assertEquals(tag, { name: "tag", commit });
});

Deno.test("git().tag() creates a tag with another tag", async () => {
  await using repo = await tempRepo();
  const commit = await repo.commit("commit", { allowEmpty: true });
  await repo.tag("tag1");
  await repo.tag("tag2", { commit: "tag1" });
  const tags = await repo.tagList();
  assertEquals(tags, [
    { name: "tag1", commit },
    { name: "tag2", commit },
  ]);
});

Deno.test("git().tag() cannot create duplicate tag", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  await repo.tag("tag");
  await assertRejects(() => repo.tag("tag"), GitError);
});

Deno.test("git().tag() can force move a tag", async () => {
  await using repo = await tempRepo();
  await repo.commit("first", { allowEmpty: true });
  await repo.tag("tag");
  await repo.commit("second", { allowEmpty: true });
  await repo.tag("tag", { force: true });
});

Deno.test("git().tag() cannot use wrong key", async () => {
  await using repo = await tempRepo();
  await assertRejects(() => repo.tag("tag", { sign: "not-a-key" }), GitError);
});

Deno.test("git().tagList() return empty list on empty repo", async () => {
  await using repo = await tempRepo();
  assertEquals(await repo.tagList(), []);
});

Deno.test("git().tagList() return empty list on no tags repo", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  assertEquals(await repo.tagList(), []);
});

Deno.test("git().tagList() returns single tag", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag");
  assertEquals(await repo.tagList(), [tag]);
});

Deno.test("git().tagList() returns multiple tags with version sort", async () => {
  await using repo = await tempRepo();
  await repo.commit("first", { allowEmpty: true });
  const tag1 = await repo.tag("v1.0.0");
  await repo.commit("second", { allowEmpty: true });
  const tag2 = await repo.tag("v2.0.0");
  assertEquals(await repo.tagList({ sort: "version" }), [tag2, tag1]);
});

Deno.test("git().tagList() matches tag name", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  await repo.tag("tag1");
  const tag2 = await repo.tag("tag2");
  assertEquals(await repo.tagList({ name: "tag2" }), [tag2]);
});

Deno.test("git().tagList() matches tag pattern", async () => {
  await using repo = await tempRepo();
  await repo.commit("commit", { allowEmpty: true });
  const tag1 = await repo.tag("tag1");
  const tag2 = await repo.tag("tag2");
  assertEquals(await repo.tagList({ name: "tag*" }), [tag1, tag2]);
});

Deno.test("git().tagList() returns tags that contain commit", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const tag1 = await repo.tag("tag1");
  const commit2 = await repo.commit("second", { allowEmpty: true });
  const tag2 = await repo.tag("tag2");
  assertEquals(await repo.tagList({ contains: commit1 }), [tag1, tag2]);
  assertEquals(await repo.tagList({ contains: commit2 }), [tag2]);
});

Deno.test("git().tagList() returns tags that do not contain commit", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const tag1 = await repo.tag("tag1");
  const commit2 = await repo.commit("second", { allowEmpty: true });
  await repo.tag("tag2");
  assertEquals(await repo.tagList({ noContains: commit1 }), []);
  assertEquals(await repo.tagList({ noContains: commit2 }), [tag1]);
});

Deno.test("git().tagList() returns tags that point to a commit", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const tag1 = await repo.tag("tag1");
  const commit2 = await repo.commit("second", { allowEmpty: true });
  const tag2 = await repo.tag("tag2", { subject: "subject" });
  assertEquals(await repo.tagList({ pointsAt: commit1 }), [tag1]);
  assertEquals(await repo.tagList({ pointsAt: commit2 }), [tag2]);
});

Deno.test("git().tagList() returns commit range", async () => {
  await using repo = await tempRepo();
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  await repo.commit("third", { allowEmpty: true });
  assertEquals(await repo.log({ range: { from: commit1, to: commit2 } }), [
    commit2,
  ]);
});

Deno.test("git().addRemote() adds remote URL", async () => {
  await using repo = await tempRepo();
  await repo.remoteAdd("url");
  assertEquals(await repo.remote(), "url");
});

Deno.test("git().addRemote() cannot add to the same remote", async () => {
  await using repo = await tempRepo();
  await repo.remoteAdd("url1");
  await assertRejects(() => repo.remoteAdd("url2"), GitError);
});

Deno.test("git().addRemote() cannot add multiple remotes", async () => {
  await using repo = await tempRepo();
  await repo.remoteAdd("url1", { remote: "remote1" });
  await repo.remoteAdd("url2", { remote: "remote2" });
  assertEquals(await repo.remote({ remote: "remote1" }), "url1");
  assertEquals(await repo.remote({ remote: "remote2" }), "url2");
});

Deno.test("git().remote() returns remote URL", async () => {
  await using repo = await tempRepo();
  await repo.remoteAdd("url", { remote: "downstream" });
  assertEquals(await repo.remote({ remote: "downstream" }), "url");
});

Deno.test("git().remoteDefaultBranch() returns remote head branch", async () => {
  await using remote = await tempRepo();
  await remote.commit("commit", { allowEmpty: true });
  const branch = await remote.branch();
  await using repo = await tempRepo({ clone: remote });
  assertEquals(await repo.remoteDefaultBranch(), branch);
});

Deno.test("git().remoteDefaultBranch() can use remote name", async () => {
  await using remote = await tempRepo();
  await remote.commit("commit", { allowEmpty: true });
  const branch = await remote.branch();
  await using repo = await tempRepo();
  await repo.remoteAdd(remote.path(), { remote: "remote" });
  assertEquals(await repo.remoteDefaultBranch({ remote: "remote" }), branch);
});

Deno.test("git().remoteDefaultBranch() detects detached remote head", async () => {
  await using remote = await tempRepo();
  await remote.commit("first", { allowEmpty: true });
  await remote.checkout({ detach: true });
  await remote.commit("second", { allowEmpty: true });
  await using repo = await tempRepo({ clone: remote });
  assertEquals(await repo.remoteDefaultBranch(), undefined);
});

Deno.test("git().remoteDefaultBranch() fails on unknown remote", async () => {
  await using repo = await tempRepo();
  await assertRejects(
    () => repo.remoteDefaultBranch({ remote: "remote" }),
    GitError,
  );
});

Deno.test("git().push() pushes commits to remote", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  const commit1 = await repo.commit("first", { allowEmpty: true });
  const commit2 = await repo.commit("second", { allowEmpty: true });
  await repo.push();
  assertEquals(await remote.log(), [commit2, commit1]);
});

Deno.test("git().push() pushes commits to remote with name", async () => {
  await using remote = await tempRepo({ bare: true });
  const branch = await remote.branch();
  assert(branch);
  await using repo = await tempRepo();
  await repo.remoteAdd(remote.path(), { remote: "remote" });
  const commit = await repo.commit("commit", { allowEmpty: true });
  await repo.push({ remote: "remote", branch });
  assertEquals(await remote.log(), [commit]);
});

Deno.test("git().push() can push tags", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag");
  await repo.push({ tags: true });
  assertEquals(await remote.tagList(), [tag]);
});

Deno.test("git().push() fails on unsynced push", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo1 = await tempRepo({ clone: remote });
  await using repo2 = await tempRepo({ clone: remote });
  await repo1.commit("first", { allowEmpty: true });
  await repo2.commit("second", { allowEmpty: true });
  await repo1.push();
  await assertRejects(() => repo2.push(), GitError);
});

Deno.test("git().push() can force push", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo1 = await tempRepo({ clone: remote });
  await using repo2 = await tempRepo({ clone: remote });
  await repo1.commit("first", { allowEmpty: true });
  const commit2 = await repo2.commit("second", { allowEmpty: true });
  await repo1.push();
  await repo2.push({ force: true });
  assertEquals(await remote.log(), [commit2]);
});

Deno.test("git().pushTag() pushes tags to remote", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await repo.commit("commit", { allowEmpty: true });
  const tag = await repo.tag("tag");
  await repo.push();
  await repo.pushTag("tag");
  assertEquals(await repo.tagList(), [tag]);
});

Deno.test("git().pushTag() cannot override remote tag", async () => {
  await using remote = await tempRepo();
  await remote.commit("commit", { allowEmpty: true });
  await using repo = await tempRepo({ clone: remote });
  await remote.commit("new", { allowEmpty: true });
  await remote.tag("tag");
  await repo.tag("tag");
  await assertRejects(() => repo.pushTag("tag"), GitError);
});

Deno.test("git().pushTag() can force override remote tag", async () => {
  await using remote = await tempRepo();
  await remote.commit("commit", { allowEmpty: true });
  await using repo = await tempRepo({ clone: remote });
  await remote.commit("new", { allowEmpty: true });
  await remote.tag("tag");
  await repo.tag("tag");
  await repo.pushTag("tag", { force: true });
});

Deno.test("git().pull() pulls commits and tags", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await using other = await tempRepo({ clone: remote });
  const commit = await other.commit("commit", { allowEmpty: true });
  const tag = await other.tag("tag");
  await other.push();
  await other.pushTag(tag);
  await repo.pull();
  assertEquals(await repo.log(), [commit]);
  assertEquals(await repo.tagList(), [tag]);
});

Deno.test("git().pull() can pull from remote with name", async () => {
  await using remote = await tempRepo();
  const commit = await remote.commit("commit", { allowEmpty: true });
  const branch = await remote.branch();
  assert(branch);
  await using repo = await tempRepo();
  await repo.remoteAdd(remote.path(), { remote: "remote" });
  await repo.pull({ remote: "remote", branch });
  assertEquals(await repo.log(), [commit]);
});

Deno.test("git().pull() can skip tags", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await using other = await tempRepo({ clone: remote });
  const commit = await other.commit("commit", { allowEmpty: true });
  await other.tag("tag");
  await other.push();
  await other.pushTag("tag");
  await repo.pull({ tags: false });
  assertEquals(await repo.log(), [commit]);
  assertEquals(await repo.tagList(), []);
});

Deno.test("git().pull() does not fetch all tags", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await using other = await tempRepo({ clone: remote });
  const commit = await other.commit("commit", { allowEmpty: true });
  const tag1 = await other.tag("tag1");
  await other.push();
  await other.pushTag(tag1);
  await other.checkout({ newBranch: "branch" });
  await other.commit("second", { allowEmpty: true });
  const tag2 = await other.tag("tag2");
  await other.pushTag(tag2);
  await repo.pull();
  assertEquals(await repo.log(), [commit]);
  assertEquals(await repo.tagList(), [tag1]);
});

Deno.test("git().pull() can fetch all tags", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await using other = await tempRepo({ clone: remote });
  const commit = await other.commit("commit", { allowEmpty: true });
  const tag1 = await other.tag("tag1");
  await other.push();
  await other.pushTag(tag1);
  await other.checkout({ newBranch: "branch" });
  await other.commit("second", { allowEmpty: true });
  const tag2 = await other.tag("tag2");
  await other.pushTag(tag2);
  await repo.pull({ tags: true });
  assertEquals(await repo.log(), [commit]);
  assertEquals(await repo.tagList(), [tag1, tag2]);
});

Deno.test("git().pull() cannot use wrong key", async () => {
  await using remote = await tempRepo({ bare: true });
  await using repo = await tempRepo({ clone: remote });
  await assertRejects(() => repo.pull({ sign: "not-a-key" }), GitError);
});
