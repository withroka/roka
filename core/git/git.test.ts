import { tempDirectory } from "@roka/fs/temp";
import { tempRepository } from "@roka/git/testing";
import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertRejects,
} from "@std/assert";
import { basename, resolve, toFileUrl } from "@std/path";
import { git, GitError } from "./git.ts";

// some tests cannot check committer/tagger if Codespaces are signing with GPG
const codespaces = !!Deno.env.get("CODESPACES");

Deno.test("git() mentions failed command on error", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.branch.create("branch"),
    GitError,
    "Error running git command: branch\n\n",
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
  await repo.commit.create("commit", { allowEmpty: true });
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

Deno.test("git().init() initializes a repository", async () => {
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).init();
  assertEquals(repo.path(), directory.path());
  assertEquals((await Deno.stat(repo.path(".git"))).isDirectory, true);
});

Deno.test("git().init() can reinitialize an existing repository", async () => {
  await using directory = await tempDirectory();
  const repo = await git({ cwd: directory.path() }).init({ branch: "branch1" });
  await repo.init({ branch: "branch2" });
  assertEquals(await repo.branch.current(), { name: "branch1" });
});

Deno.test("git().init({ directory }) initializes at specified directory", async () => {
  await using directory = await tempDirectory();
  const repo = await git().init({ directory: directory.path("directory") });
  assertEquals(repo.path(), directory.path("directory"));
  assertEquals((await Deno.stat(repo.path(".git"))).isDirectory, true);
});

Deno.test("git().init({ directory }) can initialize at specified relative path", async () => {
  await using directory = await tempDirectory({ chdir: true });
  const repo = await git({ cwd: directory.path() }).init({ directory: "repo" });
  assertEquals(repo.path(), directory.path("repo"));
  assertEquals((await Deno.stat(repo.path(".git"))).isDirectory, true);
});

Deno.test("git().init({ directory }) can initialize inside a repository", async () => {
  await using directory = await tempDirectory();
  const repo1 = await git({ cwd: directory.path() }).init();
  const repo2 = await repo1.init({ directory: "directory" });
  const repo3 = await repo2.init({ directory: "directory" });
  assertEquals(repo2.path(), repo1.path("directory"));
  assertEquals(repo3.path(), repo2.path("directory"));
  assertEquals((await Deno.stat(repo1.path(".git"))).isDirectory, true);
  assertEquals((await Deno.stat(repo2.path(".git"))).isDirectory, true);
  assertEquals((await Deno.stat(repo3.path(".git"))).isDirectory, true);
});

Deno.test("git().init({ branch }) creates a repository with initial branch", async () => {
  await using directory = await tempDirectory();
  const repo = await git().init({
    directory: directory.path(),
    branch: "branch",
  });
  assertEquals(await repo.branch.current(), { name: "branch" });
});

Deno.test("git().init({ config }) applies to initialization", async () => {
  await using directory = await tempDirectory();
  const repo = await git().init({
    directory: directory.path(),
    config: {
      init: { defaultBranch: "branch" },
    },
  });
  assertEquals(await repo.branch.current(), { name: "branch" });
});

Deno.test("git().init({ config }) persists configuration", async () => {
  await using directory = await tempDirectory();
  const repo = await git().init({
    directory: directory.path(),
    config: {
      user: { name: "name", email: "email" },
      commit: { gpgsign: false },
      tag: { gpgsign: false },
    },
  });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  assertEquals(commit?.author, { name: "name", email: "email" });
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
  await repo.commit.create("commit", { allowEmpty: true });
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

Deno.test("git().remote.clone() clones a repository", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git({ cwd: directory.path() }).remote.clone(url);
  assertEquals(repo.path(), directory.path(basename(upstream.path())));
  assertEquals(await repo.commit.log(), await upstream.commit.log());
});

Deno.test("git().remote.clone({ directory }) clones into specified directory", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, { directory: directory.path() });
  assertEquals(repo.path(), directory.path());
  assertEquals(await repo.commit.log(), await upstream.commit.log());
});

Deno.test("git().remote.clone({ directory }) clones into specified relative path", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory({ chdir: true });
  const url = toFileUrl(upstream.path());
  const repo = await git({ cwd: directory.path() }).remote.clone(url, {
    directory: "directory",
  });
  assertEquals(repo.path(), directory.path("directory"));
  assertEquals(await repo.commit.log(), await upstream.commit.log());
});

Deno.test("git().remote.clone({ directory }) rejects non-empty directory", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  await using directory = await tempDirectory();
  await Deno.writeTextFile(directory.path("file.txt"), "content");
  const url = toFileUrl(upstream.path());
  await assertRejects(
    () => git().remote.clone(url, { directory: directory.path() }),
    GitError,
    "not an empty directory",
  );
});

Deno.test("git().remote.clone({ branch }) checks out a branch", async () => {
  await using upstream = await tempRepository();
  const commit1 = await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  await upstream.branch.switch("branch", { create: commit1 });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    branch: "branch",
  });
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().remote.clone({ config }) applies to initialization", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    config: { clone: { defaultRemoteName: "remote" } },
  });
  assertEquals(await repo.remote.get({ remote: "remote" }), {
    name: "remote",
    fetch: url,
    push: [url],
  });
});

Deno.test("git().remote.clone({ config }) persists configuration", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    config: {
      user: { name: "name", email: "email" },
      commit: { gpgsign: false },
    },
  });
  const commit = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(commit?.author, { name: "name", email: "email" });
});

Deno.test("git().remote.clone({ depth }) makes a shallow copy", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  const commit3 = await upstream.commit.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    depth: 1,
    local: false,
  });
  assertEquals(await repo.commit.log(), [commit3]);
});

Deno.test("git().remote.clone({ depth }) can make a shallow copy of multiple branches", async () => {
  await using upstream = await tempRepository();
  await upstream.branch.switch("branch1", { create: true });
  const commit1 = await upstream.commit.create("commit1", { allowEmpty: true });
  const branch2 = await upstream.branch.switch("branch2", { create: true });
  await upstream.commit.create("commit2", { allowEmpty: true });
  const commit3 = await upstream.commit.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    branch: "branch1",
    depth: 1,
    local: false,
    singleBranch: false,
  });
  assertEquals(await repo.commit.log(), [commit1]);
  await repo.branch.switch(branch2);
  assertEquals(await repo.commit.log(), [commit3]);
});

Deno.test("git().remote.clone({ local }) is no-op for local remote", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", {
    allowEmpty: true,
  });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    local: true,
  });
  assertEquals(await repo.commit.log(), [commit]);
});

Deno.test("git().remote.clone({ remote }) clones a repository with remote name", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    remote: "remote",
  });
  assertEquals(await repo.commit.log(), await upstream.commit.log());
});

Deno.test("git().remote.clone({ singleBranch }) copies a single branch", async () => {
  await using upstream = await tempRepository();
  await upstream.branch.switch("branch1", { create: true });
  const commit1 = await upstream.commit.create("commit1", { allowEmpty: true });
  const commit2 = await upstream.commit.create("commit2", { allowEmpty: true });
  await upstream.branch.switch("branch2", { create: true });
  await upstream.commit.create("commit3", { allowEmpty: true });
  await using directory = await tempDirectory();
  const url = toFileUrl(upstream.path());
  const repo = await git().remote.clone(url, {
    directory: directory.path(),
    branch: "branch1",
    singleBranch: true,
  });
  assertEquals(await repo.commit.log(), [commit2, commit1]);
  await assertRejects(
    () => repo.branch.switch("branch2"),
    GitError,
    "invalid reference",
  );
});

Deno.test("git().remote.add() adds a default remote", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = await repo.remote.add(url);
  assertEquals(remote, { name: "origin", fetch: url, push: [url] });
  assertEquals(await repo.remote.get(), remote);
});

Deno.test("git().remote.add() rejects adding existing remote", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url);
  await assertRejects(
    () => repo.remote.add(url),
    GitError,
    "already exists",
  );
});

Deno.test("git().remote.add({ remote }) adds a remote by name", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = await repo.remote.add(url, { remote: "remote" });
  assertEquals(remote, { name: "remote", fetch: url, push: [url] });
  assertEquals(await repo.remote.get({ remote: "remote" }), remote);
});

Deno.test("git().remote.add({ remote }) rejects adding existing remote", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote" });
  await assertRejects(
    () => repo.remote.add(url, { remote: "remote" }),
    GitError,
    "already exists",
  );
});

Deno.test("git().remote.add({ remote }) can add multiple remotes", async () => {
  await using repo = await tempRepository();
  await using upstream1 = await tempRepository();
  await using upstream2 = await tempRepository();
  const url1 = toFileUrl(upstream1.path());
  const url2 = toFileUrl(upstream2.path());
  const remote1 = await repo.remote.add(url1, { remote: "remote1" });
  const remote2 = await repo.remote.add(url2, { remote: "remote2" });
  assertEquals(remote1, { name: "remote1", fetch: url1, push: [url1] });
  assertEquals(remote2, { name: "remote2", fetch: url2, push: [url2] });
  assertEquals(await repo.remote.get({ remote: "remote1" }), remote1);
  assertEquals(await repo.remote.get({ remote: "remote2" }), remote2);
  assertEquals(await repo.remote.list(), [remote1, remote2]);
});

Deno.test("git().remote.add({ remote }) can add a remote by object", async () => {
  await using repo = await tempRepository();
  await using upstream1 = await tempRepository();
  await using upstream2 = await tempRepository();
  const url1 = toFileUrl(upstream1.path());
  const url2 = toFileUrl(upstream2.path());
  const remote = { name: "remote", fetch: url1, push: [url1, url2] };
  assertEquals(await repo.remote.add(remote), remote);
  assertEquals(await repo.remote.get({ remote: "remote" }), remote);
  assertEquals(await repo.remote.list(), [remote]);
});

Deno.test("git().remote.list() returns remotes", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote1" });
  await repo.remote.add(url, { remote: "remote2" });
  const remotes = await repo.remote.list();
  assertEquals(remotes, [
    { name: "remote1", fetch: url, push: [url] },
    { name: "remote2", fetch: url, push: [url] },
  ]);
});

Deno.test("git().remote.list() returns empty list with no remotes", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.remote.list(), []);
});

Deno.test("git().remote.get() returns default remote", async () => {
  await using upstream = await tempRepository();
  await using repo = await tempRepository({ clone: upstream });
  const url = toFileUrl(upstream.path());
  assertEquals(await repo.remote.get(), {
    name: "origin",
    fetch: url,
    push: [url],
  });
});

Deno.test("git().remote.get() can return remote configured for branch", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({ clone: upstream });
  await repo.branch.switch("branch", { create: "origin/branch" });
  const url = toFileUrl(upstream.path());
  assertEquals(await repo.remote.get(), {
    name: "origin",
    fetch: url,
    push: [url],
  });
});

Deno.test("git().remote.get() returns undefined with no configured remote", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.remote.get(), undefined);
});

Deno.test("git().remote.get() returns undefined for unknown remote", async () => {
  await using upstream = await tempRepository();
  await using repo = await tempRepository({ clone: upstream });
  assertEquals(await repo.remote.get({ remote: "unknown" }), undefined);
});

Deno.test("git().remote.get({ remote }) returns remote by name", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote" });
  assertEquals(await repo.remote.get({ remote: "remote" }), {
    name: "remote",
    fetch: url,
    push: [url],
  });
});

Deno.test("git().remote.get({ remote }) returns remote by object", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = await repo.remote.add(url, { remote: "remote" });
  assertEquals(await repo.remote.get({ remote }), {
    name: "remote",
    fetch: url,
    push: [url],
  });
});

Deno.test("git().remote.set() can update remote", async () => {
  await using repo = await tempRepository();
  await using upstream1 = await tempRepository();
  await using upstream2 = await tempRepository();
  const url1 = toFileUrl(upstream1.path());
  const url2 = toFileUrl(upstream2.path());
  const remote = await repo.remote.add(url1);
  remote.fetch = url2;
  remote.push = [url2];
  const updated = await repo.remote.set(remote);
  assertEquals(updated, { name: "origin", fetch: url2, push: [url2] });
  assertEquals(await repo.remote.get(), updated);
  assertEquals(await repo.remote.list(), [updated]);
});

Deno.test("git().remote.set() can update remote by name", async () => {
  await using repo = await tempRepository();
  await using upstream1 = await tempRepository();
  await using upstream2 = await tempRepository();
  const url1 = toFileUrl(upstream1.path());
  const url2 = toFileUrl(upstream2.path());
  const remote = await repo.remote.add(url1, { remote: "remote" });
  remote.fetch = url2;
  const updated = await repo.remote.set("remote", url2);
  assertEquals(updated, { name: "remote", fetch: url2, push: [url2] });
  assertEquals(await repo.remote.get({ remote: "remote" }), updated);
  assertEquals(await repo.remote.list(), [updated]);
});

Deno.test("git().remote.set() can update remote by object", async () => {
  await using repo = await tempRepository();
  await using upstream1 = await tempRepository();
  await using upstream2 = await tempRepository();
  const url1 = toFileUrl(upstream1.path());
  const url2 = toFileUrl(upstream2.path());
  const remote = await repo.remote.add(url1, { remote: "remote" });
  remote.fetch = url2;
  remote.push = [url2];
  const updated = await repo.remote.set(remote);
  assertEquals(updated, { name: "remote", fetch: url2, push: [url2] });
  assertEquals(await repo.remote.get({ remote: "remote" }), updated);
  assertEquals(await repo.remote.list(), [updated]);
});

Deno.test("git().remote.set() can add remote push", async () => {
  await using repo = await tempRepository();
  await using upstream1 = await tempRepository();
  await using upstream2 = await tempRepository();
  const url1 = toFileUrl(upstream1.path());
  const url2 = toFileUrl(upstream2.path());
  const remote = await repo.remote.add(url1);
  remote.push.push(url2);
  const updated = await repo.remote.set(remote);
  assertEquals(updated, { name: "origin", fetch: url1, push: [url1, url2] });
  assertEquals(await repo.remote.get(), updated);
  assertEquals(await repo.remote.list(), [updated]);
});

Deno.test("git().remote.set() does not delete last remote push", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = await repo.remote.add(url);
  remote.push = [];
  const updated = await repo.remote.set(remote);
  assertEquals(updated, { name: "origin", fetch: url, push: [url] });
  assertEquals(await repo.remote.get(), updated);
  assertEquals(await repo.remote.list(), [updated]);
});

Deno.test("git().remote.set() rejects unconfigured remote", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = { name: "remote", fetch: url, push: [url] };
  await assertRejects(
    () => repo.remote.set(remote),
    GitError,
    "No such remote",
  );
});

Deno.test("git().remote.remove() removes default remote", async () => {
  await using upstream = await tempRepository();
  await using repo = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = await repo.remote.add(url);
  assertEquals(await repo.remote.list(), [remote]);
  await repo.remote.remove();
  assertEquals(await repo.remote.list(), []);
  assertEquals(await repo.remote.get(), undefined);
});
Deno.test("git().remote.remove() rejects unconfigured remote", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.remote.remove(),
    GitError,
    "No remote configured",
  );
  assertEquals(await repo.remote.list(), []);
});

Deno.test("git().remote.remove({ remote }) can remove remote by name", async () => {
  await using upstream = await tempRepository();
  await using repo = await tempRepository();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote" });
  await repo.remote.remove({ remote: "remote" });
  assertEquals(await repo.remote.list(), []);
  assertEquals(await repo.remote.get({ remote: "remote" }), undefined);
});

Deno.test("git().remote.remove({ remote }) can remove remote by object", async () => {
  await using upstream = await tempRepository();
  await using repo = await tempRepository();
  const url = toFileUrl(upstream.path());
  const remote = await repo.remote.add(url, { remote: "remote" });
  await repo.remote.remove({ remote });
  assertEquals(await repo.remote.list(), []);
  assertEquals(await repo.remote.get({ remote: "remote" }), undefined);
});

Deno.test("git().remote.remove({ remote }) rejects unknown remote", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.remote.remove({ remote: "unknown" }),
    GitError,
    "No such remote",
  );
  assertEquals(await repo.remote.list(), []);
});

Deno.test("git().remote.head() returns remote default branch", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  const branch = await upstream.branch.current();
  await using repo = await tempRepository({ clone: upstream });
  assertEquals(await repo.remote.head(), branch.name);
});

Deno.test("git().remote.head() detects updated remote head", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: upstream });
  await upstream.branch.switch("branch", { create: true });
  assertEquals(await repo.remote.head(), "branch");
});

Deno.test("git().remote.head() detects detached remote head", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: upstream });
  await upstream.branch.detach();
  await upstream.commit.create("commit", { allowEmpty: true });
  await assertRejects(
    () => repo.remote.head(),
    GitError,
    "Cannot determine remote HEAD branch",
  );
});

Deno.test("git().remote.head({ remote }) can query by name", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  const branch = await upstream.branch.current();
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  assertEquals(await repo.remote.head({ remote: "remote" }), branch.name);
});

Deno.test("git().remote.head({ remote }) can query by object", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  const branch = await upstream.branch.current();
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const remote = await repo.remote.get({ remote: "remote" });
  assertExists(remote);
  assertEquals(await repo.remote.head({ remote }), branch.name);
});

Deno.test("git().remote.fetch() fetches commits and tags", async () => {
  await using upstream = await tempRepository({ branch: "main" });
  const commit1 = await upstream.commit.create("commit1", { allowEmpty: true });
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const commit2 = await upstream.commit.create("commit2", { allowEmpty: true });
  const tag = await upstream.tag.create("tag");
  assertEquals(await repo.branch.list({ name: "remote/main", remotes: true }), [
    { name: "remote/main", commit: commit1 },
  ]);
  assertEquals(await repo.tag.list(), []);
  await repo.remote.fetch({ remote: "remote" });
  assertEquals(await repo.branch.list({ name: "remote/main", remotes: true }), [
    { name: "remote/main", commit: commit2 },
  ]);
  assertEquals(await repo.tag.list(), [tag]);
  assertEquals(await repo.commit.log(), [commit1]);
});

Deno.test("git().remote.fetch() does not fetch all tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  await repo2.commit.create("commit1", { allowEmpty: true });
  const tag1 = await repo2.tag.create("tag1");
  await repo2.remote.push();
  await repo2.tag.push(tag1);
  await repo2.branch.switch("branch", { create: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo2.tag.create("tag2");
  await repo2.tag.push(tag2);
  await repo1.remote.fetch();
  assertEquals(await repo1.tag.list(), [tag1]);
});

Deno.test("git().remote.fetch({ target }) can fetch commits from a branch", async () => {
  await using upstream = await tempRepository({ branch: "main" });
  const main = await upstream.branch.current();
  const commit1 = await upstream.commit.create("commit", { allowEmpty: true });
  const branch = await upstream.branch.switch("branch", { create: true });
  const commit2 = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.switch(main);
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  assertEquals(
    await repo.branch.list({ name: "remote/main", remotes: true }),
    [{ name: "remote/main", commit: commit1 }],
  );
  await repo.remote.fetch({ remote: "remote", target: branch });
  assertEquals(
    await repo.branch.list({ name: "remote/branch", remotes: true }),
    [{ name: `remote/branch`, commit: commit2 }],
  );
  assertEquals(await repo.commit.log(), [commit1]);
});

Deno.test("git().remote.fetch({ target }) can fetch commits from a tag", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  await repo2.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo2.tag.create("tag1");
  await repo2.remote.push();
  await repo2.tag.push(tag1);
  await repo2.branch.switch("branch", { create: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo2.tag.create("tag2");
  await repo2.tag.push(tag2);
  await repo1.remote.fetch({ target: tag2 });
  assertEquals(await repo1.commit.log(), []);
  assertEquals(await repo1.tag.list(), []);
});

Deno.test("git().remote.fetch({ remote }) fetches from a remote with branch", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository({ branch: "main" });
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  const branch = await upstream.branch.current();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote" });
  assertEquals(
    await repo.branch.list({ name: "remote/main", remotes: true }),
    [],
  );
  await repo.remote.fetch({ remote: "remote", target: branch });
  assertEquals(await repo.branch.list({ name: "remote/main", remotes: true }), [
    { name: "remote/main", commit },
  ]);
  assertEquals(await repo.commit.log(), []);
});

Deno.test("git().remote.fetch({ tags }) can skip tags", async () => {
  await using upstream = await tempRepository({ branch: "main" });
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const commit = await upstream.commit.create("commit2", { allowEmpty: true });
  await upstream.tag.create("tag");
  await repo.remote.fetch({ remote: "remote", tags: false });
  assertEquals(await repo.branch.list({ name: "remote/main", remotes: true }), [
    { name: "remote/main", commit },
  ]);
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().remote.fetch({ tags }) can fetch all tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  await repo2.commit.create("commit1", { allowEmpty: true });
  const tag1 = await repo2.tag.create("tag1");
  await repo2.remote.push();
  await repo2.tag.push(tag1);
  await repo2.branch.switch("branch", { create: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo2.tag.create("tag2");
  await repo2.tag.push(tag2);
  await repo1.remote.fetch({ tags: true });
  assertEquals(await repo1.tag.list(), [tag1, tag2]);
});

Deno.test("git().remote.pull() pulls commits and tags", async () => {
  await using upstream = await tempRepository();
  await using repo = await tempRepository({ clone: upstream });
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  const tag = await upstream.tag.create("tag");
  await repo.remote.pull();
  assertEquals(await repo.commit.log(), [commit]);
  assertEquals(await repo.tag.list(), [tag]);
});

Deno.test("git().remote.pull() does not pull all tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  const commit1 = await repo2.commit.create("commit1", { allowEmpty: true });
  const tag1 = await repo2.tag.create("tag1");
  await repo2.remote.push();
  await repo2.tag.push(tag1);
  await repo2.branch.switch("branch", { create: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo2.tag.create("tag2");
  await repo2.tag.push(tag2);
  await repo1.remote.pull();
  assertEquals(await repo1.commit.log(), [commit1]);
  assertEquals(await repo1.tag.list(), [tag1]);
});

Deno.test("git().remote.pull({ target }) can pull commits from a branch", async () => {
  await using upstream = await tempRepository();
  const main = await upstream.branch.current();
  const commit1 = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.switch("branch", { create: true });
  const commit2 = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.switch(main);
  await using repo = await tempRepository({ clone: upstream });
  assertEquals(await repo.commit.log(), [commit1]);
  await repo.remote.pull({ target: "branch" });
  assertEquals(await repo.commit.log(), [commit2, commit1]);
});

Deno.test("git().remote.pull({ target }) can pull commits from a tag", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  const commit1 = await repo2.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo2.tag.create("tag1");
  await repo2.remote.push();
  await repo2.tag.push(tag1);
  await repo2.branch.switch("branch", { create: true });
  const commit2 = await repo2.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo2.tag.create("tag2");
  await repo2.tag.push(tag2);
  await repo1.remote.pull({ target: tag2 });
  assertEquals(await repo1.commit.log(), [commit2, commit1]);
  assertEquals(await repo1.tag.list(), []);
});

Deno.test("git().remote.pull({ remote }) pulls from a remote with branch", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  const branch = await upstream.branch.current();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote" });
  await repo.remote.pull({ remote: "remote", target: branch });
  assertEquals(await repo.commit.log(), [commit]);
});

Deno.test("git().remote.pull({ tags }) can skip tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  const commit = await repo2.commit.create("commit", { allowEmpty: true });
  const tag = await repo2.tag.create("tag");
  await repo2.remote.push();
  await repo2.tag.push(tag);
  await repo1.remote.pull({ tags: false });
  assertEquals(await repo1.commit.log(), [commit]);
  assertEquals(await repo1.tag.list(), []);
});

Deno.test("git().remote.pull({ tags }) can fetch all tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  const commit = await repo2.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo2.tag.create("tag1");
  await repo2.remote.push();
  await repo2.tag.push(tag1);
  await repo2.branch.switch("branch", { create: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  const tag2 = await repo2.tag.create("tag2");
  await repo2.tag.push(tag2);
  await repo1.remote.pull({ tags: true });
  assertEquals(await repo1.commit.log(), [commit]);
  assertEquals(await repo1.tag.list(), [tag1, tag2]);
});

Deno.test("git().remote.pull({ sign }) cannot use wrong key", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await using repo = await tempRepository({
    clone: upstream,
    config: { pull: { rebase: false } },
  });
  await Deno.writeTextFile(upstream.path("file1.txt"), "content1");
  await upstream.index.add("file1.txt");
  await upstream.commit.create("commit2");
  await Deno.writeTextFile(repo.path("file2.txt"), "content2");
  await repo.index.add("file2.txt");
  await repo.commit.create("commit3");
  await assertRejects(
    () => repo.remote.pull({ sign: "not-a-key" }),
    GitError,
    "gpg failed to sign",
  );
});

Deno.test("git().remote.push() pushes current branch to remote", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: upstream });
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  await repo.remote.push();
  assertEquals(await upstream.commit.log(), [commit2, commit1]);
});

Deno.test("git().remote.push() rejects unsynced push", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  await repo1.commit.create("commit1", { allowEmpty: true });
  await repo2.commit.create("commit2", { allowEmpty: true });
  await repo1.remote.push();
  await assertRejects(
    () => repo2.remote.push(),
    GitError,
    "failed to push some refs",
  );
});

Deno.test("git().remote.push({ target }) pushes commits to a remote branch", async () => {
  await using upstream = await tempRepository();
  const commit1 = await upstream.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: upstream });
  const commit2 = await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await repo.remote.push({ target: branch });
  assertEquals(await repo.branch.list({ name: "branch" }), [
    { name: "branch", commit: commit2 },
  ]);
  assertEquals(await upstream.branch.list({ name: "branch" }), [
    { name: "branch", commit: commit2 },
  ]);
  assertEquals(await upstream.commit.log(), [commit1]);
  await upstream.branch.switch(branch);
  assertEquals(await upstream.commit.log(), [commit2, commit1]);
});

Deno.test("git().remote.push({ target }) rejects tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: upstream });
  await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  await assertRejects(
    () => repo.remote.push({ target: tag }),
    GitError,
    "tag shorthand without <tag>",
  );
  await assertRejects(
    () => repo.remote.push({ target: "tag" }),
    GitError,
    "tag shorthand without <tag>",
  );
});

Deno.test("git().remote.push({ setUpstream }) sets upstream tracking", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const remote = await repo.remote.get({ remote: "remote" });
  assertExists(remote);
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await repo.remote.push({
    remote: "remote",
    target: branch,
    setUpstream: true,
  });
  const remoteBranch = await repo.branch.get("remote/branch");
  assertExists(remoteBranch);
  assertEquals(await repo.branch.list({ name: "branch" }), [
    {
      name: "branch",
      commit,
      fetch: { name: "branch", remote, branch: remoteBranch },
      push: { name: "branch", remote, branch: remoteBranch },
    },
  ]);
});

Deno.test("git().remote.push({ remote }) pushes commits to a remote with branch", async () => {
  await using repo = await tempRepository();
  await using upstream = await tempRepository({ bare: true });
  const branch = await upstream.branch.current();
  const url = toFileUrl(upstream.path());
  await repo.remote.add(url, { remote: "remote" });
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.remote.push({ remote: "remote", target: branch });
  assertEquals(await upstream.commit.log(), [commit]);
});

Deno.test("git().remote.push({ force }) force pushes", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo1 = await tempRepository({ clone: upstream });
  await using repo2 = await tempRepository({ clone: upstream });
  await repo1.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo2.commit.create("commit2", { allowEmpty: true });
  await repo1.remote.push();
  await repo2.remote.push({ force: true });
  assertEquals(await upstream.commit.log(), [commit2]);
});

Deno.test("git().remote.push({ tags }) pushes all tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: upstream });
  await repo.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const tag2 = await repo.tag.create("tag2");
  await repo.remote.push({ tags: true });
  assertEquals(await upstream.tag.list(), [tag1, tag2]);
});

Deno.test("git().remote.push({ branches }) pushes all tags", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: upstream });
  const commit1 = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch1");
  const commit2 = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch2");
  await repo.remote.push({ branches: true });
  assertEquals(await repo.branch.list({ name: "branch*" }), [
    { name: "branch1", commit: commit1 },
    { name: "branch2", commit: commit2 },
  ]);
  assertEquals(await upstream.branch.list({ name: "branch*" }), [
    { name: "branch1", commit: commit1 },
    { name: "branch2", commit: commit2 },
  ]);
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

Deno.test("git().branch.create() rejects existing branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch");
  await assertRejects(
    () => repo.branch.create("branch"),
    GitError,
    "already exists",
  );
});

Deno.test("git().branch.create() sets up tracking for remote branch", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({ clone: upstream });
  const remote = await repo.remote.get();
  assertExists(remote);
  const remoteBranch = await repo.branch.get("origin/branch");
  assertExists(remoteBranch);
  assertEquals(
    await repo.branch.create("branch", { target: "origin/branch" }),
    {
      name: "branch",
      commit,
      fetch: { name: "branch", remote, branch: remoteBranch },
      push: { name: "branch", remote, branch: remoteBranch },
    },
  );
});

Deno.test("git().branch.create({ target }) creates a branch at target", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("target");
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const remote = await repo.remote.get({ remote: "remote" });
  assertExists(remote);
  const remoteTarget = await repo.branch.get("remote/target");
  assertExists(remoteTarget);
  assertEquals(
    await repo.branch.create("branch1", { target: commit }),
    { name: "branch1", commit },
  );
  assertEquals(
    await repo.branch.create("branch2", { target: "remote/target" }),
    {
      name: "branch2",
      commit,
      fetch: { name: "target", remote, branch: remoteTarget },
      push: { name: "target", remote, branch: remoteTarget },
    },
  );
});

Deno.test("git().branch.create({ track }) can disable tracking", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({ clone: upstream });
  const remote = await repo.remote.get();
  assertExists(remote);
  assertEquals(
    await repo.branch.create("branch", {
      target: "origin/branch",
      track: false,
    }),
    {
      name: "branch",
      commit,
    },
  );
});

Deno.test("git().branch.create({ track }) can inherit source upstream", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({
    clone: upstream,
    config: { branch: { autoSetupMerge: "always" } },
  });
  const remote = await repo.remote.get();
  assertExists(remote);
  const remoteMain = await repo.branch.get("origin/main");
  assertExists(remoteMain);
  assertEquals(
    await repo.branch.create("branch", { target: "main", track: "inherit" }),
    {
      name: "branch",
      commit,
      fetch: { name: "main", remote, branch: remoteMain },
      push: { name: "main", remote, branch: remoteMain },
    },
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

Deno.test("git().branch.list() returns tracked branches", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit1", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({ clone: upstream });
  let main = await repo.branch.current();
  assertEquals(await repo.branch.list(), [main]);
  const branch = await repo.branch.create("branch", {
    target: "origin/branch",
  });
  await repo.commit.create("commit2", { allowEmpty: true });
  main = await repo.branch.current();
  assertEquals(await repo.branch.list(), [branch, main]);
});

Deno.test("git().branch.list() returns all branches in detached state", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  await repo.branch.detach();
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
  await using upstream = await tempRepository({ branch: "main" });
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const remote = await repo.remote.get({ remote: "remote" });
  assertExists(remote);
  const remoteMain = await repo.branch.get("remote/main");
  const remoteBranch = await repo.branch.get("remote/branch");
  assertExists(remoteMain);
  assertExists(remoteBranch);
  await repo.branch.create("branch", { target: "remote/branch" });
  await repo.branch.create("untracked");
  assertEquals(await repo.branch.list({ all: true }), [
    {
      name: "branch",
      commit,
      fetch: { name: "branch", remote, branch: remoteBranch },
      push: { name: "branch", remote, branch: remoteBranch },
    },
    {
      name: "main",
      commit,
      fetch: { name: "main", remote, branch: remoteMain },
      push: { name: "main", remote, branch: remoteMain },
    },
    { name: "untracked", commit },
    { name: "remote", commit },
    { name: "remote/branch", commit },
    { name: "remote/main", commit },
  ]);
});

Deno.test("git().branch.list({ remotes }) returns only remote branches", async () => {
  await using upstream = await tempRepository({ branch: "main" });
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  await repo.branch.create("local");
  assertEquals(await repo.branch.list({ remotes: true }), [
    { name: "remote", commit },
    { name: "remote/branch", commit },
    { name: "remote/main", commit },
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

Deno.test("git().branch.current() returns current branch", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.switch("branch", { create: true });
  assertEquals(await repo.branch.current(), { name: "branch", commit });
});

Deno.test("git().branch.current() can return orphan branch", async () => {
  await using repo = await tempRepository({ branch: "main" });
  assertEquals(await repo.branch.current(), { name: "main" });
});

Deno.test("git().branch.current() rejects on detached state", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.detach();
  await assertRejects(
    () => repo.branch.current(),
    GitError,
    "Cannot determine HEAD branch",
  );
});

Deno.test("git().branch.get() returns branch by name", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.create("branch");
  assertEquals(await repo.branch.get("branch"), {
    name: "branch",
    commit,
  });
});

Deno.test("git().branch.get() returns tracked branch by name", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({ clone: upstream });
  await repo.branch.create("branch", { target: "origin/branch" });
  const remote = await repo.remote.get();
  assertExists(remote);
  const remoteBranch = await repo.branch.get("origin/branch");
  assertExists(remoteBranch);
  assertEquals(await repo.branch.get("branch"), {
    name: "branch",
    commit,
    fetch: { name: "branch", remote, branch: remoteBranch },
    push: { name: "branch", remote, branch: remoteBranch },
  });
});

Deno.test("git().branch.get() returns remote branch by name", async () => {
  await using upstream = await tempRepository({ branch: "main" });
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  assertEquals(await repo.branch.get("remote/main"), {
    name: "remote/main",
    commit,
  });
});

Deno.test("git().branch.get() returns undefined for unknown branch", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.branch.get("unknown"), undefined);
});

Deno.test("git().branch.switch() can switch to existing branch", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const main = await repo.branch.current();
  assertEquals(await repo.branch.current(), main);
  assertEquals(await repo.branch.switch(branch), branch);
  assertEquals(await repo.branch.current(), branch);
  assertEquals(await repo.commit.head(), commit1);
  assertEquals(await repo.branch.switch(main), main);
  assertEquals(await repo.branch.current(), main);
  assertEquals(await repo.commit.head(), commit2);
});

Deno.test("git().branch.switch() can switch to branch by name", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await repo.commit.create("commit2", { allowEmpty: true });
  const main = await repo.branch.current();
  assertEquals(await repo.branch.current(), main);
  assertEquals(await repo.branch.switch("branch"), branch);
  assertEquals(await repo.branch.current(), branch);
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.switch() rejects switching to non-branch reference", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  await assertRejects(
    () => repo.branch.switch(commit.hash),
    GitError,
    "a branch is expected, got commit",
  );
});

Deno.test("git().branch.switch() keeps working tree changes", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await repo.branch.switch(branch);
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content");
});

Deno.test("git().branch.switch() keeps index changes", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await repo.index.add("file.txt");
  await repo.branch.switch(branch);
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file.txt", status: "added" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().branch.switch() rejects when switching leads to loss", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  await repo.commit.create("commit1", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.commit.create("commit2", { all: true });
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  await assertRejects(
    () => repo.branch.switch(branch),
    GitError,
    "commit your changes or stash them before you switch branches",
  );
});

Deno.test("git().branch.switch({ create }) creates and switches to new branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  const main = await repo.branch.current();
  assertEquals(await repo.branch.list(), [main]);
  await repo.branch.switch("branch", { create: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const branch = await repo.branch.current();
  assertEquals(branch, { name: "branch", commit: commit2 });
  assertEquals(await repo.branch.current(), branch);
  assertEquals(await repo.branch.list(), [branch, main]);
  assertEquals(await repo.commit.head(), commit2);
});

Deno.test("git().branch.switch({ create }) rejects existing branch", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const main = await repo.branch.current();
  await assertRejects(
    () => repo.branch.switch(branch, { create: true }),
    GitError,
    "already exists",
  );
  assertEquals(await repo.branch.list(), [branch, main]);
  assertEquals(await repo.commit.head(), commit2);
  await repo.branch.switch(branch);
  assertEquals(await repo.branch.list(), [branch, main]);
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.switch({ create }) sets up tracking for remote branch", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({ clone: upstream });
  const remote = await repo.remote.get();
  assertExists(remote);
  const remoteBranch = await repo.branch.get("origin/branch");
  assertExists(remoteBranch);
  assertEquals(
    await repo.branch.switch("branch", { create: "origin/branch" }),
    {
      name: "branch",
      commit,
      fetch: { name: "branch", remote, branch: remoteBranch },
      push: { name: "branch", remote, branch: remoteBranch },
    },
  );
});

Deno.test("git().branch.switch({ force }) can create over existing branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  await repo.branch.create("branch");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  const main = await repo.branch.current();
  await repo.branch.switch("branch", { create: true, force: true });
  const branch = await repo.branch.current();
  assertEquals(await repo.branch.list(), [branch, main]);
  assertEquals(await repo.commit.head(), commit2);
});

Deno.test("git().branch.switch({ force }) ignores loss of local changes", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  await repo.commit.create("commit1", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.commit.create("commit2", { all: true });
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  await repo.branch.switch(branch, { force: true });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
});

Deno.test("git().branch.switch({ track }) can disable tracking", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({
    clone: upstream,
    config: { branch: { autoSetupMerge: "always" } },
  });
  const remote = await repo.remote.get();
  assertExists(remote);
  assertEquals(
    await repo.branch.switch("branch", {
      create: "origin/branch",
      track: false,
    }),
    { name: "branch", commit },
  );
});

Deno.test("git().branch.switch({ track }) can inherit source upstream", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("branch");
  await using repo = await tempRepository({
    clone: upstream,
    config: { branch: { autoSetupMerge: "always" } },
  });
  const remote = await repo.remote.get();
  assertExists(remote);
  const remoteMain = await repo.branch.get("origin/main");
  assertExists(remoteMain);
  assertEquals(
    await repo.branch.switch("branch", { create: "main", track: "inherit" }),
    {
      name: "branch",
      commit,
      fetch: { name: "main", remote, branch: remoteMain },
      push: { name: "main", remote, branch: remoteMain },
    },
  );
});

Deno.test("git().branch.detach() detaches", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  assertExists(await repo.branch.current());
  await repo.branch.detach();
  await assertRejects(() => repo.branch.current());
  assertEquals(await repo.commit.head(), commit);
});

Deno.test("git().branch.detach() detaches to a commit", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.head(), commit2);
  await repo.branch.detach({ target: commit1 });
  await assertRejects(() => repo.branch.current());
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.detach() detaches to a branch", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch = await repo.branch.create("branch");
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.head(), commit2);
  await repo.branch.detach({ target: branch });
  await assertRejects(() => repo.branch.current());
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.reset() resets branch to commit", async () => {
  await using repo = await tempRepository({ branch: "main" });
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  await repo.commit.create("commit2", { allowEmpty: true });
  const branch = await repo.branch.reset(commit1);
  assertEquals(await repo.branch.current(), branch);
  assertEquals(branch, { name: "main", commit: commit1 });
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.reset() can reset to branch", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const upstream = await repo.branch.create("branch1");
  await repo.commit.create("commit2", { allowEmpty: true });
  await repo.branch.reset(upstream);
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.reset() can reset to tag", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  await repo.commit.create("commit2", { allowEmpty: true });
  await repo.branch.reset(tag);
  assertEquals(await repo.commit.head(), commit1);
});

Deno.test("git().branch.reset({ mode }) can reset in soft mode", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.index.add("file.txt");
  await repo.commit.create("commit2");
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  await repo.branch.reset(commit1, { mode: "soft" });
  assertEquals(await repo.commit.head(), commit1);
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file.txt", status: "modified" }],
    unstaged: [{ path: "file.txt", status: "modified" }],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content3");
});

Deno.test("git().branch.reset({ mode }) can reset in mixed mode", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.index.add("file.txt");
  await repo.commit.create("commit2");
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  await repo.branch.reset(commit1, { mode: "mixed" });
  assertEquals(await repo.commit.head(), commit1);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file.txt", status: "modified" }],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content3");
});

Deno.test("git().branch.reset({ mode }) can reset in hard mode", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.index.add("file.txt");
  await repo.commit.create("commit2");
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  await repo.branch.reset(commit1, { mode: "hard" });
  assertEquals(await repo.commit.log(), [commit1]);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
});

Deno.test("git().branch.reset({ mode }) can reset in merge mode", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  const commit1 = await repo.commit.create("commit1");
  await repo.index.remove("file.txt");
  await repo.commit.create("commit2");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await assertRejects(() => repo.branch.reset(commit1, { mode: "merge" }));
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  await repo.branch.reset(commit1, { mode: "merge" });
  assertEquals(await repo.commit.log(), [commit1]);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
});

Deno.test("git().branch.reset({ mode }) can reset in keep mode", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.index.add("file.txt");
  await repo.commit.create("commit2");
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  await assertRejects(() => repo.branch.reset(commit1, { mode: "keep" }));
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.branch.reset(commit1, { mode: "keep" });
  assertEquals(await repo.commit.log(), [commit1]);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
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
  await assertRejects(
    () => repo.branch.delete(current),
    GitError,
    "used by worktree",
  );
});

Deno.test("git().branch.delete() can delete branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const current = await repo.branch.current();
  await repo.branch.detach();
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
  await repo.branch.switch("branch", { create: true });
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.switch(main);
  await assertRejects(
    () => repo.branch.delete("branch"),
    GitError,
    "not fully merged",
  );
});

Deno.test("git().branch.delete({ force }) can delete unmerged branch", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const main = await repo.branch.current();
  const branch = await repo.branch.switch("branch", { create: true });
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.branch.switch(main);
  await repo.branch.delete(branch, { force: true });
  assertEquals(await repo.branch.list(), [main]);
});

Deno.test("git().branch.track() sets upstream branch", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("target");
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const remote = await repo.remote.get({ remote: "remote" });
  assertExists(remote);
  const remoteTarget = await repo.branch.get("remote/target");
  assertExists(remoteTarget);
  const branch = await repo.branch.create("branch");
  await repo.branch.track(branch, "remote/target");
  assertEquals(await repo.branch.list({ name: "branch" }), [
    {
      name: "branch",
      commit,
      fetch: { name: "target", remote, branch: remoteTarget },
      push: { name: "target", remote, branch: remoteTarget },
    },
  ]);
});

Deno.test("git().branch.untrack() unsets upstream branch", async () => {
  await using upstream = await tempRepository();
  const commit = await upstream.commit.create("commit", { allowEmpty: true });
  await upstream.branch.create("target");
  await using repo = await tempRepository({
    clone: upstream,
    remote: "remote",
  });
  const remote = await repo.remote.get({ remote: "remote" });
  assertExists(remote);
  const remoteTarget = await repo.branch.get("remote/target");
  assertExists(remoteTarget);
  const branch = await repo.branch.create("branch", {
    target: "remote/target",
  });
  assertEquals(await repo.branch.list({ name: "branch" }), [
    {
      name: "branch",
      commit,
      fetch: { name: "target", remote, branch: remoteTarget },
      push: { name: "target", remote, branch: remoteTarget },
    },
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
  await Deno.writeTextFile(repo.path("source.file"), "content1");
  await repo.index.add("source.file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "content2");
  await Deno.writeTextFile(repo.path("copied.file"), "content1");
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
  await Deno.writeTextFile(repo.path("file"), "content1");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content2");
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
  assertEquals(
    await repo.index.status({ path: ["upstream", "dir*"] }),
    expected,
  );
  assertEquals(await repo.index.status({ path: "upstream" }), {
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
  await assertRejects(
    () => repo.index.add("file"),
    GitError,
    "did not match any files",
  );
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.add() rejects ignored file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await Deno.writeTextFile(repo.path(".gitignore"), "file");
  await repo.index.add(".gitignore");
  await repo.commit.create("commit");
  await assertRejects(
    () => repo.index.add("file"),
    GitError,
    "paths are ignored",
  );
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
  await repo.branch.detach({ target: commit });
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
  await repo.branch.detach({ target: commit });
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
  await assertRejects(
    () => repo.index.move("old.file", "new.file"),
    GitError,
    "bad source",
  );
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move() rejects untracked source file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await assertRejects(
    () => repo.index.move("old.file", "new.file"),
    GitError,
    "not under version control",
  );
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.move() rejects existing destination file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("old.file"), "content");
  await Deno.writeTextFile(repo.path("new.file"), "content");
  await repo.index.add("old.file");
  await repo.commit.create("commit");
  await assertRejects(
    () => repo.index.move("old.file", "new.file"),
    GitError,
    "destination exists",
  );
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
  await assertRejects(
    () => repo.index.remove("file"),
    GitError,
    "did not match any files",
  );
  assertEquals((await repo.index.status()).staged, []);
});

Deno.test("git().index.remove() rejects modified file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  await assertRejects(
    () => repo.index.remove("file"),
    GitError,
    "file has local modifications",
  );
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

Deno.test("git().index.restore() restores a file", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file.txt", status: "modified" }],
    untracked: [],
    ignored: [],
  });
  await repo.index.restore("file.txt");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
});

Deno.test("git().index.restore() can restore multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1.txt"), "content1");
  await Deno.writeTextFile(repo.path("file2.txt"), "content2");
  await repo.index.add(["file1.txt", "file2.txt"]);
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file1.txt"), "content3");
  await Deno.writeTextFile(repo.path("file2.txt"), "content4");
  await repo.index.restore(["file1.txt", "file2.txt"]);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file1.txt")), "content1");
  assertEquals(await Deno.readTextFile(repo.path("file2.txt")), "content2");
});

Deno.test("git().index.restore({ location }) can restore index", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.index.add("file.txt");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file.txt", status: "modified" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  await repo.index.restore("file.txt", { location: "index" });
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file.txt", status: "modified" }],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content2");
});

Deno.test("git().index.restore({ location }) can restore index and worktree", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  await repo.index.add("file.txt");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file.txt", status: "modified" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  await repo.index.restore("file.txt", { location: "both" });
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
});

Deno.test("git().index.restore({ location }) can revert new files", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await Deno.writeTextFile(repo.path("file.txt"), "content");
  await repo.index.add("file.txt");
  assertEquals(await repo.index.status(), {
    staged: [{ path: "file.txt", status: "added" }],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  await repo.index.restore("file.txt", { location: "index" });
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [{ path: "file.txt" }],
    ignored: [],
  });
});

Deno.test("git().index.restore({ source }) restores a file from commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file.txt"), "content1");
  await repo.index.add("file.txt");
  const commit1 = await repo.commit.create("commit1");
  await Deno.writeTextFile(repo.path("file.txt"), "content2");
  const commit2 = await repo.commit.create("commit2", { all: true });
  await Deno.writeTextFile(repo.path("file.txt"), "content3");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file.txt", status: "modified" }],
    untracked: [],
    ignored: [],
  });
  await repo.index.restore("file.txt", { source: commit1 });
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [{ path: "file.txt", status: "modified" }],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content1");
  await repo.index.restore("file.txt", { source: commit2 });
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
  assertEquals(await Deno.readTextFile(repo.path("file.txt")), "content2");
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
  await Deno.writeTextFile(repo.path("file"), "content1");
  await repo.index.add("file");
  const commit2 = await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content2");
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
  await Deno.writeTextFile(repo.path("source.file"), "content1");
  await repo.index.add("source.file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "content2");
  await Deno.writeTextFile(repo.path("copied.file"), "content1");
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
      "content1",
    ].join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    [
      "header",
      "content2",
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
            { type: "deleted", content: "content1" },
            { type: "info", content: "No newline at end of file" },
            { type: "added", content: "content2" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for file with whitespace in name", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file with spaces"), "content1\n");
  await repo.index.add("file with spaces");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file with spaces"), "content2\n");
  assertEquals(await repo.diff.patch(), [
    {
      path: "file with spaces",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "deleted", content: "content1" },
            { type: "added", content: "content2" },
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
    ["header", "content1", "\n".repeat(10), "content2", "footer", ""]
      .join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "content3", "\n".repeat(10), "content4", "footer", ""]
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
            { type: "deleted", content: "content1" },
            { type: "added", content: "content3" },
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
            { type: "deleted", content: "content2" },
            { type: "added", content: "content4" },
            { type: "context", content: "footer" },
          ],
        },
      ],
    },
  ]);
});

Deno.test("git().diff.patch() generates patch for multiple files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), ["content1", ""].join("\n"));
  await Deno.writeTextFile(repo.path("file2"), ["content2", ""].join("\n"));
  await repo.index.add(["file1", "file2"]);
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file1"), ["content3", ""].join("\n"));
  await Deno.writeTextFile(repo.path("file2"), ["content4", ""].join("\n"));
  assertEquals(await repo.diff.patch(), [
    {
      path: "file1",
      status: "modified",
      mode: { new: 0o100644 },
      hunks: [
        {
          line: { old: 1, new: 1 },
          lines: [
            { type: "deleted", content: "content1" },
            { type: "added", content: "content3" },
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
            { type: "deleted", content: "content2" },
            { type: "added", content: "content4" },
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
    ["header", "content1", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  const commit1 = await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "content2", "footer", ""].join("\n"),
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
              { type: "deleted", content: "content1" },
              { type: "added", content: "content2" },
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
  await Deno.writeTextFile(repo.path("source.file"), "content1\n");
  await repo.index.add("source.file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("source.file"), "content2\n");
  await Deno.writeTextFile(repo.path("copied.file"), "content1\n");
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
              { type: "added", content: "content1" },
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
              { type: "deleted", content: "content1" },
              { type: "added", content: "content2" },
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
              { type: "deleted", content: "content1" },
              { type: "added", content: "content2" },
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
    ["header", "content1", "footer", ""].join("\n"),
  );
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(
    repo.path("file"),
    ["header", "content2", "footer", ""].join("\n"),
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
            { type: "deleted", content: "content1" },
            { type: "added", content: "content2" },
          ],
        },
      ],
    },
  ]);
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

Deno.test("git().commit.create() rejects empty summary", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.create("", { allowEmpty: true }),
    GitError,
    "empty commit message",
  );
});

Deno.test("git().commit.create() rejects empty commit", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.create("commit"),
    GitError,
    "nothing to commit",
  );
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

Deno.test("git().commit.create({ all }) automatically stages files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content1");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "content2");
  const commit = await repo.commit.create("commit", { all: true });
  assertEquals(await repo.commit.head(), commit);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().commit.create({ all }) can automatically remove files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  const commit = await repo.commit.create("commit", { all: true });
  assertEquals(await repo.commit.head(), commit);
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
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
    author: { name: "upstream", email: "upstream@example.com" },
  });
  assertEquals(commit?.committer, {
    name: "name",
    email: "email@example.com",
  });
});

Deno.test("git().commit.create({ sign }) cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.create("commit", { allowEmpty: true, sign: "not-a-key" }),
    GitError,
    "gpg failed to sign",
  );
});

Deno.test("git().commit.amend() amends last commit without changing message", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file1"), "content");
  await repo.index.add("file1");
  const original = await repo.commit.create("summary", { body: "body" });
  await Deno.writeTextFile(repo.path("file2"), "content");
  await repo.index.add("file2");
  const amended = await repo.commit.amend();
  assertEquals(amended.summary, "summary");
  assertEquals(amended.body, "body");
  assertNotEquals(amended.hash, original.hash);
  assertEquals(await repo.commit.log(), [amended]);
});

Deno.test("git().commit.amend() rejects empty repository", async () => {
  await using repo = await tempRepository();
  await assertRejects(
    () => repo.commit.amend(),
    GitError,
    "nothing to amend",
  );
});

Deno.test("git().commit.amend({ summary }) changes the commit message", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const commit = await repo.commit.create("summary");
  const amended = await repo.commit.amend({ summary: "new summary" });
  assertEquals(amended.summary, "new summary");
  assertNotEquals(amended.hash, commit.hash);
});

Deno.test("git().commit.amend({ summary }) overrides commit body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  const original = await repo.commit.create("summary", { body: "body" });
  const amended = await repo.commit.amend({ summary: "new summary" });
  assertEquals(amended.summary, "new summary");
  assertEquals(amended.body, undefined);
  assertNotEquals(amended.hash, original.hash);
});

Deno.test("git().commit.amend({ summary }) rejects empty summary", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("summary");
  await assertRejects(
    () => repo.commit.amend({ summary: "" }),
    GitError,
    "empty commit message",
  );
});

Deno.test("git().commit.amend({ body }) changes the commit body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("summary");
  const amended = await repo.commit.amend({
    summary: "new summary",
    body: "new body",
  });
  assertEquals(amended.summary, "new summary");
  assertEquals(amended.body, "new body");
});

Deno.test("git().commit.amend({ body }) does not update commit summary", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("summary");
  const amended = await repo.commit.amend({ body: "new body" });
  assertEquals(amended.summary, "summary");
  assertEquals(amended.body, "new body");
});

Deno.test("git().commit.amend({ body }) overrides commit trailers", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("summary", { trailers: { key: "value" } });
  const amended = await repo.commit.amend({ body: "new body" });
  assertEquals(amended.summary, "summary");
  assertEquals(amended.body, "new body");
  assertEquals(amended.trailers, {});
});

Deno.test("git().commit.amend({ trailers }) adds trailers to commit", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("summary");
  const amended = await repo.commit.amend({
    summary: "summary",
    body: "body",
    trailers: { key: "value" },
  });
  assertEquals(amended.summary, "summary");
  assertEquals(amended.body, "body");
  assertEquals(amended.trailers, { key: "value" });
});

Deno.test("git().commit.amend({ trailers }) does not update commit summary or body", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("summary", { body: "body" });
  const amended = await repo.commit.amend({ trailers: { key: "value" } });
  assertEquals(amended.summary, "summary");
  assertEquals(amended.body, "body");
  assertEquals(amended.trailers, { key: "value" });
});

Deno.test("git().commit.amend({ all }) automatically stages files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.writeTextFile(repo.path("file"), "modified content");
  const amended = await repo.commit.amend({ all: true });
  assertEquals(amended.summary, "commit");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().commit.amend({ all }) can automatically remove files", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await Deno.remove(repo.path("file"));
  const amended = await repo.commit.amend({ all: true, allowEmpty: true });
  assertEquals(amended.summary, "commit");
  assertEquals(await repo.index.status(), {
    staged: [],
    unstaged: [],
    untracked: [],
    ignored: [],
  });
});

Deno.test("git().commit.amend({ author }) changes the author", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  const amended = await repo.commit.amend({
    author: { name: "new name", email: "new@example.com" },
  });
  assertEquals(amended.author, {
    name: "new name",
    email: "new@example.com",
  });
});

Deno.test("git().commit.amend({ sign }) cannot use wrong key", async () => {
  await using repo = await tempRepository();
  await Deno.writeTextFile(repo.path("file"), "content");
  await repo.index.add("file");
  await repo.commit.create("commit");
  await assertRejects(
    () => repo.commit.amend({ sign: "not-a-key" }),
    GitError,
    "gpg failed to sign",
  );
});

Deno.test("git().commit.log() return empty on empty repository", async () => {
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
    author: { name: "upstream", email: "upstream@example.com" },
    allowEmpty: true,
  });
  await repo.config.set({
    user: { name: "name2", email: "email2@example.com" },
  });
  const commit2 = await repo.commit.create("commit2", {
    author: { name: "upstream", email: "upstream@example.com" },
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

Deno.test("git().commit.head() rejects empty repository", async () => {
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

Deno.test("git().commit.get() returns a commit by hash", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.get(commit1.hash), commit1);
  assertEquals(await repo.commit.get(commit2.hash), commit2);
});

Deno.test("git().commit.get() returns a commit by short hash", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  assertEquals(await repo.commit.get(commit.short), commit);
});

Deno.test("git().commit.get() returns a commit by branch", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  const branch1 = await repo.branch.current();
  await repo.branch.switch("branch2", { create: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.get(branch1), commit1);
  assertEquals(await repo.commit.get("branch2"), commit2);
});

Deno.test("git().commit.get() returns a commit by tag", async () => {
  await using repo = await tempRepository();
  const commit = await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("v1.0.0");
  assertEquals(await repo.commit.get(tag), commit);
  assertEquals(await repo.commit.get("v1.0.0"), commit);
});

Deno.test("git().commit.get() returns a commit by special symbol", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit1", { allowEmpty: true });
  const commit2 = await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.get("HEAD"), commit2);
});

Deno.test("git().commit.get() returns a commit by relative reference", async () => {
  await using repo = await tempRepository();
  const commit1 = await repo.commit.create("commit1", { allowEmpty: true });
  await repo.commit.create("commit2", { allowEmpty: true });
  assertEquals(await repo.commit.get("HEAD~1"), commit1);
});

Deno.test("git().commit.get() handles non-existent commit", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.commit.get("unknown"), undefined);
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
  await assertRejects(
    () => repo.tag.create("tag", { sign: true }),
    GitError,
    "no tag message",
  );
});

Deno.test("git().tag.create() cannot create duplicate tag", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await repo.tag.create("tag");
  await assertRejects(
    () => repo.tag.create("tag"),
    GitError,
    "already exists",
  );
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
  await repo.commit.create("commit", { allowEmpty: true });
  await assertRejects(
    () => repo.tag.create("tag", { subject: "subject", sign: "not-a-key" }),
    GitError,
    "gpg failed to sign",
  );
});

Deno.test("git().tag.list() returns empty list on empty repository", async () => {
  await using repo = await tempRepository();
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().tag.list() returns empty list on repository with no tags", async () => {
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

Deno.test("git().tag.delete() deletes a tag", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const tag2 = await repo.tag.create("tag2");
  assertEquals(await repo.tag.list(), [tag1, tag2]);
  await repo.tag.delete(tag1);
  assertEquals(await repo.tag.list(), [tag2]);
  await repo.tag.delete(tag2);
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().tag.delete() can delete tag by name", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  const tag1 = await repo.tag.create("tag1");
  const tag2 = await repo.tag.create("tag2");
  assertEquals(await repo.tag.list(), [tag1, tag2]);
  await repo.tag.delete("tag1");
  assertEquals(await repo.tag.list(), [tag2]);
  await repo.tag.delete("tag2");
  assertEquals(await repo.tag.list(), []);
});

Deno.test("git().tag.delete() rejects non-existent tag", async () => {
  await using repo = await tempRepository();
  await repo.commit.create("commit", { allowEmpty: true });
  await assertRejects(
    () => repo.tag.delete("unknown"),
    GitError,
    "not found",
  );
});

Deno.test("git().tag.push() can push tag to remote", async () => {
  await using upstream = await tempRepository({ bare: true });
  await using repo = await tempRepository({ clone: upstream });
  await repo.commit.create("commit", { allowEmpty: true });
  const tag = await repo.tag.create("tag");
  await repo.tag.push(tag);
  assertEquals(await upstream.tag.list(), [tag]);
});

Deno.test("git().tag.push() cannot override remote tag", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: upstream });
  await upstream.commit.create("new", { allowEmpty: true });
  await upstream.tag.create("tag");
  await repo.tag.create("tag");
  await assertRejects(
    () => repo.tag.push("tag"),
    GitError,
    "already exists",
  );
});

Deno.test("git().tag.push({ force }) force overrides remote tag", async () => {
  await using upstream = await tempRepository();
  await upstream.commit.create("commit", { allowEmpty: true });
  await using repo = await tempRepository({ clone: upstream });
  await upstream.commit.create("new", { allowEmpty: true });
  await upstream.tag.create("tag");
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
